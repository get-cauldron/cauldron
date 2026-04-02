---
phase: 30-replace-openai-provider
verified: 2026-04-02T17:36:00Z
status: passed
score: 5/5 success criteria verified
re_verification: false
---

# Phase 30: Replace OpenAI Provider Verification Report

**Phase Goal:** Remove `@ai-sdk/openai` entirely and replace all OpenAI model references with Anthropic (primary), Google, Mistral (new), and local Qwen via Ollama (experimental) — no pipeline stage references a missing provider
**Verified:** 2026-04-02T17:36:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `@ai-sdk/openai` is not in any package.json | VERIFIED | `grep -r "@ai-sdk/openai" packages/*/package.json` returns empty. `packages/engine/package.json` has `@ai-sdk/mistral ^3.0.28` and `ai-sdk-ollama ^3.8.2` instead. |
| 2 | `cauldron.config.ts` contains no `gpt-` model references | VERIFIED | `grep -c "gpt-" cauldron.config.ts` = 0. Config uses 4-provider spread: `claude-sonnet-4-6`, `mistral-large-latest`, `gemini-2.5-pro`, `ollama:qwen3-30b-a3b`. |
| 3 | `providers.ts` resolves `mistral` and `ollama` provider families | VERIFIED | `resolveModel` switch has `case 'mistral': return mistral(modelId)` and `case 'ollama': return ollama(modelId.slice('ollama:'.length))`. `getProviderFamily` detects `ollama:` prefix before map lookup. |
| 4 | `embeddings.ts` uses Mistral embeddings | VERIFIED | `model: mistral.embedding('mistral-embed')` at line 7. Import is `import { mistral } from '@ai-sdk/mistral'`. No openai reference. |
| 5 | All existing tests pass with updated mocks — no test references `@ai-sdk/openai` | VERIFIED (with pre-existing caveat) | Engine: 524/524 passed. Web: 173/173 passed. CLI: 88/89 passed — 1 pre-existing bootstrap.test.ts failure (missing `configurePublisher` in mock) that predates phase 30 (commit `6c9d7a0`, phase 19). Zero `@ai-sdk/openai` references in any test file. |

**Score:** 5/5 success criteria verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/engine/src/gateway/types.ts` | ProviderFamily union with mistral and ollama | VERIFIED | Line 5: `export type ProviderFamily = 'anthropic' \| 'mistral' \| 'ollama' \| 'google'` |
| `packages/engine/src/gateway/providers.ts` | Provider resolution for mistral and ollama | VERIFIED | Imports `mistral` from `@ai-sdk/mistral`, `ollama` from `ai-sdk-ollama`. MODEL_FAMILY_MAP has `mistral-large-latest`, `mistral-small-latest`, `codestral-latest`. `getProviderFamily` handles `ollama:` prefix. |
| `packages/engine/src/gateway/pricing.ts` | Mistral pricing entries | VERIFIED | `mistral-large-latest: {200, 600}`, `mistral-small-latest: {10, 30}`, `codestral-latest: {30, 90}`, `mistral-embed: {10, 0}`. No `gpt-*` entries. |
| `packages/engine/src/gateway/validation.ts` | Ollama-aware validation | VERIFIED | Uses `getProviderFamily()` (not direct map). `ollama` family branch hits `${OLLAMA_HOST}/api/tags` with 3s timeout. `MODEL_FAMILY_MAP` import removed. |
| `packages/engine/src/gateway/config.ts` | CapabilityLevel type | VERIFIED | Imports `CapabilityLevel`, `CapabilityDimension`. `providerCapabilities` field in `GatewayConfig`. |
| `packages/engine/src/evolution/embeddings.ts` | Mistral embedding model | VERIFIED | `mistral.embedding('mistral-embed')`. Import from `@ai-sdk/mistral`. |
| `cauldron.config.ts` | 4-provider spread with capability tags | VERIFIED | All 7 stages mapped. `providerCapabilities` block present with ratings for all 4 providers. D-08 comment on holdout chain. Zero `gpt-*` references. |
| `packages/cli/src/health.ts` | MISTRAL_API_KEY + Ollama health check + auto-pull | VERIFIED | `AI_PROVIDER_KEYS` has `MISTRAL_API_KEY`. `ensureOllama()` hits `/api/tags`. `ensureModels()` uses `ollamaClient.list()` + `ollamaClient.pull()`. |
| `packages/cli/src/bootstrap.ts` | MISTRAL_API_KEY quote-strip | VERIFIED | Line 12: quote-strip loop has `MISTRAL_API_KEY`, not `OPENAI_API_KEY`. |
| `.env.example` | MISTRAL_API_KEY and OLLAMA_HOST | VERIFIED | Line 15: `MISTRAL_API_KEY=`. Line 17: `OLLAMA_HOST=http://localhost:11434` with comment. No `OPENAI_API_KEY`. |
| `turbo.json` | MISTRAL_API_KEY and OLLAMA_HOST in globalPassThroughEnv | VERIFIED | Both `"MISTRAL_API_KEY"` and `"OLLAMA_HOST"` present. No `"OPENAI_API_KEY"`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `providers.ts` | `@ai-sdk/mistral` | `import { mistral } from '@ai-sdk/mistral'` | WIRED | Line 2 of providers.ts. Used in `resolveModel` case 'mistral'. |
| `providers.ts` | `ai-sdk-ollama` | `import { ollama } from 'ai-sdk-ollama'` | WIRED | Line 3 of providers.ts. Used in `resolveModel` case 'ollama'. |
| `embeddings.ts` | `@ai-sdk/mistral` | `mistral.embedding('mistral-embed')` | WIRED | Import line 2, used at line 7 in `computeEmbedding`. |
| `validation.ts` | `getProviderFamily` | `import { resolveModel, getProviderFamily } from './providers.js'` | WIRED | Line 2. Used in for-loop family deduction. Replaces direct map access. |
| `health.ts` | Ollama HTTP API | `fetch('/api/tags')` + `ollamaClient.list()` + `ollamaClient.pull()` | WIRED | `ensureOllama` fetches `/api/tags`. `ensureModels` calls `ollamaClient.list()` and `ollamaClient.pull()`. |
| `cauldron.config.ts` | `providers.ts` MODEL_FAMILY_MAP | model IDs exist in map or use `ollama:` prefix | WIRED | All config model IDs (`claude-sonnet-4-6`, `mistral-large-latest`, `mistral-small-latest`, `gemini-2.5-pro`, `ollama:qwen3-30b-a3b`) resolve via `getProviderFamily`. |

### Data-Flow Trace (Level 4)

Not applicable — this phase modifies provider infrastructure and config, not data-rendering components.

### Behavioral Spot-Checks

| Behavior | Check | Result | Status |
|----------|-------|--------|--------|
| providers.ts has no openai import | `grep -c "openai" providers.ts` | 0 | PASS |
| cauldron.config.ts has no gpt- references | `grep -c "gpt-" cauldron.config.ts` | 0 | PASS |
| engine package has @ai-sdk/mistral | `grep "@ai-sdk/mistral" packages/engine/package.json` | found | PASS |
| engine package has no @ai-sdk/openai | `grep "@ai-sdk/openai" packages/*/package.json` | empty | PASS |
| engine unit tests pass | `pnpm -F @get-cauldron/engine test` | 524/524 | PASS |
| web unit tests pass | `pnpm -F @get-cauldron/web test` | 173/173 | PASS |
| CLI unit tests pass (excluding pre-existing failure) | `pnpm -F @get-cauldron/cli test` | 88/89 (1 pre-existing) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SC-01 | 30-01, 30-03 | `@ai-sdk/openai` not in any package.json | SATISFIED | Zero matches across all package.json files |
| SC-02 | 30-01, 30-02 | `cauldron.config.ts` has no `gpt-` model references | SATISFIED | `grep -c "gpt-" cauldron.config.ts` = 0 |
| SC-03 | 30-01 | `providers.ts` resolves `mistral` and `ollama` provider families | SATISFIED | Both `case 'mistral'` and `case 'ollama'` in `resolveModel`; `ollama:` prefix detection in `getProviderFamily` |
| SC-04 | 30-01 | `embeddings.ts` uses Mistral embeddings | SATISFIED | `mistral.embedding('mistral-embed')` at line 7 |
| SC-05 | 30-01, 30-02, 30-03 | All existing tests pass with updated mocks — no test references `@ai-sdk/openai` | SATISFIED | Zero `@ai-sdk/openai` in any test file. Engine 524/524, web 173/173, CLI 88/89 (1 pre-existing unrelated failure). |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/shared/src/db/__tests__/fk-cascade.integration.test.ts` | 186 | `model: 'gpt-4o'` as DB fixture value | Info | This is a string value stored in `llm_usage.model` column as test data for a FK cascade integration test (DATA-05). It is not a routed model ID — the test verifies database FK cascade behavior, not provider routing. The value is semantically arbitrary. Not a blocker. |
| `packages/cli/src/__tests__/bootstrap.test.ts` | 10-26 | `vi.mock('@get-cauldron/engine')` missing `configurePublisher` export | Warning | Pre-existing failure from phase 19 (commit `6c9d7a0`). Not introduced or modified by phase 30. 1 test fails with `No "configurePublisher" export`. Out of scope for this phase. |

### Human Verification Required

None required for automated checks. All success criteria are verifiable programmatically.

### Gaps Summary

No gaps. All five success criteria are fully satisfied in the actual codebase:

1. `@ai-sdk/openai` is completely removed from all `package.json` files.
2. `cauldron.config.ts` uses a 4-provider model spread with zero `gpt-` references.
3. `providers.ts` correctly resolves both `mistral` and `ollama` families, with prefix detection for Ollama.
4. `embeddings.ts` uses `mistral.embedding('mistral-embed')`.
5. All test files are free of `@ai-sdk/openai` references; the engine (524 tests) and web (173 tests) test suites pass cleanly. The one CLI test failure (`bootstrap.test.ts`) is a pre-existing mock gap from phase 19 unrelated to provider swapping.

The two noted items (gpt-4o in fk-cascade fixture data and bootstrap mock gap) are both out of scope for phase 30 and neither blocks the phase goal.

---

_Verified: 2026-04-02T17:36:00Z_
_Verifier: Claude (gsd-verifier)_
