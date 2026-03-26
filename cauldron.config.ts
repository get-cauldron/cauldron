import { defineConfig } from '@cauldron/engine/gateway';

export default defineConfig({
  models: {
    interview: ['claude-sonnet-4-6', 'gpt-4o'],
    holdout: ['gpt-4o', 'gemini-2.5-pro'],
    implementation: ['claude-sonnet-4-6', 'gpt-4.1'],
    evaluation: ['gemini-2.5-pro', 'claude-sonnet-4-6'],
  },
  budget: {
    defaultLimitCents: 500,
  },
});
