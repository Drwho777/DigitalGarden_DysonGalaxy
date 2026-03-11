import type { CollectionEntry } from 'astro:content';
import type { AgentRequestContextInput } from '../../types/agent-context';
import { getGalleryExhibits } from '../../data/gallery';
import { getGalaxyData, getGalaxyNodeEntries } from '../galaxy-data';
import type { HydratedArticle } from '../galaxy-model';
import { buildArticleHref } from '../galaxy-model';

export interface AgentContextNodeSummary {
  href: string;
  publishedAt: string;
  slug: string;
  summary: string;
  tags: string[];
  title: string;
}

export interface AgentContextHighlight {
  summary: string;
  tag?: string;
  title: string;
}

export interface AgentContextStarSummary {
  id: string;
  name: string;
  description: string;
  planetCount: number;
  nodeCount: number;
}

export interface AgentContextFeaturedPlanetSummary {
  id: string;
  name: string;
  description: string;
  nodeCount: number;
  pageType: 'article_list' | 'gallery';
  starId: string;
  starName: string;
}

export interface AgentContextRecentNodeSummary {
  slug: string;
  title: string;
  summary: string;
  publishedAt: string;
  planetId: string;
  planetName: string;
  starId: string;
  starName: string;
}

export interface LoadedAgentContext {
  scope: 'hub' | 'planet' | 'node';
  currentNode?: {
    body?: string;
    href: string;
    publishedAt: string;
    slug: string;
    summary: string;
    tags: string[];
    title: string;
  };
  currentPlanet?: {
    description: string;
    highlights?: AgentContextHighlight[];
    id: string;
    name: string;
    nodes: AgentContextNodeSummary[];
    pageType: 'article_list' | 'gallery';
    starId: string;
  };
  currentStar?: {
    description: string;
    id: string;
    name: string;
  };
  globalOverview: {
    stars: AgentContextStarSummary[];
    featuredPlanets: AgentContextFeaturedPlanetSummary[];
    recentNodes: AgentContextRecentNodeSummary[];
  };
}

function serializePublishedAt(value: Date) {
  return value.toISOString();
}

function mapNodeSummaryFromEntry(entry: CollectionEntry<'nodes'>) {
  return {
    href: buildArticleHref({
      planetId: entry.data.planetId,
      slug: entry.slug,
      starId: entry.data.starId,
    }),
    publishedAt: serializePublishedAt(entry.data.publishedAt),
    slug: entry.slug,
    summary: entry.data.summary,
    tags: [...entry.data.tags],
    title: entry.data.title,
  };
}

function mapNodeSummaryFromArticle(article: HydratedArticle) {
  return {
    href: article.href,
    publishedAt: serializePublishedAt(article.publishedAt),
    slug: article.slug,
    summary: article.summary,
    tags: [...article.tags],
    title: article.title,
  };
}

function getPlanetFreshnessTimestamp(
  planet: Awaited<ReturnType<typeof getGalaxyData>>['stars'][number]['planets'][number],
) {
  return planet.articles[0]?.publishedAt.getTime() ?? 0;
}

function buildFeaturedPlanets(
  galaxy: Awaited<ReturnType<typeof getGalaxyData>>,
): AgentContextFeaturedPlanetSummary[] {
  return galaxy.stars
    .flatMap((star) =>
      star.planets
        .filter((planet) => planet.nodeCount > 0)
        .map((planet) => ({
          description: planet.description,
          id: planet.id,
          name: planet.name,
          nodeCount: planet.nodeCount,
          pageType: planet.pageType,
          starId: star.id,
          starName: star.name,
        })),
    )
    .sort((left, right) => {
      if (right.nodeCount !== left.nodeCount) {
        return right.nodeCount - left.nodeCount;
      }

      const leftFreshness =
        getPlanetFreshnessTimestamp(galaxy.planetsById[left.id]) ?? 0;
      const rightFreshness =
        getPlanetFreshnessTimestamp(galaxy.planetsById[right.id]) ?? 0;

      if (rightFreshness !== leftFreshness) {
        return rightFreshness - leftFreshness;
      }

      return left.id.localeCompare(right.id);
    });
}

function buildRecentNodes(
  galaxy: Awaited<ReturnType<typeof getGalaxyData>>,
): AgentContextRecentNodeSummary[] {
  return galaxy.stars
    .flatMap((star) =>
      star.planets.flatMap((planet) =>
        planet.articles.map((article) => ({
          planetId: planet.id,
          planetName: planet.name,
          publishedAt: serializePublishedAt(article.publishedAt),
          slug: article.slug,
          starId: star.id,
          starName: star.name,
          summary: article.summary,
          title: article.title,
        })),
      ),
    )
    .sort((left, right) => {
      const publishedAtOrder =
        new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();

      if (publishedAtOrder !== 0) {
        return publishedAtOrder;
      }

      if (left.starId !== right.starId) {
        return left.starId.localeCompare(right.starId);
      }

      if (left.planetId !== right.planetId) {
        return left.planetId.localeCompare(right.planetId);
      }

      return left.slug.localeCompare(right.slug);
    })
    .slice(0, 5);
}

function mapGalleryHighlight(planetId: string): AgentContextHighlight[] {
  return getGalleryExhibits(planetId).map((item) => ({
    summary: item.summary,
    tag: item.tag,
    title: item.title,
  }));
}

function buildGlobalOverview(
  galaxy: Awaited<ReturnType<typeof getGalaxyData>>,
): LoadedAgentContext['globalOverview'] {
  return {
    featuredPlanets: buildFeaturedPlanets(galaxy),
    recentNodes: buildRecentNodes(galaxy),
    stars: galaxy.stars.map((star) => ({
      description: star.description,
      id: star.id,
      name: star.name,
      nodeCount: star.totalNodes,
      planetCount: star.planets.length,
    })),
  };
}

function buildHubContext(
  galaxy: Awaited<ReturnType<typeof getGalaxyData>>,
): LoadedAgentContext {
  return {
    globalOverview: buildGlobalOverview(galaxy),
    scope: 'hub',
  };
}

export async function loadAgentContext(
  input?: AgentRequestContextInput,
): Promise<LoadedAgentContext> {
  const [entries, galaxy] = await Promise.all([
    getGalaxyNodeEntries(),
    getGalaxyData(),
  ]);
  const globalOverview = buildGlobalOverview(galaxy);

  if (!input || input.routeType === 'hub') {
    return {
      globalOverview,
      scope: 'hub',
    };
  }

  const star = galaxy.starsById[input.starId];
  const planet = galaxy.planetsById[input.planetId];

  if (!star || !planet || planet.starId !== star.id) {
    return buildHubContext(galaxy);
  }

  const currentStar = {
    description: star.description,
    id: star.id,
    name: star.name,
  };
  const currentPlanet = {
    description: planet.description,
    highlights:
      planet.pageType === 'gallery' ? mapGalleryHighlight(planet.id) : undefined,
    id: planet.id,
    name: planet.name,
    nodes: planet.articles.map(mapNodeSummaryFromArticle),
    pageType: planet.pageType,
    starId: star.id,
  };

  if (input.routeType === 'planet') {
    return {
      currentPlanet,
      currentStar,
      globalOverview,
      scope: 'planet',
    };
  }

  const entry = entries.find(
    (candidate) =>
      candidate.slug === input.slug &&
      candidate.data.starId === input.starId &&
      candidate.data.planetId === input.planetId,
  );

  if (!entry) {
    return {
      currentPlanet,
      currentStar,
      globalOverview,
      scope: 'planet',
    };
  }

  return {
    currentNode: {
      ...mapNodeSummaryFromEntry(entry),
      body: entry.body,
    },
    currentPlanet,
    currentStar,
    globalOverview,
    scope: 'node',
  };
}
