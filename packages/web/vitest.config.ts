import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/**/*.wiring.test.ts', 'src/**/*.integration.test.ts', 'node_modules'],
    globals: true,
    // Increase worker termination timeout to prevent false positives from
    // component tests that use complex hooks (e.g., DAGCanvas with @xyflow/react)
    teardownTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
