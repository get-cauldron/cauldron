import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.wiring.test.ts'],
    pool: 'forks',
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    passWithNoTests: true,
    env: {
      DATABASE_URL:
        process.env['TEST_DATABASE_URL'] ??
        'postgres://cauldron:cauldron@localhost:5433/cauldron_test',
    },
  },
});
