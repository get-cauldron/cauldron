import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // CI: sequential to avoid flaky cross-test DB state; local: parallel for speed
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    // Chromium-only for E2E — one browser is sufficient for the pipeline coverage (D-04)
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: {
      // Point the dev server at the E2E database so tests get a clean, isolated DB
      DATABASE_URL: process.env['E2E_DATABASE_URL'] ?? 'postgres://cauldron:cauldron@localhost:5434/cauldron_e2e',
    },
  },
});
