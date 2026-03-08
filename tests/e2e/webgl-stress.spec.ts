import { expect, test, type Page, type TestInfo } from '@playwright/test';

interface HeapSample {
  bytes: number | null;
  label: string;
}

interface HeapSummary {
  available: boolean;
  baselineBytes?: number;
  finalBytes?: number;
  finalGrowthBytes?: number;
  peakBytes?: number;
  peakGrowthBytes?: number;
}

const CYCLE_COUNT = 5;
const GARDEN_TAG = 'PLANET // P_GARDEN';
const GARDEN_ARTICLE_PATH = '/read/tech/p_garden/why-3d-galaxy';
const FINAL_HEAP_GROWTH_LIMIT_BYTES = 96 * 1024 * 1024;
const GARDEN_ACTION = {
  type: 'TELEPORT',
  targetId: 'p_garden',
  targetType: 'planet',
} as const;

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

async function waitForHubReady(page: Page) {
  await expect(page.locator('#canvas-container canvas')).toHaveCount(1);
  await expect(page.locator('#webgl-fallback')).toBeHidden();
}

async function focusGardenPlanet(page: Page) {
  // Reuse the production teleport event so the test avoids brittle pixel-perfect canvas clicks.
  await page.evaluate((detail) => {
    window.dispatchEvent(new CustomEvent('galaxy:action', { detail }));
  }, GARDEN_ACTION);

  await expect(page.locator('#info-panel')).toBeVisible();
  await expect(page.locator('#info-panel-tag')).toHaveText(GARDEN_TAG);
  await expect(page.locator('#hub-back-btn')).toBeVisible();
}

async function openGardenArticle(page: Page) {
  await focusGardenPlanet(page);
  await page.locator(`#info-panel a[href="${GARDEN_ARTICLE_PATH}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${GARDEN_ARTICLE_PATH}$`));
  await expect(page.locator('#reader-navbar')).toBeVisible();
}

async function returnToHub(page: Page) {
  await page.locator('#reader-navbar a[href="/"]').click();
  await expect(page).toHaveURL(/\/$/);
  await waitForHubReady(page);
  await expect(page.locator('#info-panel')).toBeVisible();
  await expect(page.locator('#info-panel-tag')).toHaveText(GARDEN_TAG);
  await expect(page.locator('#hub-back-btn')).toBeVisible();
}

async function collectHeapSample(page: Page, label: string): Promise<HeapSample> {
  const bytes = await page.evaluate(() => {
    const perf = performance as Performance & {
      memory?: {
        usedJSHeapSize?: number;
      };
    };

    return typeof perf.memory?.usedJSHeapSize === 'number'
      ? perf.memory.usedJSHeapSize
      : null;
  });

  return {
    label,
    bytes,
  };
}

function summarizeHeap(samples: HeapSample[]): HeapSummary {
  const measuredSamples = samples.filter(
    (sample): sample is HeapSample & { bytes: number } => sample.bytes !== null,
  );

  if (measuredSamples.length < 2) {
    return {
      available: false,
    };
  }

  const baselineBytes = measuredSamples[0].bytes;
  const finalBytes = measuredSamples[measuredSamples.length - 1].bytes;
  const peakBytes = measuredSamples.reduce((peak, sample) => {
    return Math.max(peak, sample.bytes);
  }, baselineBytes);

  return {
    available: true,
    baselineBytes,
    finalBytes,
    finalGrowthBytes: finalBytes - baselineBytes,
    peakBytes,
    peakGrowthBytes: peakBytes - baselineBytes,
  };
}

async function attachHeapMetrics(
  testInfo: TestInfo,
  samples: HeapSample[],
  summary: HeapSummary,
) {
  await testInfo.attach('webgl-stress-heap.json', {
    body: JSON.stringify(
      {
        samples,
        summary,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
}

test.describe('WebGL navigation stress', () => {
  test('repeats hub -> article -> return five times without scene duplication', async ({
    page,
  }, testInfo) => {
    const browserErrors = trackBrowserErrors(page);
    const heapSamples: HeapSample[] = [];

    await page.goto('/');
    await waitForHubReady(page);
    heapSamples.push(await collectHeapSample(page, 'hub-initial'));

    for (let cycle = 1; cycle <= CYCLE_COUNT; cycle += 1) {
      await test.step(`cycle ${cycle}`, async () => {
        await openGardenArticle(page);
        heapSamples.push(await collectHeapSample(page, `article-${cycle}`));

        await returnToHub(page);
        await expect(page.locator('#canvas-container canvas')).toHaveCount(1);
        heapSamples.push(await collectHeapSample(page, `hub-${cycle}`));
      });
    }

    browserErrors.assertClean();

    const heapSummary = summarizeHeap(heapSamples);
    await attachHeapMetrics(testInfo, heapSamples, heapSummary);

    if (!heapSummary.available) {
      testInfo.annotations.push({
        type: 'info',
        description: 'performance.memory unavailable; heap growth assertion skipped.',
      });
      return;
    }

    expect(heapSummary.finalGrowthBytes ?? 0).toBeLessThan(
      FINAL_HEAP_GROWTH_LIMIT_BYTES,
    );
  });
});
