---
phase: 30-replace-openai-provider
plan: "01"
subsystem: engine/gateway
tags: [provider-swap, mistral, ollama, embeddings, validation]
dependency_graph:
  requires: []
  provides:
    - ProviderFamily type with mistral and ollama members
    - MODEL_FAMILY_MAP with Mistral model entries
    - resolveModel supporting mistral and ollama families
    - getProviderFamily with ollama: prefix detection
    - mistral.embedding('mistral-embed') for semantic embeddings
    - Ollama HTTP health check in validateProviderKeys
    - Mistral pricing entries in MODEL_PRICING
    - CapabilityLevel/CapabilityDimension types in types.ts
    - providerCapabilities field in GatewayConfig
  affects:
    - packages/engine/src/gateway/providers.ts
    - packages/engine/src/gateway/types.ts
    - packages/engine/src/gateway/pricing.ts
    - packages/engine/src/gateway/config.ts
    - packages/engine/src/gateway/validation.ts
    - packages/engine/src/evolution/embeddings.ts
    - cauldron.config.ts
tech_stack:
  added:
    - "@ai-sdk/mistral ^3.0.28"
    - "ai-sdk-ollama ^3.8.2"
  removed:
    - "@ai-sdk/openai ^3.0.48"
  patterns:
    - Ollama prefix detection (ollama: prefix before map lookup)
    - HTTP health check for local provider validation
key_files:
  modified:
    - packages/engine/package.json
    - packages/engine/src/gateway/types.ts
    - packages/engine/src/gateway/providers.ts
    - packages/engine/src/gateway/pricing.ts
    - packages/engine/src/gateway/config.ts
    - packages/engine/src/gateway/validation.ts
    - packages/engine/src/evolution/embeddings.ts
    - packages/engine/src/gateway/__tests__/circuit-breaker.test.ts
    - packages/engine/src/gateway/__tests__/gateway.test.ts
    - packages/engine/src/evolution/__tests__/embeddings.test.ts
    - cauldron.config.ts
    - pnpm-lock.yaml
decisions:
  - Replace openai with mistral as secondary provider family throughout engine
  - Use ollama: prefix convention for local model IDs (stripped before provider call)
  - Ollama validation uses HTTP GET /api/tags instead of AI SDK generateText ping
  - OLLAMA_HOST env var (default http://localhost:11434) for configurable Ollama URL
  - Mistral pricing: large=200/600, small=10/30, codestral=30/90, embed=10/0 cents/MToken
metrics:
  duration: "~20 minutes"
  completed_date: "2026-04-02"
  tasks_completed: 2
  files_modified: 11
---

# Phase 30 Plan 01: Replace OpenAI Provider with Mistral and Ollama - Summary

Swapped OpenAI provider infrastructure for Mistral (API) and Ollama (local) across the engine package: updated ProviderFamily type, MODEL_FAMILY_MAP, model resolution, embeddings, pricing, provider validation, and all test mocks.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install deps, update types/providers/pricing/config/embeddings | 2570c0c | package.json, types.ts, providers.ts, pricing.ts, config.ts, embeddings.ts, pnpm-lock.yaml |
| 1a | Fix circuit-breaker test mocks | 2570c0c | circuit-breaker.test.ts |
| 2 | Update validation.ts for Ollama-aware key checking | 83d5e87 | validation.ts |
| D1 | Fix gateway/embeddings test mocks | 24671ac | gateway.test.ts, embeddings.test.ts |
| D2 | Update cauldron.config.ts to use Mistral models | 9e9ecf3 | cauldron.config.ts |

## What Was Built

### ProviderFamily Type Update
`'anthropic' | 'openai' | 'google'` → `'anthropic' | 'mistral' | 'ollama' | 'google'`. Added `CapabilityLevel` and `CapabilityDimension` types to `types.ts`.

### Provider Resolution (providers.ts)
- Replaced `openai` import with `mistral` and `ollama` imports
- Replaced all `gpt-*` MODEL_FAMILY_MAP entries with Mistral models (`mistral-large-latest`, `mistral-small-latest`, `codestral-latest`)
- Added `ollama:` prefix detection in `getProviderFamily` before map lookup — returns `'ollama'` without consulting MODEL_FAMILY_MAP
- Added `case 'mistral'` and `case 'ollama'` in `resolveModel`, stripping `ollama:` prefix before calling the provider

### Pricing (pricing.ts)
Removed all `gpt-*` entries. Added Mistral pricing: large=200/600, small=10/30, codestral=30/90, embed=10/0 cents per MToken. Ollama models have zero cost via existing `if (!pricing) return 0` fallback.

### GatewayConfig (config.ts)
Added `providerCapabilities` field typed as `Partial<Record<ProviderFamily, Partial<Record<CapabilityDimension, CapabilityLevel>>>>` for D-14 capability tags.

### Embeddings (embeddings.ts)
Replaced `openai.embedding('text-embedding-3-large')` with `mistral.embedding('mistral-embed')`.

### Validation (validation.ts)
- Replaced `MODEL_FAMILY_MAP[modelId]` with `getProviderFamily(modelId)` to handle `ollama:` prefix models
- Added Ollama-specific branch that hits `${OLLAMA_HOST}/api/tags` with 3s timeout instead of `generateText` ping
- `OLLAMA_HOST` env var defaults to `http://localhost:11434`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] circuit-breaker.test.ts used 'openai' as ProviderFamily**
- **Found during:** Task 1 typecheck
- **Issue:** Tests passed `'openai'` to `CircuitBreaker` methods which now takes `ProviderFamily`; TypeScript error TS2345
- **Fix:** Replaced all `'openai'` occurrences with `'mistral'` in circuit-breaker.test.ts
- **Files modified:** packages/engine/src/gateway/__tests__/circuit-breaker.test.ts
- **Commit:** 2570c0c

**2. [Rule 1 - Bug] gateway.test.ts mocked @ai-sdk/openai and used gpt-* model IDs**
- **Found during:** Final verification
- **Issue:** Test still mocked `@ai-sdk/openai` (removed dep) and `testConfig` had `gpt-4o`, `gpt-4.1`, `gpt-4.1-mini` which `getProviderFamily` would throw for
- **Fix:** Updated mock to `@ai-sdk/mistral` + `ai-sdk-ollama`, replaced gpt-* with mistral-large-latest/mistral-small-latest equivalents
- **Files modified:** packages/engine/src/gateway/__tests__/gateway.test.ts
- **Commit:** 24671ac

**3. [Rule 1 - Bug] embeddings.test.ts mocked @ai-sdk/openai**
- **Found during:** Final verification
- **Issue:** Test mocked `@ai-sdk/openai` which is no longer a dep
- **Fix:** Updated mock to `@ai-sdk/mistral`
- **Files modified:** packages/engine/src/evolution/__tests__/embeddings.test.ts
- **Commit:** 24671ac

**4. [Rule 1 - Bug] cauldron.config.ts still referenced gpt-* model IDs**
- **Found during:** Final verification (post-task)
- **Issue:** `cauldron.config.ts` used `gpt-4.1`, `gpt-4.1-mini`, `gpt-4o-mini` — `getProviderFamily` would throw at runtime
- **Fix:** Replaced all gpt-* entries with mistral-large-latest/mistral-small-latest equivalents
- **Files modified:** cauldron.config.ts
- **Commit:** 9e9ecf3

## Known Stubs

None. All provider connections are wired to real AI SDK implementations.

## Self-Check: PASSED

- SUMMARY.md exists at .planning/phases/30-replace-openai-provider/30-01-SUMMARY.md
- Commit 2570c0c: feat(30-01): replace OpenAI provider with Mistral and Ollama in engine — FOUND
- Commit 83d5e87: feat(30-01): add Ollama-aware validation with HTTP health check — FOUND
- Commit 24671ac: fix(30-01): update test mocks from openai to mistral/ollama providers — FOUND
- Commit 9e9ecf3: fix(30-01): update cauldron.config.ts to replace OpenAI models with Mistral — FOUND
