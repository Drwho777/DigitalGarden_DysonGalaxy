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
