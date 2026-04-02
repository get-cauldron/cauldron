# Phase 30: Replace OpenAI Provider - Research

**Researched:** 2026-04-02
**Domain:** Vercel AI SDK provider swap (Mistral + Ollama), gateway refactoring, config restructuring
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Four provider families post-migration: Anthropic (`@ai-sdk/anthropic`), Google (`@ai-sdk/google`), Mistral (`@ai-sdk/mistral` — new dependency), and local Qwen via Ollama (`ai-sdk-ollama` — see Discretion below for package choice).
- **D-02:** OpenAI removal is political. xAI/Grok is equally excluded. These are hard constraints, not preferences.
- **D-03:** Mistral is the primary new hosted provider — uses official `@ai-sdk/mistral` (lowest maintenance risk).
- **D-04:** Local Qwen via Ollama is experimental. Target model: Qwen3-30B-A3B (MoE, 3B active params) on M5 Max (64GB, 40 GPU cores).
- **D-05:** Spread load across all 4 providers. Assign primaries per stage based on model strengths. Local Qwen assigned to low-stakes stages (context assembly, scoring) as proving ground.
- **D-06:** Produce a concrete mapping table: each pipeline stage → primary model + fallback chain, replacing all `gpt-4.1`, `gpt-4.1-mini`, `gpt-4o-mini` references.
- **D-07:** Cross-model diversity rule unchanged: holdout rejects same-family as implementer.
- **D-08:** Local Qwen is EXCLUDED from holdout test generation. Holdout rotates between hosted providers only.
- **D-09:** Replace `openai.embedding('text-embedding-3-large')` with Mistral embeddings (`mistral-embed`) using same Vercel AI SDK `embed()` API.
- **D-10:** If `cauldron.config.ts` includes any `ollama:*` model, Ollama MUST be running or startup fails. No silent degradation.
- **D-11:** Auto-pull on first run: if configured local model not found in Ollama, Cauldron pulls it automatically.
- **D-12:** Local models represented inline in fallback chains with `ollama:` prefix. Gateway resolves the prefix to the Ollama provider.
- **D-13:** No separate `localModels` config block. Local models are first-class members of fallback chains.
- **D-14:** Each provider gets soft capability ratings in `cauldron.config.ts` across 5 dimensions: `coding`, `reasoning`, `instruction-following`, `creativity`, `speed`. Values: `'strong' | 'moderate' | 'weak'`.
- **D-15:** Tags are advisory — gateway uses them for stage assignment recommendations and logging, not hard-blocking.
- **D-16:** Capability tags map to pipeline stages: coding → implementation/execution, reasoning → decomposition/evaluation, instruction-following → interview/holdout, creativity → evolution, speed → context assembly.
- **D-17:** Full removal: uninstall `@ai-sdk/openai` from `packages/engine/package.json`, remove all `OPENAI_API_KEY` references from env examples, health checks, bootstrap, E2E helpers, and test scripts.
- **D-18:** Update all test mocks that reference `@ai-sdk/openai` (`gateway.test.ts`, `embeddings.test.ts`).
- **D-19:** Remove `openai` case from `packages/engine/src/gateway/providers.ts` switch statement.

### Claude's Discretion

- Exact Mistral model assignments per stage (based on available models and benchmarks)
- Ollama provider package choice (`ollama-ai-provider` vs `ai-sdk-ollama` — pick whichever has better AI SDK v6 compatibility)
- Auto-pull implementation details (CLI output, progress reporting)
- Capability tag default values per provider (based on current benchmarks)
- Health check implementation for Ollama availability
- Whether to add a `cauldron models` CLI subcommand or keep model management purely config-driven

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

---

## Summary

Phase 30 replaces `@ai-sdk/openai` with a four-provider configuration: Anthropic (existing), Google (existing), Mistral (new hosted provider), and Ollama/Qwen (new local provider). The work divides into three clean buckets: (1) provider wiring — add `@ai-sdk/mistral` and an Ollama adapter, extend `providers.ts` and `types.ts`, implement the `ollama:` prefix parser; (2) config restructuring — replace all `gpt-*` model IDs in `cauldron.config.ts` with the new provider spread, add capability tags, update `MODEL_FAMILY_MAP`; and (3) full cleanup — remove `@ai-sdk/openai` from `package.json`, strip `OPENAI_API_KEY` from every env/config touchpoint, update all test mocks.

The Vercel AI SDK makes this straightforward: the embedding swap (`openai.embedding('text-embedding-3-large')` → `mistral.embedding('mistral-embed')`) is a one-line change in `embeddings.ts`. The Ollama provider requires the additional concern of startup validation — detecting whether Ollama is running and whether the configured model is locally present, with auto-pull on first run.

The biggest risk is the `ollama:` prefix parser. The existing `MODEL_FAMILY_MAP` is a static lookup table that will throw `Unknown model ID` for any `ollama:*` string. The parser must intercept before the map lookup. Additionally, `validation.ts` calls `resolveModel()` for each configured provider, so Ollama models that aren't running will produce confusing errors; the Ollama validation path needs its own health-check logic.

**Primary recommendation:** Use `ai-sdk-ollama@3.8.2` for the Ollama adapter (explicit AI SDK v6 peer dep, active maintenance, official ollama-js foundation). Implement `ollama:` prefix parsing in `getProviderFamily()` and `resolveModel()` before the static map lookup. Add a dedicated `ensureOllama()` startup check in `health.ts`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@ai-sdk/mistral` | `3.0.28` | Mistral language + embedding models | Official first-party Vercel AI SDK provider |
| `ai-sdk-ollama` | `3.8.2` | Ollama local model provider | Explicit `ai ^6.0.137` peer dep; built on official `ollama-js`; active maintenance (2026-03-24) |
| `@ai-sdk/anthropic` | `^3.0.64` | Anthropic (existing) | Unchanged |
| `@ai-sdk/google` | `^3.0.53` | Google (existing) | Unchanged |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ai-sdk-ollama` | `ollama-ai-provider-v2@3.5.0` | v2 requires zod `^4.0.16` peer dep and was last updated 2026-03-17; `ai-sdk-ollama` has fresher publish date and uses official ollama-js which is needed for auto-pull anyway |
| `ai-sdk-ollama` | `ollama-ai-provider@1.2.0` | Last updated 2025-01-17; deps target AI SDK v1/v2 era (`@ai-sdk/provider ^1.0.0`); incompatible with current AI SDK v6 |

**Installation:**
```bash
pnpm --filter @get-cauldron/engine add @ai-sdk/mistral ai-sdk-ollama
pnpm --filter @get-cauldron/engine remove @ai-sdk/openai
```

**Version verification (confirmed against npm registry 2026-04-02):**
- `@ai-sdk/mistral`: `3.0.28` (published 2026-04-02)
- `ai-sdk-ollama`: `3.8.2` (published 2026-03-24, peer dep `ai ^6.0.137`)
- Project uses `ai ^6.0.138` — satisfies peer dep

---

## Architecture Patterns

### Files Touched (Exhaustive)

```
packages/engine/
├── package.json                            # remove @ai-sdk/openai, add @ai-sdk/mistral + ai-sdk-ollama
├── src/gateway/
│   ├── providers.ts                        # add mistral/ollama cases; add ollama: prefix parser
│   ├── types.ts                            # ProviderFamily union: add 'mistral' | 'ollama'
│   └── validation.ts                       # Ollama provider needs HTTP health-check, not AI SDK ping
├── src/evolution/
│   └── embeddings.ts                       # swap openai.embedding → mistral.embedding
└── src/__tests__/
    ├── gateway/__tests__/gateway.test.ts   # swap @ai-sdk/openai mock → @ai-sdk/mistral + ai-sdk-ollama
    └── evolution/__tests__/embeddings.test.ts  # swap @ai-sdk/openai mock → @ai-sdk/mistral

packages/cli/
├── src/health.ts                           # replace OPENAI_API_KEY; add ensureOllama(); add MISTRAL_API_KEY
├── src/bootstrap.ts                        # replace OPENAI_API_KEY in quote-strip loop

packages/web/
└── e2e/
    ├── helpers/live-infra.ts               # remove OPENAI_API_KEY from checkApiKeys()
    └── pipeline-live.spec.ts               # remove gpt-* model references, update prerequisite comment

scripts/
└── run-interview-automated.ts              # remove OPENAI_API_KEY from quote-strip loop

cauldron.config.ts                         # replace all gpt-* with new model spread + capability tags

.env.example                               # remove OPENAI_API_KEY, add MISTRAL_API_KEY
turbo.json                                 # remove OPENAI_API_KEY from globalPassThroughEnv, add MISTRAL_API_KEY
```

### Pattern 1: Mistral Provider Import and Usage

```typescript
// Source: https://ai-sdk.dev/providers/ai-sdk-providers/mistral
import { mistral } from '@ai-sdk/mistral';

// Language model
const model = mistral('mistral-large-latest');

// Embedding model (drop-in for openai.embedding())
const embeddingModel = mistral.embedding('mistral-embed');
```

### Pattern 2: Ollama Provider Import and Usage

```typescript
// Source: https://www.npmjs.com/package/ai-sdk-ollama
import { ollama } from 'ai-sdk-ollama';

// Language model — model name is the Ollama model tag
const model = ollama('qwen3-30b-a3b');
```

### Pattern 3: Ollama Prefix Parser in providers.ts

The `MODEL_FAMILY_MAP` is a static object and will throw for `ollama:*` model strings. The prefix must be intercepted before the map lookup:

```typescript
// Current getProviderFamily signature — needs prefix check FIRST
export function getProviderFamily(modelId: string): ProviderFamily {
  // NEW: intercept ollama: prefix before static map lookup
  if (modelId.startsWith('ollama:')) return 'ollama';
  if (modelId.startsWith('mistral-')) return 'mistral'; // optional — map handles this
  const family = MODEL_FAMILY_MAP[modelId];
  if (!family) throw new Error(`Unknown model ID: '${modelId}'. Add it to MODEL_FAMILY_MAP.`);
  return family;
}

// resolveModel must strip the prefix before calling the provider
export function resolveModel(modelId: string): LanguageModel {
  const family = getProviderFamily(modelId);
  switch (family) {
    case 'anthropic': return anthropic(modelId);
    case 'mistral':   return mistral(modelId);
    case 'ollama':    return ollama(modelId.replace(/^ollama:/, ''));
    case 'google':    return google(modelId);
  }
}
```

### Pattern 4: Embedding Swap in embeddings.ts

```typescript
// BEFORE
import { openai } from '@ai-sdk/openai';
model: openai.embedding('text-embedding-3-large'),

// AFTER — Source: https://ai-sdk.dev/providers/ai-sdk-providers/mistral
import { mistral } from '@ai-sdk/mistral';
model: mistral.embedding('mistral-embed'),
```

The `embed()` call from `ai` is unchanged — purely a model argument swap.

### Pattern 5: Ollama Auto-Pull via ollama-js

`ai-sdk-ollama` depends on `ollama@^0.6.3` (the official JS client). The Ollama REST API (`POST /api/pull`) supports streaming progress. Auto-pull logic should:

1. Check if the model exists: `GET /api/tags` → parse model list
2. If missing, call `ollama.pull({ model, stream: true })` and log progress
3. Ollama is available at `http://localhost:11434` by default (configurable via `OLLAMA_HOST`)

```typescript
import { Ollama } from 'ollama'; // bundled with ai-sdk-ollama

const ollamaClient = new Ollama({ host: process.env.OLLAMA_HOST ?? 'http://localhost:11434' });

async function ensureModel(modelTag: string): Promise<void> {
  const { models } = await ollamaClient.list();
  if (!models.find(m => m.name === modelTag)) {
    console.log(`Pulling ${modelTag}...`);
    const stream = await ollamaClient.pull({ model: modelTag, stream: true });
    for await (const chunk of stream) {
      process.stdout.write(`\r${chunk.status}`);
    }
    console.log(`\n${modelTag} ready.`);
  }
}
```

### Pattern 6: Ollama Health Check in health.ts

The existing `AI_PROVIDER_KEYS` check in `health.ts` warns if no AI keys are set. Ollama has no API key — it's a local HTTP service. The Ollama check is separate:

```typescript
// health.ts addition
async function ensureOllama(ollamaUrl: string, localModels: string[]): Promise<void> {
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) throw new Error(`Ollama returned HTTP ${res.status}`);
    const { models } = await res.json();
    for (const modelTag of localModels) {
      if (!models.find((m: { name: string }) => m.name === modelTag)) {
        exitWithError(`Ollama model '${modelTag}' not found. Auto-pull will run on next 'cauldron run'.`);
      }
    }
  } catch (err) {
    exitWithError(`Ollama not reachable at ${ollamaUrl}. Start Ollama before running Cauldron.`);
  }
}
```

Note: The health check only runs when at least one `ollama:*` model appears in the config. This is determined by scanning `config.models` for the `ollama:` prefix.

### Pattern 7: Capability Tags in GatewayConfig

The current `GatewayConfig` type in `config.ts` needs a new optional section:

```typescript
// config.ts additions
export type CapabilityLevel = 'strong' | 'moderate' | 'weak';
export type CapabilityDimension = 'coding' | 'reasoning' | 'instruction-following' | 'creativity' | 'speed';

export interface ProviderCapabilities {
  capabilities: Partial<Record<CapabilityDimension, CapabilityLevel>>;
}

export interface GatewayConfig {
  // ... existing fields ...
  providerCapabilities?: Partial<Record<ProviderFamily, ProviderCapabilities>>;
}
```

### Pattern 8: Model Stage Mapping Recommendation

Based on Mistral's current model lineup (verified 2026-04-02):

| Stage | Primary | Fallback 1 | Fallback 2 | Rationale |
|-------|---------|-----------|-----------|-----------|
| `interview` | `claude-sonnet-4-6` | `mistral-large-latest` | — | Instruction-following; Anthropic strong |
| `holdout` | `gemini-2.5-pro` | `mistral-large-latest` | `claude-sonnet-4-6` | Cross-family diversity; Google strong for eval |
| `implementation` | `claude-sonnet-4-6` | `mistral-large-latest` | — | Coding; Anthropic strong |
| `evaluation` | `gemini-2.5-pro` | `claude-sonnet-4-6` | — | Reasoning; Google strong |
| `decomposition` | `claude-sonnet-4-6` | `mistral-large-latest` | — | Reasoning + instruction-following |
| `context_assembly` | `mistral-small-latest` | `ollama:qwen3-30b-a3b` | — | Speed; cheap task; local proving ground |
| `conflict_resolution` | `claude-sonnet-4-6` | `mistral-large-latest` | — | Reasoning; structured output |

For `perspectiveModels` and `scoringModel`, replace `gpt-4.1-mini` with `mistral-small-latest` (speed-optimized, cheap). Scoring and interview perspective generation are lightweight tasks that `mistral-small-latest` handles well.

**Confidence note:** Model ID `mistral-large-latest` and `mistral-small-latest` are confirmed as valid alias forms in the Mistral API (verified via official docs and search results). These aliases always point to the current production version.

### Anti-Patterns to Avoid

- **Putting `ollama:*` models in the holdout chain:** D-08 explicitly excludes local Qwen from holdout. The planner should add a validation in `enforceDiversity` or `gateway.ts` that errors if an `ollama:` model is selected for the `holdout` stage.
- **Calling `validateProviderKeys` for Ollama the same way as hosted providers:** `validation.ts` calls `generateText` with `maxOutputTokens: 1` to ping each provider. Ollama doesn't use API keys — sending an AI SDK ping will fail unless Ollama is running. The Ollama validation must call the `/api/tags` HTTP endpoint instead, separate from the API key validation flow.
- **Leaving `MODEL_FAMILY_MAP` with `openai` entries:** The map is used to deduplicate by family in `validation.ts`. Leaving old `gpt-*` entries would cause `validateProviderKeys` to try resolving them, which will throw at the `openai` switch case.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mistral API client | Custom HTTP fetch to Mistral API | `@ai-sdk/mistral` | First-party; maintained by Vercel; handles auth, streaming, retries |
| Ollama API client | Custom HTTP to localhost:11434 | `ollama` (bundled in `ai-sdk-ollama`) | Official JS client; handles pull, list, generate with stream support |
| Embedding API | Custom vector call | `mistral.embedding('mistral-embed')` + AI SDK `embed()` | One-line swap; same interface as the removed OpenAI call |
| Model presence check | Custom `/api/tags` parse | `ollamaClient.list()` from `ollama` package | Typed, handles pagination |

**Key insight:** The AI SDK's provider abstraction means the language model surface is identical across all providers. The only provider-specific code lives in `providers.ts` — everything else (streaming, structured output, tool calls) continues working without changes.

---

## Common Pitfalls

### Pitfall 1: `MODEL_FAMILY_MAP` static lookup fails for `ollama:*` prefixed strings
**What goes wrong:** `getProviderFamily('ollama:qwen3-30b-a3b')` throws `Unknown model ID: 'ollama:qwen3-30b-a3b'` because the prefix form is not in the static map.
**Why it happens:** The map was designed for exact model ID strings like `'claude-sonnet-4-6'`. Prefix-based routing is a new concept.
**How to avoid:** Check `modelId.startsWith('ollama:')` before the map lookup in both `getProviderFamily` and `resolveModel`. Strip the prefix before passing to `ollama()`.
**Warning signs:** Test failures at `providers.ts:26` with `Unknown model ID` for any `ollama:*` config entry.

### Pitfall 2: `validation.ts` pings Ollama like a hosted provider
**What goes wrong:** `validateProviderKeys` calls `generateText` with `resolveModel(modelId)` to check the API key. For Ollama, there is no API key, and this will fail with a connection refused error if Ollama isn't running — or produce a misleading "key may be valid" non-auth error.
**Why it happens:** The validation was designed for hosted API providers with key-based auth.
**How to avoid:** Detect the `ollama` family in `validateProviderKeys` and route it to an HTTP reachability check (`GET /api/tags`) instead of an AI SDK ping.
**Warning signs:** `cauldron run` works in tests (mocked) but fails at startup with cryptic Ollama connection errors.

### Pitfall 3: Test config in `gateway.test.ts` still has `gpt-*` models
**What goes wrong:** Tests continue to reference `gpt-4o`, `gpt-4.1`, `gpt-4o-mini` in the `testConfig` object inside `gateway.test.ts`. After removing the `openai` case from `resolveModel`, the test config will cause `Unknown model ID` when gateway methods try to resolve models.
**Why it happens:** Test config is a copy-paste of the production config and not updated alongside it.
**How to avoid:** Replace all `gpt-*` in `testConfig` with the new provider models. Update the `vi.mock('@ai-sdk/openai', ...)` block to mock `@ai-sdk/mistral` and `ai-sdk-ollama` instead.
**Warning signs:** Gateway unit tests fail with `Unknown model ID` after the providers.ts changes.

### Pitfall 4: `ProviderFamily` type union not updated
**What goes wrong:** TypeScript narrows `ProviderFamily` as `'anthropic' | 'openai' | 'google'` in `types.ts`. Adding `mistral` and `ollama` to the switch in `providers.ts` without updating the type union produces a type error. More critically, functions like `enforceDiversity` compare families by value — if `'mistral'` isn't in the type, it can't be part of diversity checks.
**Why it happens:** The type is defined in `types.ts` separately from the switch in `providers.ts`.
**How to avoid:** Update `ProviderFamily` to `'anthropic' | 'mistral' | 'ollama' | 'google'` in `types.ts` as the first change.
**Warning signs:** TypeScript errors at `switch (family)` after adding `mistral`/`ollama` cases.

### Pitfall 5: Ollama model not running → silent pipeline failure
**What goes wrong:** D-10 requires Ollama to be running if any `ollama:*` model is in config. If it's not checked at startup, the first actual call to an `ollama:` model fails at runtime mid-pipeline with a connection error, and failover kicks in — silently violating the hard requirement.
**Why it happens:** The gateway's failover system will naturally fall back to the next model in the chain, masking the Ollama outage.
**How to avoid:** The `ensureOllama()` check in `health.ts` must run before `healthCheck()` returns, and it must `exitWithError` (not warn) when Ollama is configured but unreachable.
**Warning signs:** Integration tests pass (Ollama is skipped/mocked) but `cauldron run` silently uses fallback models instead of Ollama.

### Pitfall 6: `turbo.json` still passes `OPENAI_API_KEY` to build pipelines
**What goes wrong:** `OPENAI_API_KEY` is listed in `globalPassThroughEnv` in `turbo.json`. This is cosmetic but creates confusion — env documentation says the key is used, but the code no longer reads it.
**Why it happens:** `turbo.json` is separate from application code and easy to forget.
**How to avoid:** Replace `OPENAI_API_KEY` with `MISTRAL_API_KEY` in `globalPassThroughEnv` as part of cleanup.

---

## Code Examples

### Mistral Embedding Swap (embeddings.ts)

```typescript
// BEFORE (remove)
import { openai } from '@ai-sdk/openai';
model: openai.embedding('text-embedding-3-large'),

// AFTER — Source: https://ai-sdk.dev/providers/ai-sdk-providers/mistral
import { mistral } from '@ai-sdk/mistral';
model: mistral.embedding('mistral-embed'),
```

### New providers.ts Shape

```typescript
// Source: official @ai-sdk/mistral and ai-sdk-ollama docs
import { anthropic } from '@ai-sdk/anthropic';
import { mistral } from '@ai-sdk/mistral';
import { google } from '@ai-sdk/google';
import { ollama } from 'ai-sdk-ollama';
import type { LanguageModel } from 'ai';
import type { ProviderFamily } from './types.js';

// Mistral and Google entries added; OpenAI entries removed
export const MODEL_FAMILY_MAP: Record<string, ProviderFamily> = {
  'claude-sonnet-4-6':     'anthropic',
  'claude-opus-4-6':       'anthropic',
  'claude-haiku-4-5':      'anthropic',
  'mistral-large-latest':  'mistral',
  'mistral-small-latest':  'mistral',
  'codestral-latest':      'mistral',
  'gemini-2.5-pro':        'google',
  'gemini-2.5-flash':      'google',
};

export function getProviderFamily(modelId: string): ProviderFamily {
  if (modelId.startsWith('ollama:')) return 'ollama';
  const family = MODEL_FAMILY_MAP[modelId];
  if (!family) throw new Error(`Unknown model ID: '${modelId}'. Add it to MODEL_FAMILY_MAP.`);
  return family;
}

export function resolveModel(modelId: string): LanguageModel {
  const family = getProviderFamily(modelId);
  switch (family) {
    case 'anthropic': return anthropic(modelId);
    case 'mistral':   return mistral(modelId);
    case 'google':    return google(modelId);
    case 'ollama':    return ollama(modelId.slice('ollama:'.length));
  }
}
```

### Updated ProviderFamily type (types.ts)

```typescript
export type ProviderFamily = 'anthropic' | 'mistral' | 'ollama' | 'google';
```

### New cauldron.config.ts Shape

```typescript
import { defineConfig } from '@get-cauldron/engine/gateway';

export default defineConfig({
  models: {
    interview:          ['claude-sonnet-4-6', 'mistral-large-latest'],
    holdout:            ['gemini-2.5-pro', 'mistral-large-latest', 'claude-sonnet-4-6'],
    implementation:     ['claude-sonnet-4-6', 'mistral-large-latest'],
    evaluation:         ['gemini-2.5-pro', 'claude-sonnet-4-6'],
    decomposition:      ['claude-sonnet-4-6', 'mistral-large-latest'],
    context_assembly:   ['mistral-small-latest', 'ollama:qwen3-30b-a3b'],
    conflict_resolution:['claude-sonnet-4-6', 'mistral-large-latest'],
  },
  budget: { defaultLimitCents: 500 },
  perspectiveModels: {
    researcher:       'claude-sonnet-4-6',
    simplifier:       'mistral-small-latest',
    architect:        'mistral-large-latest',
    'breadth-keeper': 'claude-sonnet-4-6',
    'seed-closer':    'claude-sonnet-4-6',
  },
  scoringModel: 'mistral-small-latest',
  providerCapabilities: {
    anthropic: { capabilities: { coding: 'strong', reasoning: 'strong', 'instruction-following': 'strong', creativity: 'strong', speed: 'moderate' } },
    google:    { capabilities: { coding: 'moderate', reasoning: 'strong', 'instruction-following': 'moderate', creativity: 'moderate', speed: 'strong' } },
    mistral:   { capabilities: { coding: 'moderate', reasoning: 'moderate', 'instruction-following': 'strong', creativity: 'moderate', speed: 'strong' } },
    ollama:    { capabilities: { coding: 'moderate', reasoning: 'moderate', 'instruction-following': 'moderate', creativity: 'moderate', speed: 'strong' } },
  },
  selfBuild: true,
  cli: { serverUrl: 'http://localhost:3000', apiKey: '' },
});
```

### Updated gateway.test.ts Mock Block

```typescript
// Replace @ai-sdk/openai mock with:
vi.mock('@ai-sdk/mistral', () => ({
  mistral: (modelId: string) => ({ provider: 'mistral', modelId }),
}));
vi.mock('ai-sdk-ollama', () => ({
  ollama: (modelId: string) => ({ provider: 'ollama', modelId }),
}));

// testConfig — remove all gpt-* entries:
const testConfig: GatewayConfig = {
  models: {
    interview:           ['claude-sonnet-4-6', 'mistral-large-latest'],
    holdout:             ['gemini-2.5-pro', 'mistral-large-latest'],
    implementation:      ['claude-sonnet-4-6'],
    evaluation:          ['gemini-2.5-pro'],
    decomposition:       ['claude-sonnet-4-6', 'mistral-large-latest'],
    context_assembly:    ['mistral-small-latest', 'ollama:qwen3-30b-a3b'],
    conflict_resolution: ['claude-sonnet-4-6', 'mistral-small-latest'],
  },
  budget: { defaultLimitCents: 1000 },
};
```

### Updated embeddings.test.ts Mock Block

```typescript
// Replace @ai-sdk/openai mock with:
vi.mock('@ai-sdk/mistral', () => ({
  mistral: {
    embedding: vi.fn(() => 'mock-embedding-model'),
  },
}));
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@ai-sdk/mistral` | Provider wiring | not installed (new) | 3.0.28 (to install) | — |
| `ai-sdk-ollama` | Ollama provider | not installed (new) | 3.8.2 (to install) | — |
| Ollama CLI/service | D-10 startup check | NOT FOUND | — | Hard fail per D-10 (user installs manually) |
| Node.js | Build/test | available | (project requirement) | — |

**Missing dependencies with no fallback:**
- Ollama service: Not installed on this machine. Per D-10, if `ollama:*` models are in config, Cauldron hard-fails at startup. The auto-pull feature (D-11) requires Ollama to be running first. The planner must include a task note that the user must install Ollama (`brew install ollama` on macOS) before the local Qwen path is exercisable. The Ollama presence check in `health.ts` should produce a clear install instruction.

**Missing dependencies with fallback:**
- npm packages `@ai-sdk/mistral` and `ai-sdk-ollama`: Not yet in `package.json`. Installation is a Wave 0 task.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `packages/engine/vitest.config.ts` |
| Quick run command | `pnpm -F @get-cauldron/engine test -- src/gateway/__tests__/gateway.test.ts src/evolution/__tests__/embeddings.test.ts` |
| Full suite command | `pnpm -F @get-cauldron/engine test` |

### Phase Requirements → Test Map
| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| `providers.ts` resolves `mistral` family | unit | `pnpm -F @get-cauldron/engine test -- src/gateway/__tests__/gateway.test.ts` | Exists (needs mock update) |
| `providers.ts` resolves `ollama:*` prefix | unit | `pnpm -F @get-cauldron/engine test -- src/gateway/__tests__/gateway.test.ts` | Needs new test case |
| `embeddings.ts` uses Mistral embedding model | unit | `pnpm -F @get-cauldron/engine test -- src/evolution/__tests__/embeddings.test.ts` | Exists (needs mock update) |
| No `@ai-sdk/openai` import in gateway tests | unit (mock assertion) | `pnpm -F @get-cauldron/engine test` | Exists (after mock removal) |
| TypeScript compiles with new ProviderFamily type | typecheck | `pnpm -F @get-cauldron/engine typecheck` | N/A |
| `holdout` stage with `ollama:*` primary throws DiversityViolationError | unit | `pnpm -F @get-cauldron/engine test -- --grep "ollama holdout"` | Needs new test case |

### Sampling Rate
- **Per task commit:** `pnpm -F @get-cauldron/engine test -- src/gateway/__tests__/gateway.test.ts src/evolution/__tests__/embeddings.test.ts`
- **Per wave merge:** `pnpm -F @get-cauldron/engine test && pnpm typecheck`
- **Phase gate:** Full suite + typecheck green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/engine/src/gateway/__tests__/gateway.test.ts` — add test for `ollama:` prefix resolution in `resolveModel`
- [ ] `packages/engine/src/gateway/__tests__/gateway.test.ts` — add test that `ollama:*` model in holdout stage triggers `DiversityViolationError` (verifies D-08)
- [ ] Both existing test files need mock swaps before any implementation changes; update mocks first to unblock all other tests

---

## Open Questions

1. **Qwen3-30B-A3B exact Ollama model tag**
   - What we know: User specified `qwen3-30b-a3b` as the target. Ollama model tags may differ from the canonical model name (e.g., `qwen3:30b-a3b` or `qwen3-30b-a3b:latest`).
   - What's unclear: The exact Ollama `ollama pull` tag — this is needed for `cauldron.config.ts` and the auto-pull logic.
   - Recommendation: The plan should use `qwen3-30b-a3b` as a placeholder and note that the user should verify with `ollama search qwen3` or check https://ollama.com/library/qwen3. The auto-pull code can use whatever tag is in the config verbatim.

2. **Ollama holdout exclusion enforcement location**
   - What we know: D-08 says local Qwen must not appear in holdout chains. The diversity enforcer in `diversity.ts` already rejects same-family. But `ollama` would be a new family and could appear as primary if mistakenly added.
   - What's unclear: Should enforcement be in `diversity.ts` (reject `ollama` family for holdout stage) or a config-time validation in `loadConfig`?
   - Recommendation: Add a config-time validation in `loadConfig` or `defineConfig` that errors if any `ollama:*` model appears in the `holdout` model chain. This catches misconfiguration before runtime.

3. **`live-infra.ts` LIVE_CONFIG models after OpenAI removal**
   - What we know: `pipeline-live.spec.ts` has a hardcoded `LIVE_CONFIG` with `gpt-4.1-mini` in all stages. These need updating.
   - What's unclear: The live E2E test is designed for cheap/fast models. `mistral-small-latest` is a reasonable replacement but hasn't been benchmarked against the live pipeline.
   - Recommendation: Replace `gpt-4.1-mini` with `mistral-small-latest` throughout `LIVE_CONFIG`. The test will still be skipped without API keys, and the prerequisite comment should be updated to list `MISTRAL_API_KEY`.

---

## Sources

### Primary (HIGH confidence)
- https://ai-sdk.dev/providers/ai-sdk-providers/mistral — Mistral provider API, model list, embedding API
- https://ai-sdk.dev/providers/community-providers/ollama — Official AI SDK docs on Ollama community providers
- https://www.npmjs.com/package/ai-sdk-ollama — Package version, peer deps, publish date (verified 2026-04-02)
- https://www.npmjs.com/package/@ai-sdk/mistral — Package version 3.0.28 (verified 2026-04-02)
- Source code: `packages/engine/src/gateway/providers.ts` — existing switch pattern
- Source code: `packages/engine/src/evolution/embeddings.ts` — exact one-line swap target
- Source code: `packages/engine/src/gateway/types.ts` — ProviderFamily union to extend
- Source code: `packages/engine/src/gateway/validation.ts` — Ollama validation divergence needed

### Secondary (MEDIUM confidence)
- https://docs.mistral.ai/getting-started/models/models_overview/ — `mistral-large-latest`, `mistral-small-latest` model IDs confirmed
- https://github.com/jagreehal/ai-sdk-ollama — AI SDK v6 peer dep confirmed, ollama-js bundled
- Ollama REST API `POST /api/pull` for auto-pull pattern

### Tertiary (LOW confidence)
- Qwen3-30B-A3B exact Ollama tag — unverified; user should confirm with `ollama search qwen3`

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm registry confirmed, AI SDK v6 peer dep verified
- Architecture: HIGH — source code read directly; all touchpoints identified
- Pitfalls: HIGH — derived from actual code patterns in `validation.ts`, `providers.ts`, `gateway.test.ts`
- Model assignments: MEDIUM — `mistral-large-latest` / `mistral-small-latest` confirmed as valid aliases; capability ratings are benchmark-informed estimates

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (model aliases stable; packages move fast but peer deps are pinned)
