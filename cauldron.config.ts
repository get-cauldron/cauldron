import { defineConfig } from '@get-cauldron/engine/gateway';

// Model IDs verified against provider APIs as of 2026-04-02.
// Four-provider spread: Anthropic (primary hosted), Google (reasoning/evaluation),
// Mistral (speed tasks + secondary hosted), Ollama/Qwen (local experimental).
// Phase 30: OpenAI removed; xAI/Grok excluded (same political constraint, D-02).
export default defineConfig({
  models: {
    interview: ['claude-sonnet-4-6', 'mistral-large-latest'],
    // D-08: holdout excludes ollama — hosted providers only
    holdout: ['gemini-2.5-pro', 'mistral-large-latest', 'claude-sonnet-4-6'],
    implementation: ['claude-sonnet-4-6', 'mistral-large-latest'],
    evaluation: ['gemini-2.5-pro', 'claude-sonnet-4-6'],
    decomposition: ['claude-sonnet-4-6', 'mistral-large-latest'],
    context_assembly: ['mistral-small-latest', 'ollama:qwen3-30b-a3b'],
    conflict_resolution: ['claude-sonnet-4-6', 'mistral-large-latest'],
  },
  budget: {
    defaultLimitCents: 500,
  },
  perspectiveModels: {
    'henry-wu': 'claude-sonnet-4-6',
    occam: 'mistral-small-latest',
    'heist-o-tron': 'mistral-large-latest',
    hickam: 'claude-sonnet-4-6',
    kirk: 'claude-sonnet-4-6',
  },
  scoringModel: 'mistral-small-latest',
  // D-15: this IS the Cauldron project itself — activates engine snapshot + migration review gates
  selfBuild: true,
  // D-14: CLI connection settings — apiKey written to .env on first-run for web server auth
  cli: {
    serverUrl: 'http://localhost:3000',
    apiKey: '',
  },
  // D-14/D-16: provider capability ratings across 5 dimensions (advisory — informs stage assignment)
  // coding → implementation/execution, reasoning → decomposition/evaluation,
  // instruction-following → interview/holdout, creativity → evolution, speed → context assembly
  providerCapabilities: {
    anthropic: {
      coding: 'strong',
      reasoning: 'strong',
      'instruction-following': 'strong',
      creativity: 'strong',
      speed: 'moderate',
    },
    mistral: {
      coding: 'strong',
      reasoning: 'moderate',
      'instruction-following': 'moderate',
      creativity: 'moderate',
      speed: 'strong',
    },
    google: {
      coding: 'moderate',
      reasoning: 'strong',
      'instruction-following': 'moderate',
      creativity: 'moderate',
      speed: 'moderate',
    },
    ollama: {
      coding: 'moderate',
      reasoning: 'moderate',
      'instruction-following': 'moderate',
      creativity: 'weak',
      speed: 'strong',
    },
  },
});
