import type { AgentResponse, TeleportAction } from '../../types/agent';
import type { HydratedGalaxy } from '../galaxy-model';

export type AgentGalaxy = Pick<HydratedGalaxy, 'stars'>;

export interface AgentDecision {
  message?: unknown;
  action?: unknown;
}

export interface AgentProviderRequest {
  message: string;
  galaxy: AgentGalaxy;
}

export interface AgentPromptFactory {
  createSystemPrompt(input: AgentProviderRequest): string;
  createRoutePrompt(input: AgentProviderRequest): string;
}

export interface AgentProvider {
  id: string;
  decide(input: AgentProviderRequest): Promise<AgentDecision> | AgentDecision;
}

export interface AgentServiceInput {
  message: string;
}

export interface AgentServiceResult {
  status: 200 | 422;
  response: AgentResponse;
}

export interface AgentService {
  respond(input: AgentServiceInput): Promise<AgentServiceResult>;
}

export interface CreateAgentServiceOptions {
  loadGalaxy: () => Promise<AgentGalaxy>;
  provider: AgentProvider;
}

export function isTeleportAction(value: unknown): value is TeleportAction {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TeleportAction>;
  return (
    candidate.type === 'TELEPORT' &&
    (candidate.targetType === 'star' || candidate.targetType === 'planet') &&
    typeof candidate.targetId === 'string' &&
    candidate.targetId.length > 0
  );
}
