import { generateText } from 'ai';
import type { AgentResponse } from '../../types/agent';
import type { AgentRequestContextInput } from '../../types/agent-context';
import { AIConfigError, readAIConfigSummary } from '../ai/config';
import {
  resolveLanguageModelContext,
  type ResolvedLanguageModel,
} from '../ai/provider';
import { logAgentError } from '../observability/agent-log';
import {
  resolveInteractionIntent,
  type InteractionIntent,
} from './content-intent';
import type { LoadedAgentContext } from './context-loader';
import type { KnowledgeSearchMatch } from './knowledge-search';

export interface ChatServiceInput {
  context?: AgentRequestContextInput;
  message: string;
  requestId?: string;
}

export interface ChatServiceResult {
  status: 200 | 422 | 500 | 503;
  response: AgentResponse;
}

export interface ChatService {
  respond(input: ChatServiceInput): Promise<ChatServiceResult>;
}

const EMPTY_MESSAGE_RESPONSE: AgentResponse = {
  message: '`message` is required.',
  action: null,
};

const GENERATION_FAILED_MESSAGE =
  '[agent unavailable] failed to reach the Dyson command relay.';

const EMPTY_CHAT_RESPONSE =
  '我还没有整理好这次回答，你可以换个问法继续问我关于这个数字花园。';
const SEMANTIC_RETRIEVAL_TIMEOUT_MS = 350;

const NODE_BODY_LIMIT = 1200;

async function loadStructuredAgentContext(
  input?: AgentRequestContextInput,
) {
  const { loadAgentContext } = await import('./context-loader');
  return loadAgentContext(input);
}

async function loadSemanticKnowledge(input: {
  context?: AgentRequestContextInput;
  query: string;
}) {
  const { searchKnowledge } = await import('./knowledge-search');
  return searchKnowledge(input);
}

async function searchKnowledgeWithTimeout(
  searchKnowledge: (input: {
    context?: AgentRequestContextInput;
    query: string;
  }) => Promise<KnowledgeSearchMatch[]>,
  input: {
    context?: AgentRequestContextInput;
    query: string;
  },
) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      searchKnowledge(input),
      new Promise<KnowledgeSearchMatch[]>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new Error(
              `semantic retrieval timed out after ${SEMANTIC_RETRIEVAL_TIMEOUT_MS}ms`,
            ),
          );
        }, SEMANTIC_RETRIEVAL_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function formatTags(tags: string[]) {
  return tags.length > 0 ? ` [tags: ${tags.join(', ')}]` : '';
}

function truncateBody(body?: string) {
  if (!body) {
    return undefined;
  }

  const normalizedBody = body.trim();
  if (!normalizedBody) {
    return undefined;
  }

  if (normalizedBody.length <= NODE_BODY_LIMIT) {
    return normalizedBody;
  }

  return `${normalizedBody.slice(0, NODE_BODY_LIMIT)}…`;
}

function renderGlobalOverview(
  context: LoadedAgentContext,
  verbosity: 'compact' | 'full' = 'full',
) {
  return [
    '全站概览：',
    ...context.globalOverview.stars.map(
      (star) => {
        if (verbosity === 'compact') {
          return `- ${star.name}（star:${star.id}）: ${star.planetCount} 个星球，${star.nodeCount} 篇节点。`;
        }

        return `- ${star.name}（star:${star.id}）: ${star.description}。包含 ${star.planetCount} 个星球，${star.nodeCount} 篇节点。`;
      },
    ),
  ].join('\n');
}

function renderCurrentStar(context: LoadedAgentContext) {
  if (!context.currentStar) {
    return undefined;
  }

  return [
    '当前恒星：',
    `- ${context.currentStar.name}（star:${context.currentStar.id}）: ${context.currentStar.description}`,
  ].join('\n');
}

function renderCurrentPlanet(context: LoadedAgentContext) {
  if (!context.currentPlanet) {
    return undefined;
  }

  const sections = [
    '当前星球：',
    `- ${context.currentPlanet.name}（planet:${context.currentPlanet.id}，pageType:${context.currentPlanet.pageType}）: ${context.currentPlanet.description}`,
  ];

  if (context.currentPlanet.nodes.length > 0) {
    sections.push(
      '当前星球节点：',
      ...context.currentPlanet.nodes.map(
        (node) =>
          `- ${node.title}（slug:${node.slug}）: ${node.summary}${formatTags(node.tags)}`,
      ),
    );
  }

  if (context.currentPlanet.highlights?.length) {
    sections.push(
      '当前星球展品亮点：',
      ...context.currentPlanet.highlights.map((highlight) => {
        const tagSuffix = highlight.tag ? ` [tag: ${highlight.tag}]` : '';
        return `- ${highlight.title}: ${highlight.summary}${tagSuffix}`;
      }),
    );
  }

  return sections.join('\n');
}

function renderCurrentNode(context: LoadedAgentContext) {
  if (!context.currentNode) {
    return undefined;
  }

  const sections = [
    '当前文章：',
    `- ${context.currentNode.title}（slug:${context.currentNode.slug}）: ${context.currentNode.summary}${formatTags(context.currentNode.tags)}`,
  ];

  const bodyExcerpt = truncateBody(context.currentNode.body);
  if (bodyExcerpt) {
    sections.push('当前文章正文摘录：', bodyExcerpt);
  }

  return sections.join('\n');
}

function renderStructuredContext(
  intent: InteractionIntent,
  context: LoadedAgentContext,
) {
  const globalOverviewVerbosity =
    intent === 'content_understanding' && context.scope === 'node'
      ? 'compact'
      : 'full';

  return [
    renderCurrentNode(context),
    renderCurrentPlanet(context),
    renderCurrentStar(context),
    renderGlobalOverview(context, globalOverviewVerbosity),
  ]
    .filter((section): section is string => Boolean(section))
    .join('\n\n');
}

function renderKnowledgeMatches(matches: KnowledgeSearchMatch[]) {
  if (matches.length === 0) {
    return undefined;
  }

  return [
    '语义检索补充：',
    ...matches.slice(0, 3).map((match, index) => {
      return `- 片段 ${index + 1}（相似度 ${match.similarity.toFixed(3)}）: ${match.contentChunk}`;
    }),
  ].join('\n');
}

function createIntentRules(
  intent: InteractionIntent,
  context: LoadedAgentContext,
) {
  switch (intent) {
    case 'navigation':
      return [
        '如果用户其实是在请求跳转，只能解释当前可用范围或建议使用明确导航指令。',
        '不要在聊天链路里承诺已经执行页面跳转。',
      ].join('\n');
    case 'onboarding':
      switch (context.scope) {
        case 'node':
          return [
            '先解释当前文章位于哪里，再给出 2 到 4 条继续阅读路线。',
            '路线可以从当前文章扩展到当前星球和全站，但不要把它写成当前文章总结。',
          ].join('\n');
        case 'planet':
          return [
            '先解释当前星球适合怎么逛，再补充它和全站其他板块的关系。',
            '回答要像导览，不要把它写成纯摘要。',
          ].join('\n');
        case 'hub':
          return [
            '优先介绍整个花园的结构和建议入口，再给出 2 到 4 条适合第一次进入的路线。',
            '不要假装已经替用户执行跳转。',
          ].join('\n');
      }
    case 'content_understanding':
      switch (context.scope) {
        case 'node':
          return [
            '只总结当前文章。',
            '除非用户明确追问当前星球或全站，否则不要把回答扩展到整个花园。',
          ].join('\n');
        case 'planet':
          return [
            '优先总结当前星球。',
            '可以简短说明它在全站中的位置，但主体仍然是当前星球内容。',
          ].join('\n');
        case 'hub':
          return [
            '当前没有单篇文章或单个星球上下文。',
            '如果用户要求“总结当前页面”，请明确说明当前位于首页，并改为介绍整个花园结构。',
          ].join('\n');
      }
    case 'recommendation':
      return [
        '如果用户在要推荐，请优先说明推荐对象和推荐理由。',
        '不要假装已经执行页面跳转，也不要编造不存在的文章或星球。',
      ].join('\n');
    case 'discovery':
      return [
        '如果用户在问最近更新、关键节点或内容关系，请优先基于现有结构化上下文回答。',
        '不要假装有实时更新流，只能基于现有内容时间戳和关系线索。',
      ].join('\n');
    case 'general_chat':
      return [
        '优先基于当前作用域回答，再按需要补充全站概览。',
        '如果问题超出当前提供的上下文范围，要明确说出边界。',
      ].join('\n');
  }
}

function createChatSystemPrompt(
  intent: InteractionIntent,
  context: LoadedAgentContext,
  knowledgeMatches: KnowledgeSearchMatch[] = [],
) {
  return [
    '你是戴森球主脑兼塔迪斯矩阵，负责介绍这个数字花园并回答访客问题。',
    '你当前只负责解释、总结、推荐与介绍，不负责决定页面跳转。',
    '如果用户提到不存在的领域或星球，不要编造，请明确说明当前可用范围。',
    `交互意图：${intent}`,
    `当前作用域：${context.scope}`,
    createIntentRules(intent, context),
    '结构化上下文：',
    renderStructuredContext(intent, context),
    renderKnowledgeMatches(knowledgeMatches),
    '回答要求：简洁、准确、面向访客，不要虚构未提供的内容。',
  ].join('\n\n');
}

function normalizeChatResponseMessage(message: string) {
  const normalizedMessage = message.trim();
  return normalizedMessage || EMPTY_CHAT_RESPONSE;
}

function isAIConfigError(error: unknown): error is AIConfigError {
  return (
    error instanceof AIConfigError ||
    (error instanceof Error && error.name === 'AIConfigError')
  );
}

export function createChatService(options: {
  loadContext?: (
    input?: AgentRequestContextInput,
  ) => Promise<LoadedAgentContext>;
  resolveModel?: () => ResolvedLanguageModel;
  searchKnowledge?: (input: {
    context?: AgentRequestContextInput;
    query: string;
  }) => Promise<KnowledgeSearchMatch[]>;
  textGenerator?: typeof generateText;
} = {}): ChatService {
  const {
    loadContext = loadStructuredAgentContext,
    resolveModel = resolveLanguageModelContext,
    searchKnowledge = loadSemanticKnowledge,
    textGenerator = generateText,
  } = options;

  return {
    async respond({ context, message, requestId }) {
      const normalizedMessage = message.trim();
      if (!normalizedMessage) {
        return {
          status: 422,
          response: EMPTY_MESSAGE_RESPONSE,
        };
      }

      const configSummary = (() => {
        try {
          return readAIConfigSummary();
        } catch {
          return {
            model: undefined,
            provider: undefined,
          };
        }
      })();

      let modelContext: ResolvedLanguageModel;

      try {
        modelContext = resolveModel();
      } catch (error) {
        if (requestId) {
          logAgentError(error, {
            model: configSummary.model,
            provider: configSummary.provider,
            requestId,
            status: isAIConfigError(error) ? 503 : 500,
          });
        }

        if (isAIConfigError(error)) {
          return {
            status: 503,
            response: {
              message: `[agent unavailable] ${error.message}`,
              action: null,
            },
          };
        }

        return {
          status: 500,
          response: {
            message:
              error instanceof Error && error.message.trim()
                ? `[agent unavailable] ${error.message.trim()}`
                : GENERATION_FAILED_MESSAGE,
            action: null,
          },
        };
      }

      try {
        const structuredContext = await loadContext(context);
        const interactionIntent = resolveInteractionIntent(normalizedMessage);
        let knowledgeMatches: KnowledgeSearchMatch[] = [];

        if (
          interactionIntent === 'content_understanding' &&
          structuredContext.scope !== 'node'
        ) {
          try {
            knowledgeMatches = await searchKnowledgeWithTimeout(searchKnowledge, {
              context,
              query: normalizedMessage,
            });
          } catch (error) {
            console.error(
              '[semantic retrieval unavailable]',
              error instanceof Error ? error.message : String(error),
            );
            knowledgeMatches = [];
          }
        }

        const result = await textGenerator({
          model: modelContext.model,
          prompt: normalizedMessage,
          system: createChatSystemPrompt(
            interactionIntent,
            structuredContext,
            knowledgeMatches,
          ),
        });

        return {
          status: 200,
          response: {
            action: null,
            message: normalizeChatResponseMessage(result.text),
          },
        };
      } catch (error) {
        if (requestId) {
          logAgentError(error, {
            model: modelContext.config.model,
            provider: modelContext.config.provider,
            requestId,
            status: 500,
          });
        }

        return {
          status: 500,
          response: {
            message:
              error instanceof Error && error.message.trim()
                ? `[agent unavailable] ${error.message.trim()}`
                : GENERATION_FAILED_MESSAGE,
            action: null,
          },
        };
      }
    },
  };
}

export const chatService = createChatService();
