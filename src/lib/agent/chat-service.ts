import { generateText } from 'ai';
import type { AgentResponse } from '../../types/agent';
import { AIConfigError, readAIConfigSummary } from '../ai/config';
import {
  resolveLanguageModelContext,
  type ResolvedLanguageModel,
} from '../ai/provider';
import { logAgentError } from '../observability/agent-log';
import type { AgentGalaxy } from './navigation-resolver';

export interface ChatServiceInput {
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

async function loadGalaxyData() {
  const { getGalaxyData } = await import('../galaxy-data');
  return getGalaxyData();
}

function getGardenCatalog(galaxy: AgentGalaxy) {
  return galaxy.stars
    .map((star) => {
      const planets = star.planets
        .map((planet) => `  - ${planet.name}（planet:${planet.id}）`)
        .join('\n');

      return `- ${star.name}（star:${star.id}）\n${planets}`;
    })
    .join('\n');
}

function createChatSystemPrompt(galaxy: AgentGalaxy) {
  return [
    '你是戴森球主脑兼塔迪斯矩阵，负责介绍这个数字花园并回答访客问题。',
    '你当前只负责解释、总结、推荐与介绍，不负责决定页面跳转。',
    '如果用户提到不存在的领域或星球，不要编造，请明确说明当前可用范围。',
    '当前星图目录：',
    getGardenCatalog(galaxy),
    '回答要求：简洁、准确、面向访客，不要虚构未提供的内容。',
  ].join('\n');
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
  loadGalaxy?: () => Promise<AgentGalaxy>;
  resolveModel?: () => ResolvedLanguageModel;
  textGenerator?: typeof generateText;
} = {}): ChatService {
  const {
    loadGalaxy = loadGalaxyData,
    resolveModel = resolveLanguageModelContext,
    textGenerator = generateText,
  } = options;

  return {
    async respond({ message, requestId }) {
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

      const galaxy = await loadGalaxy();

      try {
        const result = await textGenerator({
          model: modelContext.model,
          prompt: normalizedMessage,
          system: createChatSystemPrompt(galaxy),
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
