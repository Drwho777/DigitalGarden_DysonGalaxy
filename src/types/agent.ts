import type { AgentRequestContextInput } from './agent-context';

export interface TeleportAction {
  type: 'TELEPORT';
  targetId: string;
  targetType?: 'star' | 'planet';
}

export interface AgentRequestPayload {
  message: string;
  context?: AgentRequestContextInput;
}

export interface AgentResponse {
  message: string;
  action: TeleportAction | null;
}
