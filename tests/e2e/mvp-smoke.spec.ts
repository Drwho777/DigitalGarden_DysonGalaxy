import { expect, test, type Page } from '@playwright/test';
import { getGalleryExhibits } from '../../src/data/gallery';

interface AgentResponse {
  action:
    | {
        type: 'TELEPORT';
        targetType?: 'star' | 'planet';
        targetId: string;
      }
    | {
        type: 'OPEN_PATH';
        path: string;
      }
    | null;
  message: string;
  recommendations?:
    | {
        items: Array<{
          action:
            | {
                type: 'TELEPORT';
                targetType?: 'star' | 'planet';
                targetId: string;
              }
            | {
                type: 'OPEN_PATH';
                path: string;
              };
          badge?: string;
          description: string;
          hint?: string;
          id: string;
          kind: 'primary' | 'secondary';
          title: string;
        }>;
        mode: 'recommendation' | 'discovery';
      }
    | null;
}

const GARDEN_PROMPT = '打开数字花园日志';
const GARDEN_TITLE = '数字花园日志';
const TECH_STAR_TITLE = '工程与架构';
const GARDEN_ARTICLE_PATH = '/read/tech/p_garden/why-3d-galaxy';
const HUB_OVERVIEW_PROMPT = '这个花园主要有哪些内容';
const GARDEN_AGENT_RESPONSE: AgentResponse = {
  message: '已锁定数字花园日志，准备切入近地轨道。',
  action: {
    type: 'TELEPORT',
    targetType: 'planet',
    targetId: 'p_garden',
  },
};
const TECH_STAR_ACTION = {
  type: 'TELEPORT',
  targetId: 'tech',
  targetType: 'star',
} as const;
const GALLERY_FEATURED_TITLE =
  getGalleryExhibits('p_gallery')[0]?.title ?? '攻壳机动队';

async function openTerminal(page: Page) {
  await page.locator('#ai-terminal-fab').click();
  await expect(page.locator('#ai-terminal')).toBeVisible();
}

async function mockGardenAgentRoute(page: Page) {
  await page.route('**/api/agent', async (route) => {
    await route.fulfill({
      body: JSON.stringify(GARDEN_AGENT_RESPONSE),
      contentType: 'application/json',
      status: 200,
    });
  });
}

async function mockArticleSummaryRoute(page: Page) {
  let lastRequestBody: unknown;

  await page.route('**/api/agent', async (route) => {
    lastRequestBody = route.request().postDataJSON();

    await route.fulfill({
      body: JSON.stringify({
        action: null,
        message: '当前这篇文章主要在解释为什么用 3D 星系来组织数字花园。',
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  return () => lastRequestBody;
}

async function mockHubGuideRoute(page: Page) {
  let lastRequestBody: unknown;

  await page.route('**/api/agent', async (route) => {
    lastRequestBody = route.request().postDataJSON();

    await route.fulfill({
      body: JSON.stringify({
        action: null,
        message:
          '如果你是第一次来，可以先从数字花园日志开始，再去工程与架构和 ACG 档案库。',
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  return () => lastRequestBody;
}

async function mockHubOverviewRoute(page: Page) {
  let lastRequestBody: unknown;

  await page.route('**/api/agent', async (route) => {
    lastRequestBody = route.request().postDataJSON();

    await route.fulfill({
      body: JSON.stringify({
        action: null,
        message:
          '这个花园目前主要有数字花园日志、工程与架构和 ACG 档案库等内容。',
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  return () => lastRequestBody;
}

async function mockArticleNavigationRoute(page: Page) {
  await page.route('**/api/agent', async (route) => {
    await route.fulfill({
      body: JSON.stringify(GARDEN_AGENT_RESPONSE),
      contentType: 'application/json',
      status: 200,
    });
  });
}

async function mockArticleRecommendationRoute(page: Page) {
  await page.route('**/api/agent', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        action: null,
        message: '我先帮你筛了几个候选，先看候选再决定打开哪篇。',
        recommendations: {
          mode: 'recommendation',
          items: [
            {
              action: {
                type: 'OPEN_PATH',
                path: GARDEN_ARTICLE_PATH,
              },
              badge: 'ARTICLE',
              description: '用宇宙隐喻重建个人知识系统。',
              hint: '2026-03-06 · 工程与架构 / 数字花园日志',
              id: 'node:why-3d-galaxy',
              kind: 'primary',
              title: '从平面到宇宙：为什么我选择 3D 星系作为知识结构？',
            },
            {
              action: {
                type: 'OPEN_PATH',
                path: '/read/tech/p_garden/astro-3d-performance',
              },
              badge: 'ARTICLE',
              description: '先守住数据边界和渲染预算。',
              hint: '2026-03-05 · 工程与架构 / 数字花园日志',
              id: 'node:astro-3d-performance',
              kind: 'secondary',
              title: 'Astro 与 Three.js 共存时，首屏性能应该先守住什么？',
            },
          ],
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

async function submitGardenPrompt(page: Page) {
  const agentResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/agent') &&
      response.request().method() === 'POST',
  );

  await openTerminal(page);
  await page.locator('#ai-terminal-input').fill(GARDEN_PROMPT);
  await page.locator('#ai-terminal-send').click();

  const agentResponse = await agentResponsePromise;
  const payload = (await agentResponse.json()) as AgentResponse;

  expect(payload.action).toMatchObject(GARDEN_AGENT_RESPONSE.action ?? {});
  await expect(page.locator('#info-panel')).toBeVisible();
  await expect(page.locator('#info-panel-title')).toHaveText(GARDEN_TITLE);

  return payload;
}

async function focusTechStar(page: Page) {
  await page.evaluate((detail) => {
    window.dispatchEvent(new CustomEvent('galaxy:action', { detail }));
  }, TECH_STAR_ACTION);

  await expect(page.locator('#info-panel')).toBeVisible();
  await expect(page.locator('#info-panel-title')).toHaveText(TECH_STAR_TITLE);
}

function trackBrowserErrors(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  return {
    assertClean() {
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    },
  };
}

test.describe('Digital Garden MVP smoke', () => {
  test('home boots the scene bundle and AI terminal can navigate to p_garden', async ({
    page,
  }) => {
    const sceneBundle404s: string[] = [];

    page.on('response', (response) => {
      if (
        response.status() === 404 &&
        response.url().includes('/lib/browser/galaxy-scene')
      ) {
        sceneBundle404s.push(response.url());
      }
    });

    await mockGardenAgentRoute(page);
    await page.goto('/');

    await expect(page.locator('#canvas-container canvas')).toHaveCount(1);
    await expect(page.locator('#webgl-fallback')).toBeHidden();
    expect(sceneBundle404s).toEqual([]);

    await submitGardenPrompt(page);
  });

  test('home to article to home restores the focused hub state after ClientRouter swap', async ({
    page,
  }) => {
    await mockGardenAgentRoute(page);
    await page.goto('/');

    await expect(page.locator('#canvas-container canvas')).toHaveCount(1);
    await submitGardenPrompt(page);

    await page.locator(`#info-panel a[href="${GARDEN_ARTICLE_PATH}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${GARDEN_ARTICLE_PATH}$`));
    await expect(page.locator('#reader-navbar')).toBeVisible();

    await page.locator('#reader-navbar a[href="/"]').click();
    await expect(page).toHaveURL(/\/$/);

    await expect(page.locator('#canvas-container canvas')).toHaveCount(1);
    await expect(page.locator('#webgl-fallback')).toBeHidden();
    await expect(page.locator('#info-panel')).toBeVisible();
    await expect(page.locator('#info-panel-title')).toHaveText(GARDEN_TITLE);
    await expect(page.locator('#hub-back-btn')).toBeVisible();

    const payload = await submitGardenPrompt(page);
    expect(payload.action?.type).toBe('TELEPORT');
    if (payload.action?.type === 'TELEPORT') {
      expect(payload.action.targetId).toBe('p_garden');
    }
  });

  test('star panel topic entries can focus the matching planet', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#canvas-container canvas')).toHaveCount(1);
    await focusTechStar(page);

    await page
      .locator('#info-panel-content button')
      .filter({ hasText: GARDEN_TITLE })
      .click();

    await expect(page.locator('#info-panel-tag')).toHaveText('PLANET // P_GARDEN');
    await expect(page.locator('#info-panel-title')).toHaveText(GARDEN_TITLE);
  });

  test('star panel topic click stays on the planet even if the star fly-in is still running', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.locator('#canvas-container canvas')).toHaveCount(1);
    await focusTechStar(page);

    await page
      .locator('#info-panel-content button')
      .filter({ hasText: GARDEN_TITLE })
      .click();

    await expect(page.locator('#info-panel-tag')).toHaveText('PLANET // P_GARDEN');
    await page.waitForTimeout(2200);
    await expect(page.locator('#info-panel-tag')).toHaveText('PLANET // P_GARDEN');
    await expect(page.locator('#info-panel-title')).toHaveText(GARDEN_TITLE);
  });

  test('browser back and forward preserve a single scene canvas without WebGL errors', async ({
    page,
  }) => {
    const browserErrors = trackBrowserErrors(page);

    await mockGardenAgentRoute(page);
    await page.goto('/');
    await expect(page.locator('#canvas-container canvas')).toHaveCount(1);

    await submitGardenPrompt(page);
    await page.locator(`#info-panel a[href="${GARDEN_ARTICLE_PATH}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${GARDEN_ARTICLE_PATH}$`));

    for (let iteration = 0; iteration < 2; iteration += 1) {
      await page.goBack();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.locator('#canvas-container canvas')).toHaveCount(1);
      await expect(page.locator('#webgl-fallback')).toBeHidden();
      await expect(page.locator('#info-panel')).toBeVisible();

      await page.goForward();
      await expect(page).toHaveURL(new RegExp(`${GARDEN_ARTICLE_PATH}$`));
      await expect(page.locator('#reader-navbar')).toBeVisible();
    }

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#canvas-container canvas')).toHaveCount(1);
    await expect(page.locator('#webgl-fallback')).toBeHidden();

    browserErrors.assertClean();
  });

  test('AI terminal surfaces validation errors from /api/agent', async ({ page }) => {
    await page.route('**/api/agent', async (route) => {
      const headers = { ...route.request().headers() };
      delete headers['content-length'];

      await route.continue({
        headers,
        postData: JSON.stringify({}),
      });
    });

    await page.goto('/');
    await openTerminal(page);

    const agentResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/agent') &&
        response.request().method() === 'POST',
    );

    await page.locator('#ai-terminal-input').fill(GARDEN_PROMPT);
    await page.locator('#ai-terminal-send').click();

    const agentResponse = await agentResponsePromise;

    expect(agentResponse.status()).toBe(422);
    await expect(page.locator('#ai-terminal-history')).toContainText(GARDEN_PROMPT);
    await expect(page.locator('#ai-terminal-history')).toContainText('`message` is required.');
    await expect(page.locator('#ai-terminal-input')).toBeEnabled();
    await expect(page.locator('#ai-terminal-send')).toBeEnabled();
    await expect(page.locator('#info-panel')).toBeHidden();
  });

  test('article page terminal sends node context to /api/agent', async ({ page }) => {
    const getLastRequestBody = await mockArticleSummaryRoute(page);

    await page.goto(GARDEN_ARTICLE_PATH);
    await openTerminal(page);
    await page.locator('#ai-terminal-input').fill('总结当前页面');
    await page.locator('#ai-terminal-send').click();

    await expect(page.locator('#ai-terminal-history')).toContainText('当前这篇文章');
    expect(getLastRequestBody()).toEqual({
      context: {
        routeType: 'node',
        starId: 'tech',
        planetId: 'p_garden',
        slug: 'why-3d-galaxy',
      },
      message: '总结当前页面',
    });
  });

  test('article page whole-garden question keeps whole-garden scope in terminal history', async ({
    page,
  }) => {
    await mockHubOverviewRoute(page);

    await page.goto(GARDEN_ARTICLE_PATH);
    await openTerminal(page);
    await page.locator('#ai-terminal-input').fill(HUB_OVERVIEW_PROMPT);
    await page.locator('#ai-terminal-send').click();

    await expect(page.locator('#ai-terminal-history')).toContainText(
      '这个花园目前主要有',
    );
    await expect(page.locator('#ai-terminal-history')).not.toContainText(
      '只谈当前这篇文章',
    );
  });

  test('article page terminal can route a teleport action back to the hub scene', async ({
    page,
  }) => {
    await mockArticleNavigationRoute(page);

    await page.goto(GARDEN_ARTICLE_PATH);
    await openTerminal(page);
    await page.locator('#ai-terminal-input').fill(GARDEN_PROMPT);
    await page.locator('#ai-terminal-send').click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#info-panel')).toBeVisible();
    await expect(page.locator('#info-panel-title')).toHaveText(GARDEN_TITLE);
  });

  test('home page terminal shows recommendation candidates before navigating into an article', async ({
    page,
  }) => {
    await mockArticleRecommendationRoute(page);

    await page.goto('/');
    await openTerminal(page);
    await page.locator('#ai-terminal-input').fill('推荐一篇类似的文章');
    await page.locator('#ai-terminal-send').click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#ai-terminal-history')).toContainText(
      '我先帮你筛了几个候选',
    );
    await expect(
      page.locator('[data-agent-recommendations="recommendation"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-agent-recommendation-item="node:why-3d-galaxy"]'),
    ).toBeVisible();

    await page
      .locator('[data-agent-recommendation-item="node:why-3d-galaxy"]')
      .click();

    await expect(page).toHaveURL(new RegExp(`${GARDEN_ARTICLE_PATH}$`));
    await expect(page.locator('#reader-navbar')).toBeVisible();
    await expect(page.locator('main article h1')).toContainText('3D');
  });

  test('home page terminal supports first-visit guide language with hub context', async ({
    page,
  }) => {
    const getLastRequestBody = await mockHubGuideRoute(page);

    await page.goto('/');
    await openTerminal(page);
    await page
      .locator('#ai-terminal-input')
      .fill('我是第一次来，怎么逛比较合适');
    await page.locator('#ai-terminal-send').click();

    await expect(page.locator('#ai-terminal-history')).toContainText(
      '如果你是第一次来，可以先从数字花园日志开始',
    );
    expect(getLastRequestBody()).toEqual({
      context: {
        routeType: 'hub',
      },
      message: '我是第一次来，怎么逛比较合适',
    });
  });

  test('home page terminal supports whole-garden overview language with hub context', async ({
    page,
  }) => {
    const getLastRequestBody = await mockHubOverviewRoute(page);

    await page.goto('/');
    await openTerminal(page);
    await page.locator('#ai-terminal-input').fill(HUB_OVERVIEW_PROMPT);
    await page.locator('#ai-terminal-send').click();

    await expect(page.locator('#ai-terminal-history')).toContainText(
      '这个花园目前主要有',
    );
    expect(getLastRequestBody()).toEqual({
      context: {
        routeType: 'hub',
      },
      message: HUB_OVERVIEW_PROMPT,
    });
  });

  test('article route renders seeded content', async ({ page }) => {
    await page.goto(GARDEN_ARTICLE_PATH);

    await expect(page.locator('#reader-navbar')).toBeVisible();
    await expect(page).toHaveTitle(/Digital Garden/);
    await expect(page.locator('main article h1')).toContainText('3D');
    await expect(page.locator('main article')).toContainText('Three.js');
    await expect(page.locator('aside')).toContainText('why-3d-galaxy');
  });

  test('gallery route renders the expected content shell', async ({ page }) => {
    await page.goto('/gallery/acg/p_gallery');

    await expect(page.locator('#gallery-navbar')).toBeVisible();
    await expect(page.locator('main')).toContainText('VISUAL_DATABASE');
    await expect(page.locator('.tilt-card').first()).toBeVisible();
    await expect(page.locator('main')).toContainText(GALLERY_FEATURED_TITLE);
    await expect(page.locator('button', { hasText: 'INITIATE //' })).toBeVisible();
  });
});
