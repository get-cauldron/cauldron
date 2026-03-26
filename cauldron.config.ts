import { defineConfig } from '@cauldron/engine/gateway';

export default defineConfig({
  models: {
    interview: ['claude-sonnet-4-6', 'gpt-4o'],
    holdout: ['gpt-4o', 'gemini-2.5-pro'],
    implementation: ['claude-sonnet-4-6', 'gpt-4.1'],
    evaluation: ['gemini-2.5-pro', 'claude-sonnet-4-6'],
    decomposition: ['claude-sonnet-4-6', 'gpt-4.1'], // D-02: strong reasoning models for decomposition
    context_assembly: ['gpt-4o-mini', 'gpt-4o'],  // lightweight, fast model for pruning per D-07
    conflict_resolution: ['claude-sonnet-4-6', 'gpt-4o'],  // strong reasoning for merge conflicts per D-14
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
  // D-15: this IS the Cauldron project itself — activates engine snapshot + migration review gates
  selfBuild: true,
});
