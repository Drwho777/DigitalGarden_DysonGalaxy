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

  it('returns article candidates instead of a direct OPEN_PATH action in node scope', async () => {
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
    expect(result.response.action).toBeNull();
    expect(result.response.recommendations).toMatchObject({
      mode: 'recommendation',
    });
    expect(result.response.recommendations?.items[0]).toEqual({
      action: {
        type: 'OPEN_PATH',
        path: '/read/tech/p_garden/astro-3d-performance',
      },
      badge: 'ARTICLE',
      description: '先守住数据边界和渲染预算。',
      hint: '2026-03-05 · 工程与架构 / 数字花园日志',
      id: 'node:astro-3d-performance',
      kind: 'primary',
      title: 'Astro 与 Three.js 共存时，首屏性能应该先守住什么？',
    });
    expect(result.response.recommendations?.items.length).toBeGreaterThan(1);
    expect(result.response.message).toContain('推荐理由：');
    expect(result.response.message).toContain('只有点击后，才会执行打开');
  });

  it('returns recent planet candidates instead of an automatic TELEPORT action', async () => {
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
    expect(result.response.action).toBeNull();
    expect(result.response.recommendations).toMatchObject({
      mode: 'discovery',
    });
    expect(result.response.recommendations?.items[0]).toMatchObject({
      action: {
        type: 'TELEPORT',
        targetId: 'p_garden',
        targetType: 'planet',
      },
      badge: 'PLANET',
      id: 'planet:p_garden',
      kind: 'primary',
      title: '数字花园日志',
    });
    expect(result.response.message).toContain('不会自动跳转');
  });

  it('returns newest node candidates instead of a direct OPEN_PATH action', async () => {
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
    expect(result.response.action).toBeNull();
    expect(result.response.recommendations).toMatchObject({
      mode: 'discovery',
    });
    expect(result.response.recommendations?.items[0]).toMatchObject({
      action: {
        type: 'OPEN_PATH',
        path: '/read/tech/p_garden/why-3d-galaxy',
      },
      id: 'node:why-3d-galaxy',
      kind: 'primary',
    });
    expect(result.response.message).toContain('不会自动打开');
  });

  it('explains node relationships and returns clickable candidates', async () => {
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
    expect(result.response.action).toBeNull();
    expect(result.response.recommendations).toMatchObject({
      mode: 'discovery',
    });
    expect(result.response.recommendations?.items[0]).toMatchObject({
      action: {
        type: 'TELEPORT',
        targetId: 'p_garden',
        targetType: 'planet',
      },
      id: 'planet:p_garden',
      kind: 'primary',
    });
    expect(result.response.recommendations?.items[1]).toMatchObject({
      action: {
        type: 'OPEN_PATH',
        path: '/read/tech/p_garden/astro-3d-performance',
      },
      id: 'node:astro-3d-performance',
    });
    expect(result.response.message).toContain('关键节点');
    expect(result.response.message).toContain('下面给你一个主入口和延伸候选');
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
    expect(result.response.action).toBeNull();
    expect(result.response.recommendations?.items[0]).toMatchObject({
      action: {
        type: 'OPEN_PATH',
        path: '/read/phil/p_exist/existential-cyberspace',
      },
      id: 'node:existential-cyberspace',
      title: '存在主义与赛博空间：为什么灵魂也需要一个可导航的界面？',
    });
    expect(result.response.message).toContain('语义召回');
  });
});
