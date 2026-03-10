import type { TeleportAction } from '../../types/agent';

export const GALAXY_ACTION_EVENT = 'galaxy:action' as const;
const PENDING_GALAXY_ACTION_STORAGE_KEY = 'dg:pending-galaxy-action';

export type GalaxyActionEvent = CustomEvent<TeleportAction>;

export function createGalaxyActionEvent(action: TeleportAction): GalaxyActionEvent {
  return new CustomEvent<TeleportAction>(GALAXY_ACTION_EVENT, {
    detail: action,
  });
}

export function dispatchGalaxyAction(action: TeleportAction) {
  window.dispatchEvent(createGalaxyActionEvent(action));
}

function isTeleportAction(value: unknown): value is TeleportAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const action = value as Record<string, unknown>;
  return (
    action.type === 'TELEPORT' &&
    typeof action.targetId === 'string' &&
    (!Object.prototype.hasOwnProperty.call(action, 'targetType') ||
      action.targetType === 'star' ||
      action.targetType === 'planet')
  );
}

export function queueGalaxyAction(action: TeleportAction) {
  try {
    window.sessionStorage.setItem(
      PENDING_GALAXY_ACTION_STORAGE_KEY,
      JSON.stringify(action),
    );
  } catch {
    // Ignore storage failures and keep the current page stable.
  }
}

export function consumeQueuedGalaxyAction() {
  try {
    const serialized = window.sessionStorage.getItem(
      PENDING_GALAXY_ACTION_STORAGE_KEY,
    );
    if (!serialized) {
      return null;
    }

    window.sessionStorage.removeItem(PENDING_GALAXY_ACTION_STORAGE_KEY);
    const parsed = JSON.parse(serialized);
    return isTeleportAction(parsed) ? parsed : null;
  } catch {
    try {
      window.sessionStorage.removeItem(PENDING_GALAXY_ACTION_STORAGE_KEY);
    } catch {
      // Ignore storage cleanup failures.
    }
    return null;
  }
}
