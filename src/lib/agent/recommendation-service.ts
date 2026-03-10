import type {
  AgentResponse,
  OpenPathAction,
  TeleportAction,
} from '../../types/agent';
import type { AgentRequestContextInput } from '../../types/agent-context';
import type { GalaxyData } from '../galaxy-data';
import type { LoadedAgentContext } from './context-loader';

export interface RecommendationServiceInput {
  context?: AgentRequestContextInput;
  message: string;
  requestId?: string;
}

export interface RecommendationServiceResult {
  status: 200 | 422 | 500;
  response: AgentResponse;
}

export interface SemanticRecommendationMatch {
  planetId?: string;
  score?: number;
  slug?: string;
}

export interface RecommendationService {
  respond(input: RecommendationServiceInput): Promise<RecommendationServiceResult>;
}

type RecommendationMode =
  | 'contextual_recommendation'
  | 'recent_planets'
  | 'recent_nodes'
  | 'relationship_map';

interface NodeReference {
  href: string;
  planetId: string;
  planetName: string;
  publishedAt: Date;
  slug: string;
  starId: string;
  starName: string;
  summary: string;
  tags: string[];
  title: string;
}

interface PlanetReference {
  description: string;
  id: string;
  latestNodeHref: string | null;
  latestPublishedAt: Date | null;
  latestTitle: string | null;
  name: string;
  nodeCount: number;
  starId: string;
  starName: string;
}

interface RankedNodeRecommendation extends NodeReference {
  reasons: string[];
  score: number;
}

interface RankedPlanetRecommendation extends PlanetReference {
  reasons: string[];
  score: number;
}

const EMPTY_MESSAGE_RESPONSE: AgentResponse = {
  message: '`message` is required.',
  action: null,
};

const RECOMMENDATION_FALLBACK_MESSAGE =
  '我还没找到足够清晰的推荐线索。你可以再具体一点，比如“推荐一篇讲 3D 架构的文章”或“最近更新的几个星球”。';

const RECOMMENDATION_STOPWORDS = [
  /推荐/gu,
  /相关/gu,
  /类似/gu,
  /文章/gu,
  /星球/gu,
  /内容/gu,
  /延伸/gu,
  /还想看/gu,
  /接下来/gu,
  /最近/gu,
  /更新/gu,
  /新增/gu,
  /最新/gu,
  /关键节点/gu,
  /关系/gu,
  /脉络/gu,
  /一篇/gu,
  /几篇/gu,
  /什么/gu,
  /看看/gu,
  /先看/gu,
  /看/gu,
  /读/gu,
  /这个/gu,
  /哪些/gu,
  /一下/gu,
];

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function formatDate(value: Date | string | null) {
  if (!value) {
    return '未知';
  }

  const serialized = value instanceof Date ? value.toISOString() : value;
  return serialized.slice(0, 10);
}

function createTeleportAction(
  targetId: string,
  targetType: TeleportAction['targetType'],
): TeleportAction {
  return {
    type: 'TELEPORT',
    targetId,
    targetType,
  };
}

function createOpenPathAction(path: string): OpenPathAction {
  return {
    type: 'OPEN_PATH',
    path,
  };
}

function extractKeywords(message: string) {
  let current = normalizeText(message);

  for (const pattern of RECOMMENDATION_STOPWORDS) {
    current = current.replace(pattern, ' ');
  }

  const asciiTokens = current.match(/[a-z0-9.+-]+/g) ?? [];
  const chineseSegments = current.match(/[\u4e00-\u9fff]+/g) ?? [];
  const chineseTokens = chineseSegments.flatMap((segment) => {
    const tokens = new Set<string>();
    if (segment.length <= 4) {
      tokens.add(segment);
    }

    for (let size = 2; size <= Math.min(4, segment.length); size += 1) {
      for (let index = 0; index <= segment.length - size; index += 1) {
        tokens.add(segment.slice(index, index + size));
      }
    }

    return [...tokens];
  });

  return uniqueStrings([...asciiTokens, ...chineseTokens]).filter(
    (token) => token.length >= 2 || /[a-z0-9]/.test(token),
  );
}

function scoreKeywordMatches(keywords: string[], fields: string[]) {
  const normalizedFields = fields.map(normalizeText).filter(Boolean);
  const matchedKeywords = uniqueStrings(
    keywords.filter((keyword) =>
      normalizedFields.some((field) => field.includes(keyword)),
    ),
  );

  return {
    matchedKeywords,
    score: Math.min(matchedKeywords.length * 2, 6),
  };
}

function resolveRecommendationMode(message: string): RecommendationMode {
  if (/最近更新/u.test(message) || /最新更新/u.test(message)) {
    return 'recent_planets';
  }

  if (
    /最近新增/u.test(message) ||
    /新增内容/u.test(message) ||
    /最新内容/u.test(message)
  ) {
    return 'recent_nodes';
  }

  if (
    /关键节点/u.test(message) ||
    /关系/u.test(message) ||
    /脉络/u.test(message) ||
    /主干是什么/u.test(message)
  ) {
    return 'relationship_map';
  }

  return 'contextual_recommendation';
}

function prefersPlanetRecommendation(message: string) {
  return /星球|板块|专题|主题|入口|栏目/u.test(message);
}

function prefersNodeRecommendation(message: string) {
  return /文章|一篇|看什么|读什么|先看什么/u.test(message);
}

function getCurrentTags(context: LoadedAgentContext) {
  if (context.currentNode) {
    return [...context.currentNode.tags];
  }

  if (context.currentPlanet) {
    return uniqueStrings(
      context.currentPlanet.nodes.flatMap((node) => node.tags),
    );
  }

  return [];
}

function collectNodeReferences(galaxy: GalaxyData): NodeReference[] {
  return galaxy.stars.flatMap((star) =>
    star.planets.flatMap((planet) =>
      planet.articles.map((article) => ({
        href: article.href,
        planetId: planet.id,
        planetName: planet.name,
        publishedAt: article.publishedAt,
        slug: article.slug,
        starId: star.id,
        starName: star.name,
        summary: article.summary,
        tags: [...article.tags],
        title: article.title,
      })),
    ),
  );
}

function collectPlanetReferences(galaxy: GalaxyData): PlanetReference[] {
  return galaxy.stars.flatMap((star) =>
    star.planets.map((planet) => {
      const latestArticle = planet.articles[0] ?? null;

      return {
        description: planet.description,
        id: planet.id,
        latestNodeHref: latestArticle?.href ?? null,
        latestPublishedAt: latestArticle?.publishedAt ?? null,
        latestTitle: latestArticle?.title ?? null,
        name: planet.name,
        nodeCount: planet.nodeCount,
        starId: star.id,
        starName: star.name,
      };
    }),
  );
}

function renderReasonList(reasons: string[]) {
  return reasons.slice(0, 3).map((reason) => `- ${reason}`);
}

function buildSemanticNodeScoreMap(matches: SemanticRecommendationMatch[]) {
  const scoreMap = new Map<string, number>();

  for (const match of matches) {
    if (!match.slug) {
      continue;
    }

    scoreMap.set(match.slug, match.score ?? 3);
  }

  return scoreMap;
}

function buildSemanticPlanetScoreMap(matches: SemanticRecommendationMatch[]) {
  const scoreMap = new Map<string, number>();

  for (const match of matches) {
    if (!match.planetId) {
      continue;
    }

    scoreMap.set(match.planetId, match.score ?? 2);
  }

  return scoreMap;
}

function rankNodeRecommendations(input: {
  context: LoadedAgentContext;
  galaxy: GalaxyData;
  keywords: string[];
  semanticMatches: SemanticRecommendationMatch[];
}): RankedNodeRecommendation[] {
  const currentTags = getCurrentTags(input.context);
  const currentSlug = input.context.currentNode?.slug;
  const currentPlanetId = input.context.currentPlanet?.id;
  const currentStarId = input.context.currentStar?.id;
  const recentSlugs = new Set(
    collectNodeReferences(input.galaxy)
      .sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime())
      .slice(0, 3)
      .map((node) => node.slug),
  );
  const semanticScoreBySlug = buildSemanticNodeScoreMap(input.semanticMatches);

  return collectNodeReferences(input.galaxy)
    .filter((node) => node.slug !== currentSlug)
    .map((node) => {
      let score = 0;
      const reasons: string[] = [];

      if (currentPlanetId && node.planetId === currentPlanetId) {
        score += 6;
        reasons.push(`和你当前所在的「${node.planetName}」属于同一星球`);
      } else if (currentStarId && node.starId === currentStarId) {
        score += 3;
        reasons.push(`仍在「${node.starName}」这条主线上`);
      }

      const sharedTags = currentTags.filter((tag) => node.tags.includes(tag));
      if (sharedTags.length > 0) {
        score += Math.min(sharedTags.length * 2, 4);
        reasons.push(`共享标签：${sharedTags.join('、')}`);
      }

      const keywordMatch = scoreKeywordMatches(input.keywords, [
        node.title,
        node.summary,
        ...node.tags,
        node.planetName,
        node.starName,
      ]);
      if (keywordMatch.score > 0) {
        score += keywordMatch.score;
        reasons.push(
          `命中你的问题关键词：${keywordMatch.matchedKeywords.join('、')}`,
        );
      }

      if (recentSlugs.has(node.slug)) {
        score += 1;
        reasons.push('属于最近更新的内容线索');
      }

      const semanticScore = semanticScoreBySlug.get(node.slug);
      if (semanticScore) {
        score += semanticScore;
        reasons.push('和预留的语义召回结果重合');
      }

      return {
        ...node,
        reasons,
        score,
      };
    })
    .filter((node) => node.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return right.publishedAt.getTime() - left.publishedAt.getTime();
    });
}

function rankPlanetRecommendations(input: {
  context: LoadedAgentContext;
  galaxy: GalaxyData;
  keywords: string[];
  semanticMatches: SemanticRecommendationMatch[];
}): RankedPlanetRecommendation[] {
  const currentPlanetId = input.context.currentPlanet?.id;
  const currentStarId = input.context.currentStar?.id;
  const recentPlanetIds = new Set(
    collectPlanetReferences(input.galaxy)
      .filter((planet) => planet.latestPublishedAt)
      .sort((left, right) => {
        return (
          (right.latestPublishedAt?.getTime() ?? 0) -
          (left.latestPublishedAt?.getTime() ?? 0)
        );
      })
      .slice(0, 3)
      .map((planet) => planet.id),
  );
  const semanticScoreByPlanetId = buildSemanticPlanetScoreMap(
    input.semanticMatches,
  );

  return collectPlanetReferences(input.galaxy)
    .filter((planet) => planet.nodeCount > 0)
    .map((planet) => {
      let score = 1;
      const reasons: string[] = [];

      if (currentStarId && planet.starId === currentStarId) {
        score += 4;
        reasons.push(`和当前位置同属「${planet.starName}」主题`);
      }

      if (currentPlanetId && planet.id === currentPlanetId) {
        score -= 1;
      }

      const keywordMatch = scoreKeywordMatches(input.keywords, [
        planet.name,
        planet.description,
        planet.starName,
        planet.latestTitle ?? '',
      ]);
      if (keywordMatch.score > 0) {
        score += keywordMatch.score;
        reasons.push(
          `命中你的问题关键词：${keywordMatch.matchedKeywords.join('、')}`,
        );
      }

      if (recentPlanetIds.has(planet.id)) {
        score += 2;
        reasons.push(`最近更新于 ${formatDate(planet.latestPublishedAt)}`);
      }

      const semanticScore = semanticScoreByPlanetId.get(planet.id);
      if (semanticScore) {
        score += semanticScore;
        reasons.push('和预留的语义召回结果重合');
      }

      return {
        ...planet,
        reasons,
        score,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return (
        (right.latestPublishedAt?.getTime() ?? 0) -
        (left.latestPublishedAt?.getTime() ?? 0)
      );
    });
}

function buildSecondaryLines(input: {
  primaryNode: RankedNodeRecommendation | null;
  primaryPlanet: RankedPlanetRecommendation | null;
  nodes: RankedNodeRecommendation[];
  planets: RankedPlanetRecommendation[];
}) {
  const lines: string[] = [];
  const usedNodeSlugs = new Set<string>();
  const usedPlanetIds = new Set<string>();

  if (input.primaryNode) {
    usedNodeSlugs.add(input.primaryNode.slug);
    usedPlanetIds.add(input.primaryNode.planetId);
  }

  if (input.primaryPlanet) {
    usedPlanetIds.add(input.primaryPlanet.id);
  }

  for (const node of input.nodes) {
    if (usedNodeSlugs.has(node.slug) || usedPlanetIds.has(node.planetId)) {
      continue;
    }

    usedNodeSlugs.add(node.slug);
    usedPlanetIds.add(node.planetId);
    lines.push(`- 《${node.title}》：${node.summary}，入口 ${node.href}`);

    if (lines.length >= 2) {
      return lines;
    }
  }

  for (const planet of input.planets) {
    if (usedPlanetIds.has(planet.id)) {
      continue;
    }

    usedPlanetIds.add(planet.id);
    lines.push(
      `- 「${planet.name}」：目前有 ${planet.nodeCount} 篇内容，最新一篇是《${planet.latestTitle ?? '暂无'}》`,
    );

    if (lines.length >= 2) {
      return lines;
    }
  }

  return lines;
}

function buildContextualRecommendationResponse(input: {
  context: LoadedAgentContext;
  galaxy: GalaxyData;
  message: string;
  semanticMatches: SemanticRecommendationMatch[];
}) {
  const keywords = extractKeywords(input.message);
  const nodeRecommendations = rankNodeRecommendations({
    context: input.context,
    galaxy: input.galaxy,
    keywords,
    semanticMatches: input.semanticMatches,
  });
  const planetRecommendations = rankPlanetRecommendations({
    context: input.context,
    galaxy: input.galaxy,
    keywords,
    semanticMatches: input.semanticMatches,
  });

  const primaryNode = nodeRecommendations[0] ?? null;
  const primaryPlanet = planetRecommendations[0] ?? null;

  if (!primaryNode && !primaryPlanet) {
    return {
      action: null,
      message: RECOMMENDATION_FALLBACK_MESSAGE,
    } satisfies AgentResponse;
  }

  const chooseNode =
    Boolean(primaryNode) &&
    (
      prefersNodeRecommendation(input.message) ||
      (!prefersPlanetRecommendation(input.message) &&
        input.context.scope === 'node' &&
        (primaryNode?.score ?? 0) >= (primaryPlanet?.score ?? 0))
    );

  const secondaryLines = buildSecondaryLines({
    nodes: nodeRecommendations,
    planets: planetRecommendations,
    primaryNode: chooseNode ? primaryNode : null,
    primaryPlanet: chooseNode ? null : primaryPlanet,
  });

  if (chooseNode && primaryNode) {
    return {
      action: createOpenPathAction(primaryNode.href),
      message: [
        `我先推荐你看《${primaryNode.title}》。`,
        '',
        '推荐理由：',
        ...renderReasonList(primaryNode.reasons),
        '',
        `它位于「${primaryNode.planetName}」星球，入口是 ${primaryNode.href}`,
        ...(secondaryLines.length > 0
          ? ['', '你可能还想看：', ...secondaryLines]
          : []),
      ].join('\n'),
    } satisfies AgentResponse;
  }

  const planet = primaryPlanet ?? null;
  if (!planet) {
    return {
      action: null,
      message: RECOMMENDATION_FALLBACK_MESSAGE,
    } satisfies AgentResponse;
  }

  return {
    action: createTeleportAction(planet.id, 'planet'),
    message: [
      `我先推荐你去「${planet.name}」这个星球逛一圈。`,
      '',
      '推荐理由：',
      ...renderReasonList(planet.reasons),
      '',
      `这里目前有 ${planet.nodeCount} 篇内容，最新一篇是《${planet.latestTitle ?? '暂无'}》。`,
      ...(secondaryLines.length > 0
        ? ['', '你可能还想看：', ...secondaryLines]
        : []),
    ].join('\n'),
  } satisfies AgentResponse;
}

function buildRecentPlanetsResponse(galaxy: GalaxyData) {
  const planets = collectPlanetReferences(galaxy)
    .filter((planet) => planet.latestPublishedAt)
    .sort((left, right) => {
      return (
        (right.latestPublishedAt?.getTime() ?? 0) -
        (left.latestPublishedAt?.getTime() ?? 0)
      );
    })
    .slice(0, 3);

  const primary = planets[0] ?? null;
  if (!primary) {
    return {
      action: null,
      message: RECOMMENDATION_FALLBACK_MESSAGE,
    } satisfies AgentResponse;
  }

  return {
    action: createTeleportAction(primary.id, 'planet'),
    message: [
      '最近更新更活跃的星球是：',
      ...planets.map(
        (planet) =>
          `- 「${planet.name}」：${formatDate(planet.latestPublishedAt)} 更新，最新一篇是《${planet.latestTitle ?? '暂无'}》`,
      ),
      '',
      `如果你想先去最近更新最集中的地方，我已经把跃迁目标锁定到「${primary.name}」。`,
    ].join('\n'),
  } satisfies AgentResponse;
}

function buildRecentNodesResponse(galaxy: GalaxyData) {
  const nodes = collectNodeReferences(galaxy)
    .sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime())
    .slice(0, 3);

  const primary = nodes[0] ?? null;
  if (!primary) {
    return {
      action: null,
      message: RECOMMENDATION_FALLBACK_MESSAGE,
    } satisfies AgentResponse;
  }

  return {
    action: createOpenPathAction(primary.href),
    message: [
      '最近新增的内容可以从这几篇开始：',
      ...nodes.map(
        (node) => `- ${formatDate(node.publishedAt)}《${node.title}》：${node.summary}`,
      ),
      '',
      `如果你想顺着最新线索直接看下去，我先带你打开《${primary.title}》。`,
    ].join('\n'),
  } satisfies AgentResponse;
}

function buildRelationshipResponse(
  galaxy: GalaxyData,
  context: LoadedAgentContext,
) {
  const nodes = collectNodeReferences(galaxy)
    .sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime());

  if (
    context.scope === 'node' &&
    context.currentNode &&
    context.currentPlanet &&
    context.currentStar
  ) {
    const siblingNodes = nodes
      .filter(
        (node) =>
          node.planetId === context.currentPlanet?.id &&
          node.slug !== context.currentNode?.slug,
      )
      .slice(0, 2);
    const crossStarNode = nodes.find(
      (node) => node.starId !== context.currentStar?.id,
    );

    return {
      action: createTeleportAction(context.currentPlanet.id, 'planet'),
      message: [
        '从当前位置看，这条线索的关系可以这样抓：',
        `- 当前文章《${context.currentNode.title}》属于「${context.currentPlanet.name}」，隶属「${context.currentStar.name}」主题`,
        ...(siblingNodes.length > 0
          ? [
              `- 同星球的关键节点是 ${siblingNodes
                .map((node) => `《${node.title}》`)
                .join('、')}`,
            ]
          : []),
        ...(crossStarNode
          ? [
              `- 如果你想横向跳到另一条主题线，可以再看《${crossStarNode.title}》，它来自「${crossStarNode.starName}」`,
            ]
          : []),
        '',
        `我已经把跃迁目标锁定到「${context.currentPlanet.name}」，你可以从这里继续顺着关键节点往下走。`,
      ].join('\n'),
    } satisfies AgentResponse;
  }

  const topPlanet = collectPlanetReferences(galaxy)
    .filter((planet) => planet.nodeCount > 0)
    .sort((left, right) => {
      if (right.nodeCount !== left.nodeCount) {
        return right.nodeCount - left.nodeCount;
      }

      return (
        (right.latestPublishedAt?.getTime() ?? 0) -
        (left.latestPublishedAt?.getTime() ?? 0)
      );
    })[0] ?? null;

  if (!topPlanet) {
    return {
      action: null,
      message: RECOMMENDATION_FALLBACK_MESSAGE,
    } satisfies AgentResponse;
  }

  return {
    action: createTeleportAction(topPlanet.id, 'planet'),
    message: [
      '如果从整个花园看关系与关键节点，目前可以这样抓主线：',
      `- 主干星球是「${topPlanet.name}」，因为它目前承载了 ${topPlanet.nodeCount} 篇内容`,
      ...nodes.slice(0, 3).map(
        (node, index) =>
          `- 关键节点 ${index + 1}：《${node.title}》，它位于「${node.starName} / ${node.planetName}」`,
      ),
      '',
      `如果你想顺着主干入场，我先把你送到「${topPlanet.name}」。`,
    ].join('\n'),
  } satisfies AgentResponse;
}

async function loadGalaxyData() {
  const { getGalaxyData } = await import('../galaxy-data');
  return getGalaxyData();
}

async function loadStructuredAgentContext(
  input?: AgentRequestContextInput,
) {
  const { loadAgentContext } = await import('./context-loader');
  return loadAgentContext(input);
}

async function loadEmptySemanticMatches(): Promise<
  SemanticRecommendationMatch[]
> {
  return [];
}

export function createRecommendationService(options: {
  loadContext?: (
    input?: AgentRequestContextInput,
  ) => Promise<LoadedAgentContext>;
  loadGalaxy?: () => Promise<GalaxyData>;
  loadSemanticMatches?: (
    input: RecommendationServiceInput,
  ) => Promise<SemanticRecommendationMatch[]>;
} = {}): RecommendationService {
  const {
    loadContext = loadStructuredAgentContext,
    loadGalaxy = loadGalaxyData,
    loadSemanticMatches = loadEmptySemanticMatches,
  } = options;

  return {
    async respond(input) {
      const normalizedMessage = input.message.trim();
      if (!normalizedMessage) {
        return {
          status: 422,
          response: EMPTY_MESSAGE_RESPONSE,
        };
      }

      const [structuredContext, galaxy, semanticMatches] = await Promise.all([
        loadContext(input.context),
        loadGalaxy(),
        loadSemanticMatches(input).catch(() => []),
      ]);
      const mode = resolveRecommendationMode(normalizedMessage);

      const response =
        mode === 'recent_planets'
          ? buildRecentPlanetsResponse(galaxy)
          : mode === 'recent_nodes'
            ? buildRecentNodesResponse(galaxy)
            : mode === 'relationship_map'
              ? buildRelationshipResponse(galaxy, structuredContext)
              : buildContextualRecommendationResponse({
                  context: structuredContext,
                  galaxy,
                  message: normalizedMessage,
                  semanticMatches,
                });

      return {
        status: 200,
        response,
      };
    },
  };
}

export const recommendationService = createRecommendationService();
