import { defineConfig, devices } from '@playwright/test';

const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env;
const reuseExistingServer =
  processEnv?.PLAYWRIGHT_REUSE_SERVER === '1' ||
  processEnv?.PLAYWRIGHT_REUSE_SERVER === 'true';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4321',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    viewport: {
      width: 1440,
      height: 960,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4321',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer,
    timeout: 120_000,
  },
});
