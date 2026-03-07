# Digital Garden MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first end-to-end Digital Garden MVP: a Three.js hub page, real Markdown article routes, one gallery route, and a backend AI terminal that returns structured teleport actions.

**Architecture:** Keep Astro responsible for routing, layout, and content loading. Keep Three.js and GSAP in client-side modules, with the scene owning camera state and DOM updates for the hub. Use local `src/data/galaxy.ts` plus Astro Content Collections as the only MVP data sources, and keep the AI contract backend-first with a stable `{ message, action }` response shape.

**Tech Stack:** Astro 5, TypeScript, Tailwind CSS 4, Three.js, GSAP, Astro Content Collections, Vitest

---

### Task 1: Add MVP Tooling and Scripts

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`

**Step 1: Install the missing runtime and test dependencies**

Run:

```bash
npm install lucide
npm install -D vitest
```

Expected: `package.json` gains the new dependency entries and `package-lock.json` updates cleanly.

**Step 2: Add project scripts for checking and tests**

Update `package.json` scripts to include:

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "astro": "astro",
    "check": "astro check",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**Step 3: Create a minimal Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

**Step 4: Run the empty test command to verify the runner is wired**

Run:

```bash
npm run test
```

Expected: Vitest starts and exits with `No test files found` or equivalent. That is acceptable at this point.

**Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add MVP test and check scripts"
```

### Task 2: Define the Galaxy Model and Seed Markdown Content

**Files:**
- Create: `src/types/galaxy.ts`
- Create: `src/data/galaxy.ts`
- Create: `src/content/config.ts`
- Create: `src/content/nodes/tech/p_garden/why-3d-galaxy.md`
- Create: `src/content/nodes/tech/p_garden/astro-3d-performance.md`
- Create: `src/content/nodes/phil/p_exist/existential-cyberspace.md`
- Create: `public/images/hero-garden.svg`
- Create: `public/images/hero-performance.svg`
- Create: `public/images/hero-cyberspace.svg`

**Step 1: Create the shared domain types**

Create `src/types/galaxy.ts` with the exact MVP types:

```ts
export type PlanetPageType = 'article_list' | 'gallery';

export interface GalaxyLane {
  from: string;
  to: string;
}

export interface PlanetConfig {
  id: string;
  starId: string;
  name: string;
  description: string;
  pageType: PlanetPageType;
  orbitDistance: number;
  orbitSpeed: number;
  tilt: number;
  color: string;
  aliases: string[];
}

export interface StarConfig {
  id: string;
  name: string;
  description: string;
  color: string;
  position: [number, number, number];
  aliases: string[];
  planets: PlanetConfig[];
}

export interface NodeFrontmatter {
  title: string;
  slug: string;
  starId: string;
  planetId: string;
  summary: string;
  tags: string[];
  publishedAt: Date;
  heroImage: string;
}
```

**Step 2: Create the local galaxy configuration**

Create `src/data/galaxy.ts` with 3 stars and 3 planets for the MVP:

```ts
import type { GalaxyLane, StarConfig } from '../types/galaxy';

export const stars: StarConfig[] = [
  {
    id: 'tech',
    name: '工程与架构',
    description: '关于前端架构、系统设计与性能优化的硬核技术沉淀。',
    color: '#FF4500',
    position: [0, 0, 0],
    aliases: ['tech', '技术', '工程', '架构'],
    planets: [
      {
        id: 'p_garden',
        starId: 'tech',
        name: '数字花园日志',
        description: '记录构建 3D 交互博客的全过程。',
        pageType: 'article_list',
        orbitDistance: 60,
        orbitSpeed: 0.008,
        tilt: 0.2,
        color: '#FF8C00',
        aliases: ['garden', '数字花园', '花园日志'],
      },
    ],
  },
  {
    id: 'phil',
    name: '哲学思辨',
    description: '从虚无主义到存在主义的个人思想碎片。',
    color: '#9370DB',
    position: [350, 100, -200],
    aliases: ['phil', '哲学', '思辨'],
    planets: [
      {
        id: 'p_exist',
        starId: 'phil',
        name: '存在主义笔记',
        description: '萨特与加缪的读书感悟。',
        pageType: 'article_list',
        orbitDistance: 50,
        orbitSpeed: 0.01,
        tilt: 0.5,
        color: '#DA70D6',
        aliases: ['存在主义', 'exist', '存在主义笔记'],
      },
    ],
  },
  {
    id: 'acg',
    name: '二次元文化',
    description: '神作补完计划与动画叙事学分析。',
    color: '#00FA9A',
    position: [-300, -150, 250],
    aliases: ['acg', '动画', '二次元'],
    planets: [
      {
        id: 'p_gallery',
        starId: 'acg',
        name: '阿卡夏幻影展馆',
        description: 'ACG 交互画廊与视觉档案。',
        pageType: 'gallery',
        orbitDistance: 72,
        orbitSpeed: 0.006,
        tilt: -0.15,
        color: '#00FA9A',
        aliases: ['展馆', '画廊', 'gallery'],
      },
    ],
  },
];

export const lanes: GalaxyLane[] = [
  { from: 'tech', to: 'phil' },
  { from: 'tech', to: 'acg' },
  { from: 'phil', to: 'acg' },
];
```

**Step 3: Define the Astro Content Collection**

Create `src/content/config.ts`:

```ts
import { defineCollection, z } from 'astro:content';

const nodes = defineCollection({
  schema: z.object({
    title: z.string(),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    starId: z.string(),
    planetId: z.string(),
    summary: z.string(),
    tags: z.array(z.string()).default([]),
    publishedAt: z.coerce.date(),
    heroImage: z.string(),
  }),
});

export const collections = { nodes };
```

**Step 4: Seed three Markdown entries**

Use frontmatter like this in each Markdown file:

```md
---
title: 从平面到宇宙：为什么我们选择 3D 星系作为知识架构？
slug: why-3d-galaxy
starId: tech
planetId: p_garden
summary: 用宇宙隐喻重建个人知识系统的第一性原理。
tags:
  - Astro
  - Three.js
publishedAt: 2026-03-06
heroImage: /images/hero-garden.svg
---
```

Write real body content, not placeholder lorem ipsum. Keep each article short but coherent.

**Step 5: Add three local SVG hero images**

Use simple gradient or sci-fi line-art SVGs so the routes do not depend on external image hosts.

**Step 6: Run Astro type/content validation**

Run:

```bash
npm run check
```

Expected: PASS. If schema validation fails, fix frontmatter before moving on.

**Step 7: Commit**

```bash
git add src/types/galaxy.ts src/data/galaxy.ts src/content/config.ts src/content/nodes public/images
git commit -m "feat(content): add galaxy config and seed markdown content"
```

### Task 3: Build the Galaxy Aggregation Utilities Test-First

**Files:**
- Create: `src/lib/galaxy-model.ts`
- Create: `src/lib/galaxy-data.ts`
- Create: `tests/fixtures/galaxy-fixtures.ts`
- Create: `tests/lib/galaxy-model.test.ts`

**Step 1: Write the failing aggregation tests**

Create `tests/fixtures/galaxy-fixtures.ts` with two stars, two planets, and three mock node entries. Then create `tests/lib/galaxy-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hydrateGalaxy, buildArticleHref } from '../../src/lib/galaxy-model';
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
  });
});
```

**Step 2: Run the test to confirm it fails**

Run:

```bash
npm run test -- tests/lib/galaxy-model.test.ts
```

Expected: FAIL with `Cannot find module '../../src/lib/galaxy-model'` or missing export errors.

**Step 3: Implement the minimal aggregation module**

Create `src/lib/galaxy-model.ts` with:

```ts
import type { NodeFrontmatter, StarConfig } from '../types/galaxy';

export interface NodeSummary extends NodeFrontmatter {
  href: string;
}

export function buildArticleHref(node: Pick<NodeFrontmatter, 'starId' | 'planetId' | 'slug'>) {
  return `/read/${node.starId}/${node.planetId}/${node.slug}`;
}

export function hydrateGalaxy(stars: StarConfig[], nodes: NodeFrontmatter[]) {
  const enrichedStars = stars.map((star) => {
    const planets = star.planets.map((planet) => {
      const articles = nodes
        .filter((node) => node.starId === star.id && node.planetId === planet.id)
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
        .map((node) => ({ ...node, href: buildArticleHref(node) }));

      return {
        ...planet,
        nodeCount: articles.length,
        articles,
      };
    });

    const totalNodes = planets.reduce((sum, planet) => sum + planet.nodeCount, 0);

    return {
      ...star,
      totalNodes,
      planets,
    };
  });

  return {
    stars: enrichedStars,
    starsById: Object.fromEntries(enrichedStars.map((star) => [star.id, star])),
    planetsById: Object.fromEntries(
      enrichedStars.flatMap((star) => star.planets.map((planet) => [planet.id, planet])),
    ),
  };
}
```

Create `src/lib/galaxy-data.ts` as the Astro wrapper:

```ts
import { getCollection } from 'astro:content';
import { stars, lanes } from '../data/galaxy';
import { hydrateGalaxy } from './galaxy-model';

export async function getGalaxyData() {
  const entries = await getCollection('nodes');
  const nodes = entries.map((entry) => entry.data);
  return {
    ...hydrateGalaxy(stars, nodes),
    lanes,
  };
}
```

**Step 4: Run the test again**

Run:

```bash
npm run test -- tests/lib/galaxy-model.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/galaxy-model.ts src/lib/galaxy-data.ts tests/fixtures/galaxy-fixtures.ts tests/lib/galaxy-model.test.ts
git commit -m "feat(data): hydrate local galaxy model from markdown metadata"
```

### Task 4: Build the Agent Rule Matcher and API Route Test-First

**Files:**
- Create: `src/types/agent.ts`
- Create: `src/lib/agent/rule-matcher.ts`
- Create: `src/pages/api/agent.ts`
- Create: `tests/lib/rule-matcher.test.ts`

**Step 1: Write the failing matcher tests**

Create `tests/lib/rule-matcher.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { matchAgentAction } from '../../src/lib/agent/rule-matcher';
import { fixtureHydratedGalaxy } from '../fixtures/galaxy-fixtures';

describe('matchAgentAction', () => {
  it('matches a star alias and returns TELEPORT', () => {
    const response = matchAgentAction('带我去 ACG', fixtureHydratedGalaxy);
    expect(response.action).toEqual({
      type: 'TELEPORT',
      targetType: 'star',
      targetId: 'acg',
    });
  });

  it('matches a planet alias before falling back', () => {
    const response = matchAgentAction('打开数字花园日志', fixtureHydratedGalaxy);
    expect(response.action).toEqual({
      type: 'TELEPORT',
      targetType: 'planet',
      targetId: 'p_garden',
    });
  });

  it('returns a null action for unmatched prompts', () => {
    const response = matchAgentAction('今天天气怎么样', fixtureHydratedGalaxy);
    expect(response.action).toBeNull();
  });
});
```

**Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- tests/lib/rule-matcher.test.ts
```

Expected: FAIL with missing module or missing export errors.

**Step 3: Implement the shared agent types and matcher**

Create `src/types/agent.ts`:

```ts
export interface TeleportAction {
  type: 'TELEPORT';
  targetType: 'star' | 'planet';
  targetId: string;
}

export interface AgentResponse {
  message: string;
  action: TeleportAction | null;
}
```

Create `src/lib/agent/rule-matcher.ts`:

```ts
import type { AgentResponse } from '../../types/agent';

function normalize(input: string) {
  return input.toLowerCase().replace(/\s+/g, '');
}

export function matchAgentAction(input: string, galaxy: any): AgentResponse {
  const normalized = normalize(input);

  for (const star of galaxy.stars) {
    if ([star.id, star.name, ...(star.aliases ?? [])].some((value: string) => normalized.includes(normalize(value)))) {
      return {
        message: `已锁定 ${star.name} 领域，准备跃迁。`,
        action: {
          type: 'TELEPORT',
          targetType: 'star',
          targetId: star.id,
        },
      };
    }

    for (const planet of star.planets) {
      if ([planet.id, planet.name, ...(planet.aliases ?? [])].some((value: string) => normalized.includes(normalize(value)))) {
        return {
          message: `已锁定 ${planet.name} 专题，准备切入近地轨道。`,
          action: {
            type: 'TELEPORT',
            targetType: 'planet',
            targetId: planet.id,
          },
        };
      }
    }
  }

  return {
    message: '当前指令未对应到已登记星系，我可以带你前往工程、哲学或 ACG 领域。',
    action: null,
  };
}
```

**Step 4: Implement the API endpoint**

Create `src/pages/api/agent.ts`:

```ts
import type { APIRoute } from 'astro';
import { getGalaxyData } from '../../lib/galaxy-data';
import { matchAgentAction } from '../../lib/agent/rule-matcher';

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const galaxy = await getGalaxyData();
  const response = matchAgentAction(body.message ?? '', galaxy);

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

**Step 5: Run the matcher tests**

Run:

```bash
npm run test -- tests/lib/rule-matcher.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/types/agent.ts src/lib/agent/rule-matcher.ts src/pages/api/agent.ts tests/lib/rule-matcher.test.ts
git commit -m "feat(agent): add rule-based teleport API"
```

### Task 5: Create the Shared Layout and Global UI Shell

**Files:**
- Create: `src/layouts/MainLayout.astro`
- Create: `src/components/shared/GalaxyHeader.astro`
- Create: `src/components/shared/TardisReturnLink.astro`
- Modify: `src/styles/global.css`

**Step 1: Create the main layout with Astro view transitions**

Create `src/layouts/MainLayout.astro`:

```astro
---
import { ViewTransitions } from 'astro:transitions';
import '../styles/global.css';

interface Props {
  title: string;
}

const { title } = Astro.props;
---

<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" href="/favicon.ico" />
    <title>{title}</title>
    <ViewTransitions />
  </head>
  <body>
    <slot />
  </body>
</html>
```

**Step 2: Move the shared hub title block into a component**

Create `src/components/shared/GalaxyHeader.astro` with the `Galaxy Protocol` heading and subtitle from the prototype. Keep the black, orange, and cyan palette.

**Step 3: Create a reusable return control**

Create `src/components/shared/TardisReturnLink.astro`:

```astro
---
interface Props {
  href?: string;
  label?: string;
}

const { href = '/', label = 'TARDIS_RETURN // 返回星系' } = Astro.props;
---

<a href={href} class="tardis-btn inline-flex items-center gap-2 rounded-full border px-4 py-1.5 font-mono text-sm">
  <span>{label}</span>
</a>
```

**Step 4: Replace the default global stylesheet**

Update `src/styles/global.css` to define the sci-fi look once:

```css
@import "tailwindcss";

:root {
  --bg-base: #00050a;
  --bg-panel: rgba(0, 15, 30, 0.68);
  --line-cyan: rgba(0, 191, 255, 0.28);
  --accent-cyan: #00bfff;
  --accent-orange: #ff8c00;
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
}

html, body {
  margin: 0;
  min-height: 100%;
  background: radial-gradient(circle at top, #07111d 0%, var(--bg-base) 48%, #000 100%);
  color: var(--text-main);
  font-family: "Space Grotesk", "PingFang SC", sans-serif;
}

.glass-panel {
  background: var(--bg-panel);
  border: 1px solid var(--line-cyan);
  border-top: 2px solid var(--accent-orange);
  backdrop-filter: blur(14px);
  box-shadow: 0 18px 40px rgba(0, 191, 255, 0.12);
}
```

**Step 5: Run a build smoke test**

Run:

```bash
npm run build
```

Expected: PASS. The site may still be incomplete visually, but the layout layer should compile.

**Step 6: Commit**

```bash
git add src/layouts/MainLayout.astro src/components/shared/GalaxyHeader.astro src/components/shared/TardisReturnLink.astro src/styles/global.css
git commit -m "feat(ui): add shared layout and shell components"
```

### Task 6: Build the Markdown Reading Route and Gallery Route

**Files:**
- Create: `src/pages/read/[starId]/[planetId]/[slug].astro`
- Create: `src/pages/gallery/[starId]/[planetId].astro`

**Step 1: Implement the article route with semantic paths**

Create `src/pages/read/[starId]/[planetId]/[slug].astro` using `getStaticPaths` from `getCollection('nodes')`:

```astro
---
import { getCollection, render } from 'astro:content';
import MainLayout from '../../../../layouts/MainLayout.astro';
import TardisReturnLink from '../../../../components/shared/TardisReturnLink.astro';

export async function getStaticPaths() {
  const entries = await getCollection('nodes');
  return entries.map((entry) => ({
    params: {
      starId: entry.data.starId,
      planetId: entry.data.planetId,
      slug: entry.data.slug,
    },
    props: { entry },
  }));
}

const { entry } = Astro.props;
const { Content } = await render(entry);
---
```

Render the title, summary, hero image, tags, and markdown body. Reuse the spoke-page visual direction from `planet_reader.html`.

**Step 2: Implement the gallery route from local config**

Create `src/pages/gallery/[starId]/[planetId].astro`. Use `getGalaxyData()` to find the requested gallery planet and render a first-pass version of the ACG gallery prototype. If the planet is missing or is not `pageType: 'gallery'`, return `Astro.redirect('/404')` or throw an Astro 404.

**Step 3: Verify the routes build**

Run:

```bash
npm run build
```

Expected: PASS and static routes generated for all seeded articles plus the gallery page.

**Step 4: Commit**

```bash
git add src/pages/read/[starId]/[planetId]/[slug].astro src/pages/gallery/[starId]/[planetId].astro
git commit -m "feat(routes): add read and gallery spoke pages"
```

### Task 7: Build the Info Panel and AI Terminal Components

**Files:**
- Create: `src/components/galaxy/InfoPanel.astro`
- Create: `src/components/ai/AITerminal.astro`

**Step 1: Create the passive info panel shell**

Create `src/components/galaxy/InfoPanel.astro` with stable DOM ids so the scene controller can update it:

```astro
<aside id="info-panel" class="glass-panel fixed right-6 top-6 bottom-6 z-20 hidden w-[360px] p-6 md:p-8">
  <div class="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
    <span id="info-panel-tag" class="text-xs font-mono text-cyan-300">NODE_EXTRACTED</span>
    <button id="info-panel-close" type="button" class="text-sm text-gray-400">关闭</button>
  </div>
  <h2 id="info-panel-title" class="text-2xl font-bold text-white">加载中...</h2>
  <p id="info-panel-subtitle" class="mt-3 text-sm text-slate-300"></p>
  <div id="info-panel-content" class="mt-6 space-y-4 text-sm text-slate-300"></div>
</aside>
```

**Step 2: Create the AI terminal with a stable custom event contract**

Create `src/components/ai/AITerminal.astro`. Keep the floating action button plus expandable terminal. The client script should:

```ts
async function sendMessage(message: string) {
  const response = await fetch('/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  const payload = await response.json();
  appendAssistantMessage(payload.message);

  if (payload.action) {
    window.dispatchEvent(new CustomEvent('galaxy:action', { detail: payload.action }));
  }
}
```

Do not let the terminal manipulate Three.js directly.

**Step 3: Run a build**

Run:

```bash
npm run build
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/components/galaxy/InfoPanel.astro src/components/ai/AITerminal.astro
git commit -m "feat(hub): add info panel and AI terminal components"
```

### Task 8: Port the Three.js Hub and Wire the Full Hub Page

**Files:**
- Create: `src/lib/browser/galaxy-scene.ts`
- Create: `src/components/galaxy/GalaxyScene.astro`
- Modify: `src/pages/index.astro`

**Step 1: Create the scene bootstrap test target**

Before touching the browser code, add a small pure helper inside `src/lib/browser/galaxy-scene.ts` that can be tested separately:

```ts
export function findTeleportTarget(galaxy: any, action: { targetType: 'star' | 'planet'; targetId: string }) {
  if (action.targetType === 'star') return galaxy.stars.find((star: any) => star.id === action.targetId) ?? null;
  return galaxy.stars.flatMap((star: any) => star.planets).find((planet: any) => planet.id === action.targetId) ?? null;
}
```

Create `tests/lib/galaxy-scene.test.ts` to cover this helper before implementing the full browser bootstrap.

**Step 2: Run the failing test**

Run:

```bash
npm run test -- tests/lib/galaxy-scene.test.ts
```

Expected: FAIL because the helper or exports do not exist yet.

**Step 3: Port the Three.js scene into a browser module**

Create `src/lib/browser/galaxy-scene.ts` and move the prototype logic into an `initGalaxyScene` function. Preserve:

- `GALAXY -> STAR -> PLANET` camera state
- Orbiting planets and lane rendering
- Pointer picking with `Raycaster`
- Back-navigation behavior
- Right-panel updates for stars and planets
- `window.addEventListener('galaxy:action', ...)` for AI teleport
- WebGL fallback that reveals a static message instead of a blank screen

Keep the article list rendering planet-local and generate links from the hydrated `articles[].href` values.

**Step 4: Create the Astro wrapper component**

Create `src/components/galaxy/GalaxyScene.astro`:

```astro
---
interface Props {
  galaxy: unknown;
}

const { galaxy } = Astro.props;
---

<section class="absolute inset-0">
  <div id="canvas-container" class="absolute inset-0"></div>
  <div id="webgl-fallback" class="hidden absolute inset-x-6 top-24 z-10 rounded-xl border border-white/10 bg-black/60 p-4 text-sm text-slate-300">
    当前设备未能初始化星系渲染，已切换为静态模式。
  </div>
  <script id="galaxy-data" type="application/json" set:html={JSON.stringify(galaxy)} />
</section>

<script type="module">
  import { initGalaxyScene } from '../../lib/browser/galaxy-scene';

  const raw = document.getElementById('galaxy-data');
  if (raw?.textContent) {
    initGalaxyScene(JSON.parse(raw.textContent));
  }
</script>
```

**Step 5: Replace the placeholder home page**

Update `src/pages/index.astro` so it:

- Loads `getGalaxyData()`
- Wraps the page in `MainLayout`
- Renders `GalaxyHeader`
- Renders `GalaxyScene`
- Renders `InfoPanel`
- Renders `AITerminal`

Use the `3d_garden_prototype.html` layout rules: the canvas stays `absolute` full-screen, and the UI layer sits above it with `z-index: 10` and `pointer-events: none` except for interactive controls.

**Step 6: Run focused tests and a build**

Run:

```bash
npm run test -- tests/lib/galaxy-scene.test.ts
npm run build
```

Expected: PASS for both.

**Step 7: Commit**

```bash
git add src/lib/browser/galaxy-scene.ts src/components/galaxy/GalaxyScene.astro src/pages/index.astro tests/lib/galaxy-scene.test.ts
git commit -m "feat(hub): port Three.js galaxy scene into Astro"
```

### Task 9: Final Verification and Developer Docs

**Files:**
- Modify: `README.md`

**Step 1: Add the minimum developer documentation**

Update `README.md` with:

- project purpose
- local commands: `npm run dev`, `npm run test`, `npm run build`
- content location: `src/content/nodes/...`
- route conventions for `/read/...` and `/gallery/...`
- note that AI routing is currently rule-based and local-only

**Step 2: Run the full verification suite**

Run:

```bash
npm run test
npm run build
```

Expected: both PASS.

**Step 3: Perform manual browser verification**

Run:

```bash
npm run dev
```

Then verify these five flows manually:

1. Clicking a star focuses the camera and opens the panel.
2. Clicking `数字花园日志` lists real Markdown articles.
3. Clicking an article opens `/read/tech/p_garden/why-3d-galaxy`.
4. The reading page return control navigates back to `/`.
5. Typing `带我去 ACG` and `打开数字花园日志` in the AI terminal triggers camera movement.

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document MVP developer workflow"
```
