import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fixtureHydratedGalaxy,
  fixtureNodeEntries,
} from '../fixtures/galaxy-fixtures';

const getGalaxyDataMock = vi.fn();
const getGalaxyNodeEntriesMock = vi.fn();

vi.mock('../../src/lib/galaxy-data', () => ({
  getGalaxyData: getGalaxyDataMock,
  getGalaxyNodeEntries: getGalaxyNodeEntriesMock,
}));

async function loadContextLoaderModule() {
  vi.resetModules();
  return import('../../src/lib/agent/context-loader');
}

describe('loadAgentContext', () => {
  beforeEach(() => {
    vi.resetModules();
    getGalaxyDataMock.mockReset();
    getGalaxyNodeEntriesMock.mockReset();
    getGalaxyDataMock.mockResolvedValue(fixtureHydratedGalaxy);
    getGalaxyNodeEntriesMock.mockResolvedValue(fixtureNodeEntries);
  });

  it('returns hub scope by default with a global overview', async () => {
    const { loadAgentContext } = await loadContextLoaderModule();

    const result = await loadAgentContext();

    expect(result).toMatchObject({
      scope: 'hub',
      globalOverview: {
        stars: expect.arrayContaining([
          expect.objectContaining({
            id: 'tech',
            nodeCount: 2,
            planetCount: 1,
          }),
        ]),
      },
    });
    expect(result.currentPlanet).toBeUndefined();
    expect(result.currentNode).toBeUndefined();
  });

  it('loads planet-scoped context with node summaries and global overview', async () => {
    const { loadAgentContext } = await loadContextLoaderModule();

    const result = await loadAgentContext({
      routeType: 'planet',
      starId: 'tech',
      planetId: 'p_garden',
    });

    expect(result.scope).toBe('planet');
    expect(result.currentStar).toMatchObject({
      id: 'tech',
      name: '工程与架构',
    });
    expect(result.currentPlanet).toMatchObject({
      id: 'p_garden',
      name: '数字花园日志',
      nodes: expect.arrayContaining([
        expect.objectContaining({
          slug: 'why-3d-galaxy',
          summary: '用宇宙隐喻重建个人知识系统。',
          title: '从平面到宇宙：为什么我选择 3D 星系作为知识结构？',
        }),
      ]),
    });
    expect(result.globalOverview.stars.length).toBeGreaterThan(0);
  });

  it('loads node-scoped context with article body when the entry exists', async () => {
    const { loadAgentContext } = await loadContextLoaderModule();

    const result = await loadAgentContext({
      routeType: 'node',
      starId: 'tech',
      planetId: 'p_garden',
      slug: 'why-3d-galaxy',
    });

    expect(result.scope).toBe('node');
    expect(result.currentNode).toMatchObject({
      body: expect.stringContaining('用宇宙隐喻重建个人知识系统。'),
      slug: 'why-3d-galaxy',
      title: '从平面到宇宙：为什么我选择 3D 星系作为知识结构？',
    });
    expect(result.currentPlanet?.id).toBe('p_garden');
  });

  it('includes gallery highlights for gallery-scoped planets', async () => {
    const { loadAgentContext } = await loadContextLoaderModule();

    const result = await loadAgentContext({
      routeType: 'planet',
      starId: 'acg',
      planetId: 'p_gallery',
    });

    expect(result.scope).toBe('planet');
    expect(result.currentPlanet).toMatchObject({
      id: 'p_gallery',
      pageType: 'gallery',
      highlights: expect.arrayContaining([
        expect.objectContaining({
          title: '攻壳机动队',
        }),
      ]),
    });
  });
});
