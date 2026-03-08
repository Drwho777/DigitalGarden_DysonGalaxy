import type { NodeFrontmatter, StarConfig } from '../types/galaxy';

export interface GalaxyNodeStats {
  articlesByPlanetId: Record<string, NodeFrontmatter[]>;
  planetCountsById: Record<string, number>;
  starCountsById: Record<string, number>;
}

export function buildGalaxyNodeStats(
  stars: StarConfig[],
  nodes: NodeFrontmatter[],
): GalaxyNodeStats {
  const articlesByPlanetId: Record<string, NodeFrontmatter[]> = {};
  const planetCountsById: Record<string, number> = {};
  const starCountsById: Record<string, number> = {};
  const planetStarById = new Map<string, string>();

  stars.forEach((star) => {
    starCountsById[star.id] = 0;

    star.planets.forEach((planet) => {
      articlesByPlanetId[planet.id] = [];
      planetCountsById[planet.id] = 0;
      planetStarById.set(planet.id, star.id);
    });
  });

  nodes.forEach((node) => {
    const expectedStarId = planetStarById.get(node.planetId);
    if (expectedStarId !== node.starId) {
      return;
    }

    articlesByPlanetId[node.planetId]?.push(node);
    planetCountsById[node.planetId] += 1;
    starCountsById[node.starId] += 1;
  });

  Object.values(articlesByPlanetId).forEach((articles) => {
    articles.sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime());
  });

  return {
    articlesByPlanetId,
    planetCountsById,
    starCountsById,
  };
}
