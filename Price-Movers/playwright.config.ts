import { defineConfig, devices } from '@playwright/test';
import { config } from './config/env';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests one at a time, in order, in one browser window (see tests/e2e-flow.spec.ts) */
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  /* list: prints each step live in the terminal; html: full report with steps */
  reporter: [['list', { printSteps: true }], ['html', { open: 'never' }]],
  use: {
    /* Testing branch URL from .env — use relative paths in page.goto() */
    baseURL: config.baseUrl,
    trace: 'retain-on-failure',
    /* Fail fast on a stuck click/fill instead of hanging until the test timeout */
    actionTimeout: 30_000,
    navigationTimeout: 120_000,
    /* Optional slow motion for demos, e.g. SLOWMO=500 (ms between actions) */
    launchOptions: { slowMo: Number(process.env.SLOWMO ?? 0) },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
