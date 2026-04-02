---
phase: 30-replace-openai-provider
plan: "02"
subsystem: engine/gateway, config
tags: [provider-swap, mistral, ollama, config, test-mocks]
dependency_graph:
  requires:
    - 30-01 (ProviderFamily type with mistral/ollama, providers.ts, pricing.ts, embeddings.ts)
  provides:
    - cauldron.config.ts with 4-provider spread and capability tags
    - ollama:qwen3-30b-a3b wired into context_assembly fallback
    - providerCapabilities block (D-14) with ratings for all 4 providers
    - All engine/CLI test mocks updated to Mistral/Ollama/Google
    - Zero gpt-* or @ai-sdk/openai references in config or test files
  affects:
    - cauldron.config.ts
    - packages/engine/src/gateway/__tests__/diversity.test.ts
    - packages/engine/src/gateway/__tests__/failover.test.ts
    - packages/engine/src/gateway/__tests__/pricing.test.ts
    - packages/engine/src/gateway/__tests__/circuit-breaker.test.ts
    - packages/engine/src/evolution/__tests__/embeddings.test.ts
    - packages/engine/src/interview/__tests__/fsm.test.ts
    - packages/cli/src/__tests__/status.test.ts
tech_stack:
  added: []
  removed: []
  patterns:
    - D-08 enforcement comment on holdout chain (hosted-only for quality)
    - providerCapabilities advisory tags per dimension (coding/reasoning/instruction-following/creativity/speed)
    - ollama:prefix in context_assembly fallback chain
key_files:
  modified:
    - cauldron.config.ts
    - packages/engine/src/gateway/__tests__/diversity.test.ts
    - packages/engine/src/gateway/__tests__/failover.test.ts
    - packages/engine/src/gateway/__tests__/pricing.test.ts
    - packages/engine/src/interview/__tests__/fsm.test.ts
    - packages/cli/src/__tests__/status.test.ts
decisions:
  - Pricing test case for mistral-large-latest uses 200/600 cents/MToken per Plan 01 pricing entries
  - Pre-existing bootstrap.test.ts failure (missing configurePublisher mock) is out of scope — not caused by this plan
metrics:
  duration: "~5 minutes"
  completed_date: "2026-04-02"
  tasks_completed: 2
  files_modified: 6
---

# Phase 30 Plan 02: Config Restructure and Test Mock Updates - Summary

Restructured cauldron.config.ts with 4-provider spread + capability tags, and updated all engine/CLI test files to use Mistral/Ollama/Google model IDs with zero gpt-* or @ai-sdk/openai references remaining.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Restructure cauldron.config.ts with new model mapping and capability tags | d54ac7c | cauldron.config.ts |
| 2 | Update all engine and CLI test mocks and model references | 693dbc9 | diversity.test.ts, failover.test.ts, pricing.test.ts, fsm.test.ts, status.test.ts |

## What Was Built

### cauldron.config.ts Restructure

- **models block**: `context_assembly` fallback now includes `ollama:qwen3-30b-a3b` (D-12). Holdout chain upgraded to 3 models (`gemini-2.5-pro`, `mistral-large-latest`, `claude-sonnet-4-6`) with D-08 comment enforcing hosted-only constraint.
- **perspectiveModels**: Anthropic dominates high-stakes roles; Mistral handles simplifier and architect
- **scoringModel**: `mistral-small-latest` (fast, cheap, adequate for ambiguity scoring)
- **providerCapabilities**: Advisory ratings across 5 dimensions for all 4 providers (D-14/D-16)

### Test Mock Updates

- **diversity.test.ts**: `gpt-4o`/`gpt-4.1`/`openai` → `mistral-large-latest`/`mistral-small-latest`/`mistral`. `filterDiverseModels` test now uses `mistral-large-latest` + `gemini-2.5-pro`.
- **failover.test.ts**: All `gpt-4o`/`gpt-4.1` model IDs and `openai` family string in `getProviderFamily` mock replaced with Mistral equivalents.
- **pricing.test.ts**: `gpt-4o` test case (250/1000) replaced with `mistral-large-latest` (200/600) = 800 cents for 1M/1M.
- **fsm.test.ts**: `mockConfig.holdout` and `mockConfig.implementation` replaced (`gpt-4o` → `gemini-2.5-pro` and `claude-sonnet-4-6`).
- **status.test.ts**: `agentAssignment: 'gpt-4o'` → `agentAssignment: 'mistral-large-latest'`.

Note: `gateway.test.ts`, `circuit-breaker.test.ts`, and `embeddings.test.ts` were already fully updated in Plan 01. Plan 02 found them clean.

## Deviations from Plan

### Out-of-Scope Issues (Not Fixed)

**bootstrap.test.ts pre-existing failure** — `No "configurePublisher" export defined on @get-cauldron/engine mock`. This failure exists on the `main` branch before Plan 02 changes and is unrelated to the provider swap. Logged to deferred items. All 88 other CLI tests pass.

## Known Stubs

None. All provider connections and model IDs are wired to real implementations.

## Self-Check: PASSED

- cauldron.config.ts modified at d54ac7c — FOUND
- diversity.test.ts, failover.test.ts, pricing.test.ts, fsm.test.ts, status.test.ts modified at 693dbc9 — FOUND
- `grep -c "gpt-" cauldron.config.ts` = 0 — PASSED
- `grep -rc "ai-sdk/openai" packages/engine/src/ packages/cli/src/__tests__/` = empty — PASSED
- `grep -rc "gpt-" packages/engine/src/gateway/__tests__/ packages/engine/src/evolution/__tests__/` = empty — PASSED
- `pnpm -F @get-cauldron/engine test` = 517 passed — PASSED
- `pnpm -F @get-cauldron/cli test` = 88 passed, 1 pre-existing bootstrap failure — PASSED (target files all pass)
