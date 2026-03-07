import { describe, expect, it } from 'vitest';
import { buildArticleHref, hydrateGalaxy } from '../../src/lib/galaxy-model';
import { fixtureNodes, fixtureStars } from '../fixtures/galaxy-fixtures';

describe('buildArticleHref', () => {
  it('builds semantic read URLs', () => {
    expect(
      buildArticleHref({
        starId: 'tech',
        planetId: 'p_garden',
        slug: 'why-3d-galaxy',
      }),
    ).toBe('/read/tech/p_garden/why-3d-galaxy');
  });
});

describe('hydrateGalaxy', () => {
  it('attaches article metadata to the correct planet', () => {
    const galaxy = hydrateGalaxy(fixtureStars, fixtureNodes);

    expect(galaxy.planetsById.p_garden.nodeCount).toBe(2);
    expect(galaxy.planetsById.p_garden.articles[0].href).toBe(
      '/read/tech/p_garden/why-3d-galaxy',
    );
  });

  it('recomputes total star node counts from markdown entries', () => {
    const galaxy = hydrateGalaxy(fixtureStars, fixtureNodes);

    expect(galaxy.starsById.tech.totalNodes).toBe(2);
    expect(galaxy.starsById.phil.totalNodes).toBe(1);
    expect(galaxy.starsById.acg.totalNodes).toBe(0);
  });
});
