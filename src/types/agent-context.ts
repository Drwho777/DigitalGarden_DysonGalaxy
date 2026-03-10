export type AgentRouteType = 'hub' | 'planet' | 'node';

export interface HubAgentRequestContext {
  routeType: 'hub';
}

export interface PlanetAgentRequestContext {
  routeType: 'planet';
  starId: string;
  planetId: string;
}

export interface NodeAgentRequestContext {
  routeType: 'node';
  starId: string;
  planetId: string;
  slug: string;
}

export type AgentRequestContextInput =
  | HubAgentRequestContext
  | PlanetAgentRequestContext
  | NodeAgentRequestContext;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isValidAgentRequestContext(
  value: unknown,
): value is AgentRequestContextInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const context = value as Record<string, unknown>;
  switch (context.routeType) {
    case 'hub':
      return true;
    case 'planet':
      return isNonEmptyString(context.starId) && isNonEmptyString(context.planetId);
    case 'node':
      return (
        isNonEmptyString(context.starId) &&
        isNonEmptyString(context.planetId) &&
        isNonEmptyString(context.slug)
      );
    default:
      return false;
  }
}

export function normalizeAgentRequestContext(
  context: AgentRequestContextInput,
): AgentRequestContextInput {
  switch (context.routeType) {
    case 'hub':
      return context;
    case 'planet':
      return {
        routeType: 'planet',
        starId: context.starId.trim(),
        planetId: context.planetId.trim(),
      };
    case 'node':
      return {
        routeType: 'node',
        starId: context.starId.trim(),
        planetId: context.planetId.trim(),
        slug: context.slug.trim(),
      };
  }
}
