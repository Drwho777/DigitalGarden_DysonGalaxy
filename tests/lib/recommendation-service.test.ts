import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fixtureHydratedGalaxy,
  fixtureLoadedHubContext,
  fixtureLoadedNodeContext,
} from '../fixtures/galaxy-fixtures';

async function loadRecommendationServiceModule() {
  vi.resetModules();
  return import('../../src/lib/agent/recommendation-service');
}

describe('createRecommendationService', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('recommends a related article with a direct OPEN_PATH action in node scope', async () => {
    const { createRecommendationService } =
      await loadRecommendationServiceModule();
    const service = createRecommendationService({
      loadContext: vi.fn().mockResolvedValue(fixtureLoadedNodeContext),
      loadGalaxy: vi.fn().mockResolvedValue(fixtureHydratedGalaxy),
    });

    const result = await service.respond({
      context: {
        routeType: 'node',
        starId: 'tech',
        planetId: 'p_garden',
        slug: 'why-3d-galaxy',
      },
      message: '推荐一篇类似的文章',
    });

    expect(result.status).toBe(200);
    expect(result.response.action).toEqual({
      type: 'OPEN_PATH',
      path: '/read/tech/p_garden/astro-3d-performance',
    });
    expect(result.response.message).toContain('推荐理由');
    expect(result.response.message).toContain('你可能还想看');
  });

  it('returns recent planets with a TELEPORT action', async () => {
    const { createRecommendationService } =
      await loadRecommendationServiceModule();
    const service = createRecommendationService({
      loadContext: vi.fn().mockResolvedValue(fixtureLoadedHubContext),
      loadGalaxy: vi.fn().mockResolvedValue(fixtureHydratedGalaxy),
    });

    const result = await service.respond({
      message: '最近更新的几个星球',
    });

    expect(result.status).toBe(200);
    expect(result.response.action).toEqual({
      type: 'TELEPORT',
      targetId: 'p_garden',
      targetType: 'planet',
    });
    expect(result.response.message).toContain('最近更新更活跃的星球');
  });

  it('returns the newest node with a direct OPEN_PATH action', async () => {
    const { createRecommendationService } =
      await loadRecommendationServiceModule();
    const service = createRecommendationService({
      loadContext: vi.fn().mockResolvedValue(fixtureLoadedHubContext),
      loadGalaxy: vi.fn().mockResolvedValue(fixtureHydratedGalaxy),
    });

    const result = await service.respond({
      message: '最近新增内容',
    });

    expect(result.status).toBe(200);
    expect(result.response.action).toEqual({
      type: 'OPEN_PATH',
      path: '/read/tech/p_garden/why-3d-galaxy',
    });
    expect(result.response.message).toContain('最近新增的内容');
  });

  it('explains node relationships and keeps the action on the current planet', async () => {
    const { createRecommendationService } =
      await loadRecommendationServiceModule();
    const service = createRecommendationService({
      loadContext: vi.fn().mockResolvedValue(fixtureLoadedNodeContext),
      loadGalaxy: vi.fn().mockResolvedValue(fixtureHydratedGalaxy),
    });

    const result = await service.respond({
      context: {
        routeType: 'node',
        starId: 'tech',
        planetId: 'p_garden',
        slug: 'why-3d-galaxy',
      },
      message: '这条内容线的关键节点和关系是什么',
    });

    expect(result.status).toBe(200);
    expect(result.response.action).toEqual({
      type: 'TELEPORT',
      targetId: 'p_garden',
      targetType: 'planet',
    });
    expect(result.response.message).toContain('关键节点');
    expect(result.response.message).toContain('Astro 与 Three.js 共存时');
  });

  it('keeps a semantic recall extension point that can lift a cross-topic article', async () => {
    const { createRecommendationService } =
      await loadRecommendationServiceModule();
    const service = createRecommendationService({
      loadContext: vi.fn().mockResolvedValue(fixtureLoadedHubContext),
      loadGalaxy: vi.fn().mockResolvedValue(fixtureHydratedGalaxy),
      loadSemanticMatches: vi.fn().mockResolvedValue([
        {
          planetId: 'p_exist',
          score: 4,
          slug: 'existential-cyberspace',
        },
      ]),
    });

    const result = await service.respond({
      message: '推荐一篇类似的文章',
    });

    expect(result.status).toBe(200);
    expect(result.response.action).toEqual({
      type: 'OPEN_PATH',
      path: '/read/phil/p_exist/existential-cyberspace',
    });
    expect(result.response.message).toContain('语义召回');
  });
});
