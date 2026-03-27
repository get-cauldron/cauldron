import { defineConfig } from '@cauldron/engine/gateway';

// Model IDs verified against provider APIs as of 2026-03-26.
// gpt-5.4 / gpt-5-mini / gemini-3.1-pro-preview are speculative future models —
// replaced with real available equivalents.
export default defineConfig({
  models: {
    interview: ['claude-sonnet-4-6', 'gpt-4.1'],
    holdout: ['gemini-2.5-pro', 'gpt-4.1'],
    implementation: ['claude-sonnet-4-6', 'gpt-4.1'],
    evaluation: ['gemini-2.5-pro', 'claude-sonnet-4-6'],
    decomposition: ['claude-sonnet-4-6', 'gpt-4.1'],
    context_assembly: ['gpt-4.1-mini', 'gpt-4o-mini'],
    conflict_resolution: ['claude-sonnet-4-6', 'gpt-4.1'],
  },
  budget: {
    defaultLimitCents: 500,
  },
  perspectiveModels: {
    researcher: 'claude-sonnet-4-6',
    simplifier: 'gpt-4.1-mini',
    architect: 'gpt-4.1',
    'breadth-keeper': 'claude-sonnet-4-6',
    'seed-closer': 'claude-sonnet-4-6',
  },
  scoringModel: 'gpt-4.1-mini',
  // D-15: this IS the Cauldron project itself — activates engine snapshot + migration review gates
  selfBuild: true,
  // D-14: CLI connection settings — apiKey written to .env on first-run for web server auth
  cli: {
    serverUrl: 'http://localhost:3000',
    apiKey: '',
  },
});
