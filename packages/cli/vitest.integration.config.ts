import { defineConfig } from 'vitest/config';

/**
 * Integration test config for api package.
 * Includes .integration.test.ts files and sets DATABASE_URL to the test DB
 * to prevent @get-cauldron/shared's client.ts from throwing at import time.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    maxWorkers: 1,
    env: {
      DATABASE_URL: process.env['TEST_DATABASE_URL'] ?? 'postgresql://cauldron:cauldron@localhost:5433/cauldron_test',
    },
  },
});
