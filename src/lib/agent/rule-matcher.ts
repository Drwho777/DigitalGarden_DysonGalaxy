import type { AgentDecision, AgentGalaxy } from './types';

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, '');
}

function includesAlias(input: string, candidates: string[]) {
  return candidates.some((candidate) => input.includes(normalize(candidate)));
}

export function matchAgentAction(
  input: string,
  galaxy: AgentGalaxy,
): AgentDecision {
  const normalizedInput = normalize(input);

  // Planet aliases intentionally win over star aliases so a direct topic request
  // resolves to the most specific destination when names overlap.
  for (const star of galaxy.stars) {
    for (const planet of star.planets) {
      const aliases = [planet.id, planet.name, ...planet.aliases];
      if (includesAlias(normalizedInput, aliases)) {
        return {
          message: `已锁定 ${planet.name} 主题，准备切入近地轨道。`,
          action: {
            type: 'TELEPORT',
            targetType: 'planet',
            targetId: planet.id,
          },
        };
      }
    }
  }

  for (const star of galaxy.stars) {
    const aliases = [star.id, star.name, ...star.aliases];
    if (includesAlias(normalizedInput, aliases)) {
      return {
        message: `已锁定 ${star.name} 星区，准备执行跃迁。`,
        action: {
          type: 'TELEPORT',
          targetType: 'star',
          targetId: star.id,
        },
      };
    }
  }

  return {
    message:
      '当前指令还没有对应的星区，我可以带你前往工程、哲学或 ACG 领域。',
    action: null,
  };
}
