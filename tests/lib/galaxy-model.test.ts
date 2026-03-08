import { describe, expect, it } from 'vitest';
import { buildGalaxyNodeStats } from '../../src/lib/galaxy-node-stats';
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
  it('builds explicit star and planet node counts from markdown entries', () => {
    const stats = buildGalaxyNodeStats(fixtureStars, fixtureNodes);

    expect(stats.starCountsById).toEqual({
      tech: 2,
      phil: 1,
      acg: 0,
    });
    expect(stats.planetCountsById).toEqual({
      p_garden: 2,
      p_exist: 1,
      p_gallery: 0,
    });
    expect(stats.articlesByPlanetId.p_garden.map((article) => article.slug)).toEqual([
      'why-3d-galaxy',
      'astro-3d-performance',
    ]);
  });

  it('ignores nodes whose planet does not belong to the declared star', () => {
    const stats = buildGalaxyNodeStats(fixtureStars, [
      ...fixtureNodes,
      {
        ...fixtureNodes[0],
        slug: 'invalid-pairing',
        starId: 'tech',
        planetId: 'p_exist',
      },
    ]);

    expect(stats.starCountsById.tech).toBe(2);
    expect(stats.starCountsById.phil).toBe(1);
    expect(stats.planetCountsById.p_exist).toBe(1);
    expect(
      stats.articlesByPlanetId.p_exist.map((article) => article.slug),
    ).toEqual(['existential-cyberspace']);
  });

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
