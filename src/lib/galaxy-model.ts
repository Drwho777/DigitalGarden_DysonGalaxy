import type { NodeFrontmatter, PlanetConfig, StarConfig } from '../types/galaxy';
import { buildGalaxyNodeStats } from './galaxy-node-stats';

export interface HydratedArticle extends NodeFrontmatter {
  href: string;
}

export interface HydratedPlanet extends PlanetConfig {
  nodeCount: number;
  articles: HydratedArticle[];
}

export interface HydratedStar extends Omit<StarConfig, 'planets'> {
  totalNodes: number;
  planets: HydratedPlanet[];
}

export interface HydratedGalaxy {
  stars: HydratedStar[];
  starsById: Record<string, HydratedStar>;
  planetsById: Record<string, HydratedPlanet>;
}

export function buildArticleHref(
  node: Pick<NodeFrontmatter, 'starId' | 'planetId' | 'slug'>,
) {
  return `/read/${node.starId}/${node.planetId}/${node.slug}`;
}

export function hydrateGalaxy(
  stars: StarConfig[],
  nodes: NodeFrontmatter[],
): HydratedGalaxy {
  const { articlesByPlanetId, planetCountsById, starCountsById } =
    buildGalaxyNodeStats(stars, nodes);

  const hydratedStars = stars.map((star) => {
    const hydratedPlanets = star.planets.map((planet) => {
      const articles = (articlesByPlanetId[planet.id] ?? []).map((node) => ({
          ...node,
          href: buildArticleHref(node),
        }));

      return {
        ...planet,
        nodeCount: planetCountsById[planet.id] ?? 0,
        articles,
      };
    });

    return {
      ...star,
      totalNodes: starCountsById[star.id] ?? 0,
      planets: hydratedPlanets,
    };
  });

  return {
    stars: hydratedStars,
    starsById: Object.fromEntries(
      hydratedStars.map((star) => [star.id, star]),
    ),
    planetsById: Object.fromEntries(
      hydratedStars.flatMap((star) =>
        star.planets.map((planet) => [planet.id, planet]),
      ),
    ),
  };
}
