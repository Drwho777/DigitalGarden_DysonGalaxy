import type { NodeFrontmatter, StarConfig } from '../../src/types/galaxy';

export const fixtureStars: StarConfig[] = [
  {
    id: 'tech',
    name: '工程与架构',
    description: '技术与系统设计沉淀。',
    color: '#FF4500',
    position: [0, 0, 0],
    aliases: ['tech', '工程', '技术'],
    planets: [
      {
        id: 'p_garden',
        starId: 'tech',
        name: '数字花园日志',
        description: '数字花园构建记录。',
        pageType: 'article_list',
        orbitDistance: 60,
        orbitSpeed: 0.008,
        tilt: 0.2,
        color: '#FF8C00',
        aliases: ['数字花园', 'garden'],
      },
    ],
  },
  {
    id: 'phil',
    name: '哲学思辨',
    description: '思想碎片与阅读笔记。',
    color: '#9370DB',
    position: [320, 80, -180],
    aliases: ['phil', '哲学'],
    planets: [
      {
        id: 'p_exist',
        starId: 'phil',
        name: '存在主义笔记',
        description: '存在主义阅读笔记。',
        pageType: 'article_list',
        orbitDistance: 48,
        orbitSpeed: 0.01,
        tilt: 0.5,
        color: '#DA70D6',
        aliases: ['存在主义', 'exist'],
      },
    ],
  },
  {
    id: 'acg',
    name: 'ACG 档案库',
    description: 'ACG 与视觉档案。',
    color: '#00FA9A',
    position: [-260, -120, 220],
    aliases: ['acg', '二次元', '动画'],
    planets: [
      {
        id: 'p_gallery',
        starId: 'acg',
        name: '阿卡夏幻影展馆',
        description: '画廊页面入口。',
        pageType: 'gallery',
        orbitDistance: 70,
        orbitSpeed: 0.006,
        tilt: -0.1,
        color: '#00FA9A',
        aliases: ['画廊', '展馆', 'gallery'],
      },
    ],
  },
];

export const fixtureNodes: NodeFrontmatter[] = [
  {
    title: '从平面到宇宙：为什么我选择 3D 星系作为知识结构？',
    slug: 'why-3d-galaxy',
    starId: 'tech',
    planetId: 'p_garden',
    summary: '用宇宙隐喻重建个人知识系统。',
    tags: ['Astro', 'Three.js'],
    publishedAt: new Date('2026-03-06'),
    heroImage: '/images/hero-garden.svg',
  },
  {
    title: 'Astro 与 Three.js 共存时，首屏性能应该先守住什么？',
    slug: 'astro-3d-performance',
    starId: 'tech',
    planetId: 'p_garden',
    summary: '先守住数据边界和渲染预算。',
    tags: ['Performance'],
    publishedAt: new Date('2026-03-05'),
    heroImage: '/images/hero-performance.svg',
  },
  {
    title: '存在主义与赛博空间：为什么灵魂也需要一个可导航的界面？',
    slug: 'existential-cyberspace',
    starId: 'phil',
    planetId: 'p_exist',
    summary: '界面也在塑造人的存在感。',
    tags: ['Philosophy'],
    publishedAt: new Date('2026-03-04'),
    heroImage: '/images/hero-cyberspace.svg',
  },
];

const hydratedStars = fixtureStars.map((star) => ({
    ...star,
    totalNodes: star.id === 'tech' ? 2 : star.id === 'phil' ? 1 : 0,
    planets: star.planets.map((planet) => {
      const articles = fixtureNodes
        .filter((node) => node.starId === star.id && node.planetId === planet.id)
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
        .map((node) => ({
          ...node,
          href: `/read/${node.starId}/${node.planetId}/${node.slug}`,
        }));

      return {
        ...planet,
        nodeCount: articles.length,
        articles,
      };
    }),
  }));

export const fixtureHydratedGalaxy = {
  planetsById: Object.fromEntries(
    hydratedStars.flatMap((star) =>
    star.planets.map((planet) => [planet.id, planet]),
  ),
  ),
  stars: hydratedStars,
  starsById: Object.fromEntries(hydratedStars.map((star) => [star.id, star])),
};

export const fixtureNodeEntries = fixtureNodes.map((node) => ({
  body: `# ${node.title}\n\n${node.summary}`,
  collection: 'nodes',
  data: {
    heroImage: node.heroImage,
    planetId: node.planetId,
    publishedAt: node.publishedAt,
    starId: node.starId,
    summary: node.summary,
    tags: node.tags,
    title: node.title,
  },
  id: `nodes/${node.slug}`,
  slug: node.slug,
}));

export const fixtureLoadedHubContext = {
  globalOverview: {
    stars: fixtureHydratedGalaxy.stars.map((star) => ({
      description: star.description,
      id: star.id,
      name: star.name,
      nodeCount: star.totalNodes,
      planetCount: star.planets.length,
    })),
    featuredPlanets: [
      {
        description: fixtureStars[0].planets[0].description,
        id: fixtureStars[0].planets[0].id,
        name: fixtureStars[0].planets[0].name,
        nodeCount: 2,
        pageType: fixtureStars[0].planets[0].pageType,
        starId: fixtureStars[0].id,
        starName: fixtureStars[0].name,
      },
      {
        description: fixtureStars[1].planets[0].description,
        id: fixtureStars[1].planets[0].id,
        name: fixtureStars[1].planets[0].name,
        nodeCount: 1,
        pageType: fixtureStars[1].planets[0].pageType,
        starId: fixtureStars[1].id,
        starName: fixtureStars[1].name,
      },
    ],
    recentNodes: [
      {
        planetId: fixtureNodes[0].planetId,
        planetName: fixtureStars[0].planets[0].name,
        publishedAt: fixtureNodes[0].publishedAt.toISOString(),
        slug: fixtureNodes[0].slug,
        starId: fixtureNodes[0].starId,
        starName: fixtureStars[0].name,
        summary: fixtureNodes[0].summary,
        title: fixtureNodes[0].title,
      },
      {
        planetId: fixtureNodes[1].planetId,
        planetName: fixtureStars[0].planets[0].name,
        publishedAt: fixtureNodes[1].publishedAt.toISOString(),
        slug: fixtureNodes[1].slug,
        starId: fixtureNodes[1].starId,
        starName: fixtureStars[0].name,
        summary: fixtureNodes[1].summary,
        title: fixtureNodes[1].title,
      },
      {
        planetId: fixtureNodes[2].planetId,
        planetName: fixtureStars[1].planets[0].name,
        publishedAt: fixtureNodes[2].publishedAt.toISOString(),
        slug: fixtureNodes[2].slug,
        starId: fixtureNodes[2].starId,
        starName: fixtureStars[1].name,
        summary: fixtureNodes[2].summary,
        title: fixtureNodes[2].title,
      },
    ],
  },
  scope: 'hub' as const,
} satisfies import('../../src/lib/agent/context-loader').LoadedAgentContext;

export const fixtureLoadedNodeContext = {
  currentNode: {
    body: fixtureNodeEntries[0].body,
    href: '/read/tech/p_garden/why-3d-galaxy',
    publishedAt: fixtureNodes[0].publishedAt.toISOString(),
    slug: fixtureNodes[0].slug,
    summary: fixtureNodes[0].summary,
    tags: fixtureNodes[0].tags,
    title: fixtureNodes[0].title,
  },
  currentPlanet: {
    description: fixtureStars[0].planets[0].description,
    id: fixtureStars[0].planets[0].id,
    name: fixtureStars[0].planets[0].name,
    nodes: fixtureHydratedGalaxy.stars[0].planets[0].articles.map((article) => ({
      href: article.href,
      publishedAt: article.publishedAt.toISOString(),
      slug: article.slug,
      summary: article.summary,
      tags: article.tags,
      title: article.title,
    })),
    pageType: 'article_list' as const,
    starId: fixtureStars[0].id,
  },
  currentStar: {
    description: fixtureStars[0].description,
    id: fixtureStars[0].id,
    name: fixtureStars[0].name,
  },
  globalOverview: fixtureLoadedHubContext.globalOverview,
  scope: 'node' as const,
} satisfies import('../../src/lib/agent/context-loader').LoadedAgentContext;

export const fixtureLoadedPlanetContext = {
  currentPlanet: fixtureLoadedNodeContext.currentPlanet,
  currentStar: fixtureLoadedNodeContext.currentStar,
  globalOverview: fixtureLoadedHubContext.globalOverview,
  scope: 'planet' as const,
} satisfies import('../../src/lib/agent/context-loader').LoadedAgentContext;
