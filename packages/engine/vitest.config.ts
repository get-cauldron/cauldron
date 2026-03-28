import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Exclude .integration.test.ts files -- run those with test:integration (vitest.integration.config.ts)
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts', 'src/**/*.wiring.test.ts'],
  },
});
