import type {
  AgentRecommendationItem,
  AgentRecommendationsPayload,
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
  /一个/gu,
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

function createRecommendationResponse(
  message: string,
  mode: AgentRecommendationsPayload['mode'],
  items: AgentRecommendationItem[],
): AgentResponse {
  return {
    action: null,
    message,
    recommendations:
      items.length > 0
        ? {
            items,
            mode,
          }
        : null,
  };
}

function createNodeRecommendationItem(
  node: RankedNodeRecommendation | NodeReference,
  kind: AgentRecommendationItem['kind'],
): AgentRecommendationItem {
  return {
    action: createOpenPathAction(node.href),
    badge: 'ARTICLE',
    description: node.summary,
    hint: `${formatDate(node.publishedAt)} · ${node.starName} / ${node.planetName}`,
    id: `node:${node.slug}`,
    kind,
    title: node.title,
  };
}

function createPlanetRecommendationItem(
  planet: RankedPlanetRecommendation | PlanetReference,
  kind: AgentRecommendationItem['kind'],
): AgentRecommendationItem {
  return {
    action: createTeleportAction(planet.id, 'planet'),
    badge: 'PLANET',
    description:
      planet.description || `当前有 ${planet.nodeCount} 篇内容可继续浏览。`,
    hint: `${planet.starName} · ${planet.nodeCount} 篇内容${
      planet.latestTitle ? ` · 最新《${planet.latestTitle}》` : ''
    }`,
    id: `planet:${planet.id}`,
    kind,
    title: planet.name,
  };
}

function toRecommendationItems<T>(
  entries: T[],
  mapEntry: (entry: T, kind: AgentRecommendationItem['kind']) => AgentRecommendationItem,
  limit = 3,
) {
  return entries.slice(0, limit).map((entry, index) => {
    return mapEntry(entry, index === 0 ? 'primary' : 'secondary');
  });
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

  if (/最近新增/u.test(message) || /新增内容/u.test(message) || /最新内容/u.test(message)) {
    return 'recent_nodes';
  }

  if (/关键节点/u.test(message) || /关系/u.test(message) || /脉络/u.test(message) || /主干是什么/u.test(message)) {
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
        reasons.push(`和当前所在位置同属「${planet.starName}」主线`);
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

  if (chooseNode && primaryNode) {
    return createRecommendationResponse(
      [
        `我先帮你筛出了一篇最贴近当前问题的文章：《${primaryNode.title}》。`,
        '',
        '推荐理由：',
        ...renderReasonList(primaryNode.reasons),
        '',
        '下面给你主推荐和备选项；只有点击后，才会执行打开。',
      ].join('\n'),
      'recommendation',
      toRecommendationItems(nodeRecommendations, createNodeRecommendationItem),
    );
  }

  const planet = primaryPlanet ?? null;
  if (!planet) {
    return {
      action: null,
      message: RECOMMENDATION_FALLBACK_MESSAGE,
    } satisfies AgentResponse;
  }

  return createRecommendationResponse(
    [
      `我先帮你圈定一个更适合继续探索的入口：${planet.name}。`,
      '',
      '推荐理由：',
      ...renderReasonList(planet.reasons),
      '',
      '下面给你主推荐和备选项；只有点击后，才会执行进入。',
    ].join('\n'),
    'recommendation',
    toRecommendationItems(
      planetRecommendations,
      createPlanetRecommendationItem,
    ),
  );
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

  return createRecommendationResponse(
    [
      '我把最近更新更活跃的星球入口先排出来了：',
      ...planets.map(
        (planet) =>
          `- ${planet.name}：${formatDate(planet.latestPublishedAt)} 更新，最新一篇是《${planet.latestTitle ?? '暂无'}》`,
      ),
      '',
      `首个入口是 ${primary.name}，但不会自动跳转；你可以先看候选再决定。`,
    ].join('\n'),
    'discovery',
    toRecommendationItems(planets, createPlanetRecommendationItem),
  );
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

  return createRecommendationResponse(
    [
      '最近新增的内容可以从这几篇开始：',
      ...nodes.map(
        (node) => `- ${formatDate(node.publishedAt)}《${node.title}》：${node.summary}`,
      ),
      '',
      `首个候选是《${primary.title}》，但不会自动打开；你可以先看候选再决定。`,
    ].join('\n'),
    'discovery',
    toRecommendationItems(nodes, createNodeRecommendationItem),
  );
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
    const currentNode = context.currentNode;
    const currentPlanet = context.currentPlanet;
    const currentStar = context.currentStar;
    const siblingNodes = nodes
      .filter(
        (node) =>
          node.planetId === currentPlanet.id &&
          node.slug !== currentNode.slug,
      )
      .slice(0, 2);
    const crossStarNode = nodes.find((node) => node.starId !== currentStar.id);

    const items: AgentRecommendationItem[] = [
      {
        action: createTeleportAction(currentPlanet.id, 'planet'),
        badge: 'PLANET',
        description: `回到 ${currentPlanet.name} 的星球视图，顺着同主题节点继续看。`,
        hint: `${currentStar.name} · ${currentPlanet.nodes.length} 篇内容`,
        id: `planet:${currentPlanet.id}`,
        kind: 'primary',
        title: currentPlanet.name,
      },
      ...siblingNodes
        .slice(0, 1)
        .map((node) => createNodeRecommendationItem(node, 'secondary')),
      ...(crossStarNode
        ? [createNodeRecommendationItem(crossStarNode, 'secondary')]
        : []),
    ];

    return createRecommendationResponse(
      [
        '从当前位置看，这条内容线索可以这样理解：',
        `- 当前文章《${currentNode.title}》属于 ${currentStar.name} / ${currentPlanet.name}`,
        ...(siblingNodes.length > 0
          ? [
              `- 同星球的关键节点还有：${siblingNodes
                .map((node) => `《${node.title}》`)
                .join('、')}`,
            ]
          : []),
        ...(crossStarNode
          ? [
              `- 如果你想横向跳到另一条主题线，可以再看《${crossStarNode.title}》`,
            ]
          : []),
        '',
        '下面给你一个主入口和延伸候选；点击后再执行跳转。',
      ].join('\n'),
      'discovery',
      items,
    );
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

  return createRecommendationResponse(
    [
      '如果从整座花园看关系和关键节点，目前可以先抓住这条主线：',
      `- 主干星球是 ${topPlanet.name}，因为它目前承载了 ${topPlanet.nodeCount} 篇内容`,
      ...nodes.slice(0, 3).map(
        (node, index) =>
          `- 关键节点 ${index + 1}：《${node.title}》，位于 ${node.starName} / ${node.planetName}`,
      ),
      '',
      '下面给你一个主入口和两个关键节点候选；点击后再执行跳转。',
    ].join('\n'),
    'discovery',
    [
      createPlanetRecommendationItem(topPlanet, 'primary'),
      ...nodes
        .slice(0, 2)
        .map((node) => createNodeRecommendationItem(node, 'secondary')),
    ],
  );
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
