import type { TeleportAction } from '../../types/agent';
import type { HydratedGalaxy } from '../galaxy-model';

export type AgentGalaxy = Pick<HydratedGalaxy, 'stars'>;

export type NavigationResolution =
  | {
      kind: 'resolved';
      action: TeleportAction;
      message: string;
      targetQuery: string;
    }
  | {
      kind: 'not_found';
      action: null;
      message: string;
      targetQuery: string;
    }
  | {
      kind: 'not_navigation';
    };

const RESOLVED_NAVIGATION_MESSAGE = '跃迁坐标已锁定，准备执行传送。';
const UNKNOWN_NAVIGATION_MESSAGE =
  '无法在当前星图中定位该目标，我可以带你前往工程、哲学或 ACG 领域。';

const NAVIGATION_INTENT_PATTERNS = [
  /带我去/i,
  /带我到/i,
  /前往/i,
  /导航到/i,
  /跳转到/i,
  /跳到/i,
  /传送到/i,
  /跃迁到/i,
  /进入/i,
  /打开/i,
  /定位到/i,
  /定位/i,
  /^\s*(?:请\s*)?(?:去|到)\s*\S+/i,
  /go to/i,
  /take me to/i,
  /teleport/i,
  /warp to/i,
  /visit/i,
  /open/i,
];

const LEADING_NAVIGATION_PATTERNS = [
  /^(?:请\s*)?(?:带我去|带我到|前往|导航到|跳转到|跳到|传送到|跃迁到|进入|打开|定位到|定位)\s*/i,
  /^(?:请\s*)?(?:去|到)\s*/i,
  /^(?:please\s+)?(?:take me to|go to|teleport to|warp to|visit|open)\s+/i,
];

const TRAILING_NOISE_PATTERNS = [
  /(?:看看|看一看|看下|看一下|逛逛|一下|吧|呢|呀|啊|哦|喔|哈)\s*$/i,
  /(?:please|thanks|thank you)\s*$/i,
  /[。！!？?，,、；;：:\s]+$/u,
];

function normalizeTargetKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function stripTargetQualifier(value: string) {
  return value.replace(/^(star|planet)\s*:\s*/i, '').trim();
}

function stripNavigationPrefix(value: string) {
  let current = value.trim();
  let changed = true;

  while (changed) {
    changed = false;
    for (const pattern of LEADING_NAVIGATION_PATTERNS) {
      const next = current.replace(pattern, '').trim();
      if (next !== current) {
        current = next;
        changed = true;
      }
    }
  }

  return current;
}

function stripNavigationSuffix(value: string) {
  let current = value.trim();
  let changed = true;

  while (changed) {
    changed = false;
    for (const pattern of TRAILING_NOISE_PATTERNS) {
      const next = current.replace(pattern, '').trim();
      if (next !== current) {
        current = next;
        changed = true;
      }
    }
  }

  return current;
}

function getTargetMatchScore(query: string, candidate: string) {
  if (!query || !candidate) {
    return 0;
  }

  if (query === candidate) {
    return 6;
  }

  if (query.startsWith(candidate) || query.endsWith(candidate)) {
    return 5;
  }

  if (candidate.startsWith(query) || candidate.endsWith(query)) {
    return query.length >= 2 ? 4 : 0;
  }

  if (query.includes(candidate)) {
    return 3;
  }

  if (candidate.includes(query)) {
    return query.length >= 2 ? 2 : 0;
  }

  return 0;
}

function resolveBestTargetMatch(
  galaxy: AgentGalaxy,
  targetQuery: string,
): TeleportAction | null {
  const normalizedTarget = normalizeTargetKey(stripTargetQualifier(targetQuery));
  const starMatches = galaxy.stars.map((star) => ({
    action: {
      type: 'TELEPORT' as const,
      targetId: star.id,
      targetType: 'star' as const,
    },
    score: [star.id, star.name, ...star.aliases]
      .map(normalizeTargetKey)
      .filter(Boolean)
      .reduce((bestScore, candidate) => {
        return Math.max(bestScore, getTargetMatchScore(normalizedTarget, candidate));
      }, 0),
  }));
  const planetMatches = galaxy.stars.flatMap((star) =>
    star.planets.map((planet) => ({
      action: {
        type: 'TELEPORT' as const,
        targetId: planet.id,
        targetType: 'planet' as const,
      },
      score: [planet.id, planet.name, ...planet.aliases]
        .map(normalizeTargetKey)
        .filter(Boolean)
        .reduce((bestScore, candidate) => {
          return Math.max(
            bestScore,
            getTargetMatchScore(normalizedTarget, candidate),
          );
        }, 0),
    })),
  );

  const bestMatch = [...planetMatches, ...starMatches]
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score)[0];

  return bestMatch?.action ?? null;
}

export function isNavigationIntent(message: string) {
  return NAVIGATION_INTENT_PATTERNS.some((pattern) => pattern.test(message));
}

export function extractNavigationTargetQuery(message: string) {
  const withoutPrefix = stripNavigationPrefix(message);
  const withoutSuffix = stripNavigationSuffix(withoutPrefix);
  return stripTargetQualifier(withoutSuffix);
}

export function resolveTeleportAction(
  galaxy: AgentGalaxy,
  targetQuery: string,
): TeleportAction | null {
  return resolveBestTargetMatch(galaxy, targetQuery);
}

export function resolveNavigationRequest(
  galaxy: AgentGalaxy,
  message: string,
): NavigationResolution {
  if (!isNavigationIntent(message)) {
    return {
      kind: 'not_navigation',
    };
  }

  const targetQuery = extractNavigationTargetQuery(message);
  if (!targetQuery) {
    return {
      action: null,
      kind: 'not_found',
      message: UNKNOWN_NAVIGATION_MESSAGE,
      targetQuery,
    };
  }

  const action = resolveTeleportAction(galaxy, targetQuery);
  if (!action) {
    return {
      action: null,
      kind: 'not_found',
      message: UNKNOWN_NAVIGATION_MESSAGE,
      targetQuery,
    };
  }

  return {
    action,
    kind: 'resolved',
    message: RESOLVED_NAVIGATION_MESSAGE,
    targetQuery,
  };
}
