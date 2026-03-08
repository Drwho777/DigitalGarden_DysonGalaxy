export interface TeleportAction {
  type: 'TELEPORT';
  targetId: string;
  targetType?: 'star' | 'planet';
}

export interface AgentResponse {
  message: string;
  action: TeleportAction | null;
}
