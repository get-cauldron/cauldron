import { defineConfig } from '@get-cauldron/engine/gateway';

// Model IDs verified against provider APIs as of 2026-04-02.
// OpenAI models replaced with Mistral equivalents after provider swap in Phase 30.
export default defineConfig({
  models: {
    interview: ['claude-sonnet-4-6', 'mistral-large-latest'],
    holdout: ['gemini-2.5-pro', 'mistral-large-latest'],
    implementation: ['claude-sonnet-4-6', 'mistral-large-latest'],
    evaluation: ['gemini-2.5-pro', 'claude-sonnet-4-6'],
    decomposition: ['claude-sonnet-4-6', 'mistral-large-latest'],
    context_assembly: ['mistral-small-latest', 'mistral-large-latest'],
    conflict_resolution: ['claude-sonnet-4-6', 'mistral-large-latest'],
  },
  budget: {
    defaultLimitCents: 500,
  },
  perspectiveModels: {
    researcher: 'claude-sonnet-4-6',
    simplifier: 'mistral-small-latest',
    architect: 'mistral-large-latest',
    'breadth-keeper': 'claude-sonnet-4-6',
    'seed-closer': 'claude-sonnet-4-6',
  },
  scoringModel: 'mistral-small-latest',
  // D-15: this IS the Cauldron project itself — activates engine snapshot + migration review gates
  selfBuild: true,
  // D-14: CLI connection settings — apiKey written to .env on first-run for web server auth
  cli: {
    serverUrl: 'http://localhost:3000',
    apiKey: '',
  },
});
