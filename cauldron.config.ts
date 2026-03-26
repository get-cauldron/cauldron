import { defineConfig } from '@cauldron/engine/gateway';

export default defineConfig({
  models: {
    interview: ['claude-sonnet-4-6', 'gpt-5.4'],
    holdout: ['gemini-3.1-pro-preview', 'gpt-5.4'],
    implementation: ['claude-sonnet-4-6', 'gpt-5.4'],
    evaluation: ['gemini-3.1-pro-preview', 'claude-sonnet-4-6'],
    decomposition: ['claude-sonnet-4-6', 'gpt-5.4'],
    context_assembly: ['gpt-5-mini', 'gpt-5-nano'],
    conflict_resolution: ['claude-sonnet-4-6', 'gpt-5.4'],
  },
  budget: {
    defaultLimitCents: 500,
  },
  perspectiveModels: {
    researcher: 'claude-sonnet-4-6',
    simplifier: 'gpt-5-mini',
    architect: 'gpt-5.4',
    'breadth-keeper': 'claude-sonnet-4-6',
    'seed-closer': 'claude-sonnet-4-6',
  },
  scoringModel: 'gpt-5-mini',
  // D-15: this IS the Cauldron project itself — activates engine snapshot + migration review gates
  selfBuild: true,
});
