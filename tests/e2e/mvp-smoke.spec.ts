import { expect, test, type Page } from '@playwright/test';
import { getGalleryExhibits } from '../../src/data/gallery';

interface AgentResponse {
  action: {
    type: 'TELEPORT';
    targetType?: 'star' | 'planet';
    targetId: string;
  } | null;
  message: string;
}

const GARDEN_PROMPT = '打开数字花园日志';
const GARDEN_TITLE = '数字花园日志';
const GARDEN_ARTICLE_PATH = '/read/tech/p_garden/why-3d-galaxy';
const GARDEN_AGENT_RESPONSE: AgentResponse = {
  message: '已锁定数字花园日志，准备切入近地轨道。',
  action: {
    type: 'TELEPORT',
    targetType: 'planet',
    targetId: 'p_garden',
  },
};
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
    expect(payload.action?.targetId).toBe('p_garden');
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
