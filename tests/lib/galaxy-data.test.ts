import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCollectionMock = vi.fn();
const hydrateGalaxyMock = vi.fn();

vi.mock('astro:content', () => ({
  getCollection: getCollectionMock,
}));

vi.mock('../../src/lib/galaxy-model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/galaxy-model')>();

  return {
    ...actual,
    hydrateGalaxy: hydrateGalaxyMock,
  };
});

function createNodeEntry(slug: string) {
  return {
    data: {
      color: '#ffffff',
      planetId: 'p_garden',
      planetName: 'Digital Garden',
      slug,
      starId: 'tech',
      starName: 'Technology',
      summary: 'summary',
      title: `title-${slug}`,
    },
    slug,
  };
}

async function loadGalaxyDataModule() {
  vi.resetModules();
  return import('../../src/lib/galaxy-data');
}

describe('getGalaxyData', () => {
  beforeEach(() => {
    vi.resetModules();
    getCollectionMock.mockReset();
    hydrateGalaxyMock.mockReset();
    getCollectionMock.mockResolvedValue([createNodeEntry('why-3d-galaxy')]);
    hydrateGalaxyMock.mockReturnValue({
      planetsById: {},
      stars: [],
      starsById: {},
    });
  });

  it('reuses the in-flight promise so concurrent reads hydrate once', async () => {
    const { getGalaxyData } = await loadGalaxyDataModule();

    const [first, second] = await Promise.all([getGalaxyData(), getGalaxyData()]);

    expect(getCollectionMock).toHaveBeenCalledTimes(1);
    expect(hydrateGalaxyMock).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('allows the cache to be cleared for a fresh reload', async () => {
    const { clearGalaxyDataCache, getGalaxyData } = await loadGalaxyDataModule();

    await getGalaxyData();
    clearGalaxyDataCache();
    await getGalaxyData();

    expect(getCollectionMock).toHaveBeenCalledTimes(2);
    expect(hydrateGalaxyMock).toHaveBeenCalledTimes(2);
  });

  it('resets the cache after a load failure so the next request can recover', async () => {
    getCollectionMock
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce([createNodeEntry('astro-3d-performance')]);

    const { getGalaxyData } = await loadGalaxyDataModule();

    await expect(getGalaxyData()).rejects.toThrow('temporary failure');
    await expect(getGalaxyData()).resolves.toMatchObject({
      lanes: expect.any(Array),
      stars: [],
    });

    expect(getCollectionMock).toHaveBeenCalledTimes(2);
    expect(hydrateGalaxyMock).toHaveBeenCalledTimes(1);
  });
});
