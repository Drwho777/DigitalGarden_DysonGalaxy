import type { AgentResponse } from '../../types/agent';
import { chatService, type ChatService } from './chat-service';
import {
  isNavigationIntent,
  resolveNavigationRequest,
  type NavigationResolution,
} from './navigation-resolver';
import type { AgentGalaxy } from './navigation-resolver';

export interface AgentServiceInput {
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
  resolveNavigation?: (
    galaxy: AgentGalaxy,
    message: string,
  ) => NavigationResolution;
} = {}): AgentService {
  const {
    chatResponder = chatService,
    loadGalaxy = loadGalaxyData,
    resolveNavigation = resolveNavigationRequest,
  } = options;

  return {
    async respond({ message, requestId }) {
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

      return chatResponder.respond({
        message: normalizedMessage,
        requestId,
      });
    },
  };
}

export const agentService = createAgentService();
