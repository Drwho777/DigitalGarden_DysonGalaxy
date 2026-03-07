import type { AgentResponse } from '../../types/agent';
import type {
  AgentDecision,
  AgentService,
  CreateAgentServiceOptions,
} from './types';
import { isTeleportAction } from './types';

const EMPTY_MESSAGE_RESPONSE: AgentResponse = {
  message: '`message` is required.',
  action: null,
};

const FALLBACK_RESPONSE_MESSAGE =
  '当前指令还没有对应的星区，我可以带你前往工程、哲学或 ACG 领域。';

export function normalizeAgentMessage(message: string) {
  return message.trim();
}

export function normalizeAgentDecision(decision: AgentDecision): AgentResponse {
  const message =
    typeof decision.message === 'string' && decision.message.trim()
      ? decision.message.trim()
      : FALLBACK_RESPONSE_MESSAGE;

  return {
    message,
    action: isTeleportAction(decision.action) ? decision.action : null,
  };
}

export function createAgentService(
  options: CreateAgentServiceOptions,
): AgentService {
  const { loadGalaxy, provider } = options;

  return {
    async respond({ message }) {
      const normalizedMessage = normalizeAgentMessage(message);
      if (!normalizedMessage) {
        return {
          status: 422,
          response: EMPTY_MESSAGE_RESPONSE,
        };
      }

      const galaxy = await loadGalaxy();
      const decision = await provider.decide({
        message: normalizedMessage,
        galaxy,
      });

      return {
        status: 200,
        response: normalizeAgentDecision(decision),
      };
    },
  };
}
