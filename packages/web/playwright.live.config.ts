import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the live pipeline E2E test.
 *
 * Differences from playwright.config.ts:
 * - No globalSetup — the test manages its own infrastructure
 * - No webServer — the test starts/stops servers itself
 * - 45-minute timeout for the full LLM-driven pipeline
 * - Always captures traces for debugging
 * - Matches only pipeline-live.spec.ts
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'pipeline-live.spec.ts',
  fullyParallel: false,       // single test, serial execution
  retries: 0,                 // no retries — fix bugs inline
  workers: 1,
  timeout: 45 * 60_000,       // 45 minutes
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on',               // always capture traces for debugging
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // No webServer — live-infra.ts manages server lifecycle
});
