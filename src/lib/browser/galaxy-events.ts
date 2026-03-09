import type { TeleportAction } from '../../types/agent';

export const GALAXY_ACTION_EVENT = 'galaxy:action' as const;

export type GalaxyActionEvent = CustomEvent<TeleportAction>;

export function createGalaxyActionEvent(action: TeleportAction): GalaxyActionEvent {
  return new CustomEvent<TeleportAction>(GALAXY_ACTION_EVENT, {
    detail: action,
  });
}

export function dispatchGalaxyAction(action: TeleportAction) {
  window.dispatchEvent(createGalaxyActionEvent(action));
}
