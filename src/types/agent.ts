import type { AgentRequestContextInput } from './agent-context';

export interface TeleportAction {
  type: 'TELEPORT';
  targetId: string;
  targetType?: 'star' | 'planet';
}

export interface OpenPathAction {
  type: 'OPEN_PATH';
  path: string;
}

export type AgentAction = TeleportAction | OpenPathAction;

export interface AgentRequestPayload {
  message: string;
  context?: AgentRequestContextInput;
}

export interface AgentResponse {
  message: string;
  action: AgentAction | null;
}

export function getAgentActionType(action: AgentAction | null | undefined) {
  return action?.type ?? null;
}

export function getAgentActionTarget(action: AgentAction | null | undefined) {
  if (!action) {
    return null;
  }

  switch (action.type) {
    case 'TELEPORT':
      return action.targetId;
    case 'OPEN_PATH':
      return action.path;
  }
}
