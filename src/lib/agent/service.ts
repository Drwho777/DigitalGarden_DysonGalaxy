import type { AgentResponse } from '../../types/agent';
import type { AgentRequestContextInput } from '../../types/agent-context';
import { chatService, type ChatService } from './chat-service';
import { resolveInteractionIntent } from './content-intent';
import {
  isNavigationIntent,
  resolveNavigationRequest,
  type NavigationResolution,
} from './navigation-resolver';
import type { AgentGalaxy } from './navigation-resolver';
import {
  recommendationService,
  type RecommendationService,
} from './recommendation-service';

export interface AgentServiceInput {
  context?: AgentRequestContextInput;
  message: string;
  requestId?: string;
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

async function loadGalaxyData() {
  const { getGalaxyData } = await import('../galaxy-data');
  return getGalaxyData();
}

export function normalizeAgentMessage(message: string) {
  return message.trim();
}

export const shouldRequireTeleportTool = isNavigationIntent;

export function createAgentService(options: {
  chatResponder?: ChatService;
  loadGalaxy?: () => Promise<AgentGalaxy>;
  recommendationResponder?: RecommendationService;
  resolveNavigation?: (
    galaxy: AgentGalaxy,
    message: string,
  ) => NavigationResolution;
} = {}): AgentService {
  const {
    chatResponder = chatService,
    loadGalaxy = loadGalaxyData,
    recommendationResponder = recommendationService,
    resolveNavigation = resolveNavigationRequest,
  } = options;

  return {
    async respond({ context, message, requestId }) {
      const normalizedMessage = normalizeAgentMessage(message);
      if (!normalizedMessage) {
        return {
          status: 422,
          response: EMPTY_MESSAGE_RESPONSE,
        };
      }

      if (isNavigationIntent(normalizedMessage)) {
        const galaxy = await loadGalaxy();
        const resolution = resolveNavigation(galaxy, normalizedMessage);

        if (resolution.kind === 'resolved') {
          return {
            status: 200,
            response: {
              action: resolution.action,
              message: resolution.message,
            },
          };
        }

        if (resolution.kind === 'not_found') {
          return {
            status: 200,
            response: {
              action: null,
              message: resolution.message,
            },
          };
        }
      }

      const interactionIntent = resolveInteractionIntent(normalizedMessage);
      if (
        interactionIntent === 'recommendation' ||
        interactionIntent === 'discovery'
      ) {
        return recommendationResponder.respond({
          ...(context ? { context } : {}),
          message: normalizedMessage,
          requestId,
        });
      }

      return chatResponder.respond({
        ...(context ? { context } : {}),
        message: normalizedMessage,
        requestId,
      });
    },
  };
}

export const agentService = createAgentService();
