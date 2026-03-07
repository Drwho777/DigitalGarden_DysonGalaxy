import { describe, expect, it } from 'vitest';
import { matchAgentAction } from '../../src/lib/agent/rule-matcher';
import type { AgentGalaxy } from '../../src/lib/agent/types';
import { fixtureHydratedGalaxy } from '../fixtures/galaxy-fixtures';

const overlappingAliasGalaxy: AgentGalaxy = {
  stars: [
    {
      id: 'tech',
      name: '共享入口',
      description: '测试别名冲突时的匹配顺序。',
      color: '#FF4500',
      position: [0, 0, 0],
      aliases: ['共享'],
      totalNodes: 1,
      planets: [
        {
          id: 'p_shared',
          starId: 'tech',
          name: '共享入口档案',
          description: '更具体的行星目标。',
          pageType: 'article_list',
          orbitDistance: 60,
          orbitSpeed: 0.008,
          tilt: 0.2,
          color: '#FF8C00',
          aliases: ['共享'],
          nodeCount: 0,
          articles: [],
        },
      ],
    },
  ],
};

describe('matchAgentAction', () => {
  it('matches a star alias and returns TELEPORT', () => {
    const response = matchAgentAction('带我去 ACG', fixtureHydratedGalaxy);

    expect(response.action).toEqual({
      type: 'TELEPORT',
      targetType: 'star',
      targetId: 'acg',
    });
  });

  it('matches a planet alias before falling back', () => {
    const response = matchAgentAction('打开数字花园日志', fixtureHydratedGalaxy);

    expect(response.action).toEqual({
      type: 'TELEPORT',
      targetType: 'planet',
      targetId: 'p_garden',
    });
  });

  it('keeps the intentional planet-first priority when aliases overlap', () => {
    const response = matchAgentAction('带我去共享', overlappingAliasGalaxy);

    expect(response.action).toEqual({
      type: 'TELEPORT',
      targetType: 'planet',
      targetId: 'p_shared',
    });
  });

  it('returns a null action for unmatched prompts', () => {
    const response = matchAgentAction('今天天气怎么样', fixtureHydratedGalaxy);

    expect(response.action).toBeNull();
  });
});
