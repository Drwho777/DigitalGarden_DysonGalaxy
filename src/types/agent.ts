export interface TeleportAction {
  type: 'TELEPORT';
  targetType: 'star' | 'planet';
  targetId: string;
}

export interface AgentResponse {
  message: string;
  action: TeleportAction | null;
}
