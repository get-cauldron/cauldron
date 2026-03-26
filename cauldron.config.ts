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
  // D-10: per-perspective model assignments (optional — falls back to interview stage default)
  perspectiveModels: {
    researcher: 'claude-sonnet-4-6',
    simplifier: 'gpt-4o-mini',
    architect: 'gpt-4o',
    'breadth-keeper': 'claude-sonnet-4-6',
    'seed-closer': 'claude-sonnet-4-6',
  },
  // D-18: fast/cheap model for scoring (runs every turn, user waiting)
  scoringModel: 'gpt-4o-mini',
});
