import { generateText, stepCountIs, tool, type LanguageModel } from 'ai';
import { z } from 'zod';
import type { AgentResponse, TeleportAction } from '../../types/agent';
import { AIConfigError } from '../ai/config';
import { resolveLanguageModel } from '../ai/provider';
import type { HydratedGalaxy, HydratedPlanet, HydratedStar } from '../galaxy-model';

export type AgentGalaxy = Pick<HydratedGalaxy, 'stars'>;

export interface AgentServiceInput {
  message: string;
}

export interface AgentServiceResult {
  status: 200 | 422 | 500 | 503;
  response: AgentResponse;
}

export interface AgentService {
  respond(input: AgentServiceInput): Promise<AgentServiceResult>;
}

const EMPTY_MESSAGE_RESPONSE: AgentResponse = {
  message: '`message` is required.',
  action: null,
};

const GENERATION_FAILED_MESSAGE =
  '[agent unavailable] failed to reach the Dyson command relay.';

const FALLBACK_RESPONSE_MESSAGE =
  '当前指令还没有对应的星区，我可以带你前往工程、哲学或 ACG 领域。';

const TELEPORT_TOOL_NAME = 'teleport_engine';

const teleportToolInputSchema = z.object({
  targetId: z.string().min(1),
});

const NAVIGATION_INTENT_PATTERNS = [
  /带我去/i,
  /带我到/i,
  /前往/i,
  /导航到/i,
  /跳转到/i,
  /跳到/i,
  /传送到/i,
  /跃迁到/i,
  /进入/i,
  /打开/i,
  /go to/i,
  /take me to/i,
  /teleport/i,
  /warp to/i,
  /visit/i,
];

async function loadGalaxyData() {
  const { getGalaxyData } = await import('../galaxy-data');
  return getGalaxyData();
}

export function normalizeAgentMessage(message: string) {
  return message.trim();
}

export function shouldRequireTeleportTool(message: string) {
  return NAVIGATION_INTENT_PATTERNS.some((pattern) => pattern.test(message));
}

function getTeleportCatalog(galaxy: AgentGalaxy) {
  return galaxy.stars
    .map((star) => {
      const starAliases = [star.id, star.name, ...star.aliases].join(', ');
      const planets = star.planets
        .map((planet) => {
          const planetAliases = [planet.id, planet.name, ...planet.aliases].join(
            ', ',
          );
          return `  - planet:${planet.id} | name:${planet.name} | aliases:${planetAliases}`;
        })
        .join('\n');

      return `- star:${star.id} | name:${star.name} | aliases:${starAliases}\n${planets}`;
    })
    .join('\n');
}

function normalizeTargetKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function stripTargetQualifier(value: string) {
  return value.replace(/^(star|planet)\s*:\s*/i, '').trim();
}

function getTargetMatchScore(query: string, candidate: string) {
  if (!query || !candidate) {
    return 0;
  }

  if (query === candidate) {
    return 4;
  }

  if (query.startsWith(candidate) || query.endsWith(candidate)) {
    return 3;
  }

  if (query.includes(candidate)) {
    return 2;
  }

  if (candidate.includes(query)) {
    return 1;
  }

  return 0;
}

function createSystemPrompt(galaxy: AgentGalaxy) {
  return [
    '你是戴森球主脑兼塔迪斯矩阵，负责解释数字花园并在必要时发起星系跃迁。',
    `如果访客的意图是前往某个领域、星球、专题或展馆，你必须调用 ${TELEPORT_TOOL_NAME} 工具。`,
    `调用 ${TELEPORT_TOOL_NAME} 时只能使用下面星图目录中的精确 targetId，绝不能编造新的 targetId。`,
    '如果用户只是闲聊、提问或总结内容，不要调用工具，直接回复文本。',
    '如果用户要去的地方不存在，请明确说明无法定位，并给出可用领域提示。',
    '当前星图目录：',
    getTeleportCatalog(galaxy),
  ].join('\n');
}

function findStarTarget(
  galaxy: AgentGalaxy,
  targetId: string,
): HydratedStar | null {
  const normalizedTarget = normalizeTargetKey(stripTargetQualifier(targetId));
  const starMatches = galaxy.stars
    .map((star) => {
      const candidateKeys = [star.id, star.name, ...star.aliases]
        .map(normalizeTargetKey)
        .filter(Boolean);
      const bestScore = candidateKeys.reduce((score, candidate) => {
        return Math.max(score, getTargetMatchScore(normalizedTarget, candidate));
      }, 0);

      return {
        score: bestScore,
        star,
      };
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);

  return starMatches[0]?.star ?? null;
}

function findPlanetTarget(
  galaxy: AgentGalaxy,
  targetId: string,
): HydratedPlanet | null {
  const normalizedTarget = normalizeTargetKey(stripTargetQualifier(targetId));
  const planetMatches = galaxy.stars
    .flatMap((star) => star.planets)
    .map((planet) => {
      const candidateKeys = [planet.id, planet.name, ...planet.aliases]
        .map(normalizeTargetKey)
        .filter(Boolean);
      const bestScore = candidateKeys.reduce((score, candidate) => {
        return Math.max(score, getTargetMatchScore(normalizedTarget, candidate));
      }, 0);

      return {
        planet,
        score: bestScore,
      };
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);

  return planetMatches[0]?.planet ?? null;
}

export function resolveTeleportAction(
  galaxy: AgentGalaxy,
  targetId: string,
): TeleportAction | null {
  const starTarget = findStarTarget(galaxy, targetId);
  if (starTarget) {
    return {
      type: 'TELEPORT',
      targetId: starTarget.id,
      targetType: 'star',
    };
  }

  const planetTarget = findPlanetTarget(galaxy, targetId);
  if (planetTarget) {
    return {
      type: 'TELEPORT',
      targetId: planetTarget.id,
      targetType: 'planet',
    };
  }

  return null;
}

function normalizeAgentResponseMessage(
  message: string,
  action: TeleportAction | null,
) {
  const normalizedMessage = message.trim();
  if (normalizedMessage) {
    return normalizedMessage;
  }

  if (action) {
    return '跃迁坐标已锁定，准备执行传送。';
  }

  return FALLBACK_RESPONSE_MESSAGE;
}

function isAIConfigError(error: unknown): error is AIConfigError {
  return (
    error instanceof AIConfigError ||
    (error instanceof Error && error.name === 'AIConfigError')
  );
}

export function createAgentService(options: {
  loadGalaxy?: () => Promise<AgentGalaxy>;
  resolveModel?: () => LanguageModel;
  textGenerator?: typeof generateText;
} = {}): AgentService {
  const {
    loadGalaxy = loadGalaxyData,
    resolveModel = resolveLanguageModel,
    textGenerator = generateText,
  } = options;

  return {
    async respond({ message }) {
      const normalizedMessage = normalizeAgentMessage(message);
      if (!normalizedMessage) {
        return {
          status: 422,
          response: EMPTY_MESSAGE_RESPONSE,
        };
      }

      let model: LanguageModel;

      try {
        model = resolveModel();
      } catch (error) {
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
      let resolvedAction: TeleportAction | null = null;

      try {
        const result = await textGenerator({
          model,
          prompt: normalizedMessage,
          stopWhen: stepCountIs(2),
          system: createSystemPrompt(galaxy),
          toolChoice: shouldRequireTeleportTool(normalizedMessage)
            ? 'required'
            : 'auto',
          tools: {
            [TELEPORT_TOOL_NAME]: tool({
              description:
                '当用户明确表示要前往某个领域、星球、专题或展馆时，调用此工具执行跃迁。',
              inputSchema: teleportToolInputSchema,
              async execute({ targetId }) {
                const action = resolveTeleportAction(galaxy, targetId);
                resolvedAction = action;

                if (!action) {
                  return {
                    ok: false,
                    error: `Unknown targetId: ${targetId}`,
                  };
                }

                return {
                  ok: true,
                  action,
                };
              },
            }),
          },
        });

        return {
          status: 200,
          response: {
            message: normalizeAgentResponseMessage(result.text, resolvedAction),
            action: resolvedAction,
          },
        };
      } catch (error) {
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

export const agentService = createAgentService();
