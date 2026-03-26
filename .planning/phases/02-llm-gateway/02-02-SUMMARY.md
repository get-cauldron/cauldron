---
phase: 02-llm-gateway
plan: "02"
subsystem: llm-gateway
tags: [llm-gateway, circuit-breaker, failover, diversity, streaming]
dependency_graph:
  requires: ["02-01"]
  provides: ["LLMGateway", "CircuitBreaker", "executeWithFailover", "enforceDiversity", "filterDiverseModels"]
  affects: ["03-interview-engine", "04-holdout-vault", "05-bead-scheduler", "06-execution-engine"]
tech_stack:
  added: []
  patterns:
    - "Circuit breaker pattern with 3-failure threshold and 60s cooldown"
    - "Failover with single retry + exponential backoff (1s base, 8s cap)"
    - "Discriminated union prompt dispatch (messages XOR prompt) for AI SDK v6 compatibility"
    - "Fire-and-forget usage tracking via void Promise pattern"
    - "Stage preamble injection for all LLM calls"
key_files:
  created:
    - packages/engine/src/gateway/circuit-breaker.ts
    - packages/engine/src/gateway/diversity.ts
    - packages/engine/src/gateway/failover.ts
    - packages/engine/src/gateway/gateway.ts
  modified:
    - packages/engine/src/gateway/index.ts
    - packages/shared/src/index.ts
decisions:
  - "Used Promise<any> return type on streamText/generateText to avoid TypeScript TS4053 error caused by AI SDK v6 exporting 'output as Output' as a value namespace"
  - "Added appendEvent and event-store helpers to @cauldron/shared barrel export (Rule 2: missing critical functionality)"
  - "Backoff uses attempt index 0 on first retry (1000ms base), capped at 8000ms per D-14"
  - "Non-retryable errors (auth_error, other) do not increment circuit failure count"
metrics:
  duration: "6 minutes"
  completed_date: "2026-03-26"
  tasks_completed: 2
  files_changed: 6
---

# Phase 02 Plan 02: LLM Gateway Implementation Summary

LLMGateway class with circuit breaker, failover orchestration, and cross-model diversity enforcement using the Vercel AI SDK.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Circuit breaker, diversity enforcer, failover orchestrator | fd420f9 | circuit-breaker.ts, diversity.ts, failover.ts |
| 2 | LLMGateway class with 4 API methods and barrel export | 3f6ad8e | gateway.ts, index.ts, shared/index.ts |

## What Was Built

### Task 1: Infrastructure Modules

**`circuit-breaker.ts`** — In-memory circuit breaker per provider family:
- `FAILURE_THRESHOLD = 3`, `COOLDOWN_MS = 60_000`, `WINDOW_MS = 120_000`
- `isOpen()` transitions from OPEN to HALF_OPEN after cooldown elapses
- `recordSuccess()` resets circuit to CLOSED; `recordFailure()` opens circuit at threshold
- `reset()` clears all state for test isolation

**`diversity.ts`** — Cross-model holdout enforcement:
- `enforceDiversity(holdoutModel, implementerModel)` throws `DiversityViolationError` if same family
- `filterDiverseModels(chain, excludeFamily)` filters failover chain for holdout stage

**`failover.ts`** — Retry + failover orchestration:
- `classifyError()` maps API errors to `rate_limit | server_error | auth_error | timeout | other`
- `shouldRetry()` allows retry for retriable error kinds only
- `executeWithFailover()`: filters by diversity if holdout stage, checks circuit breaker per model, retries once with 1s backoff on retriable errors, calls `onFailover` callback, throws `GatewayExhaustedError` when all models exhausted

### Task 2: LLMGateway Class

**`gateway.ts`** — Main LLMGateway class:
- 4 public async methods: `streamText`, `generateText`, `generateObject`, `streamObject`
- All delegate to `executeWithFailover` with `maxRetries: 0` on AI SDK calls
- `STAGE_PREAMBLES` injected as system prompt prefix per stage
- `resolveModelChain()` merges per-project overrides onto config defaults
- `buildSystemPrompt()` prepends stage preamble to caller's system string
- Diversity check on `holdout` stage before calling executeWithFailover
- `recordUsageAsync()` fire-and-forget with dual-write: `llmUsage` table + `gateway_call_completed` event
- `recordFailoverEventAsync()` fire-and-forget writes `gateway_failover` event

**`index.ts`** (updated) — Added exports for: `LLMGateway`, `CircuitBreaker`, `enforceDiversity`, `filterDiverseModels`, `executeWithFailover`

**`packages/shared/src/index.ts`** (updated) — Added exports for `appendEvent`, `deriveProjectState`, `replayFromSnapshot`, `upsertSnapshot`, `applyEvent`, `initialProjectState` from event-store module.

## Deviations from Plan

### Auto-added Missing Critical Functionality

**1. [Rule 2 - Missing Export] Added event-store functions to @cauldron/shared barrel**
- **Found during:** Task 2
- **Issue:** `appendEvent` was not exported from `@cauldron/shared`'s root index.ts; gateway.ts needed it
- **Fix:** Added event-store helper exports to `packages/shared/src/index.ts`
- **Files modified:** `packages/shared/src/index.ts`
- **Commit:** 3f6ad8e

### Auto-fixed Issues

**1. [Rule 1 - Bug] AI SDK v6 `maxTokens` → `maxOutputTokens`**
- **Found during:** Task 2 typecheck
- **Issue:** Vercel AI SDK v6 renamed `maxTokens` to `maxOutputTokens` in `CallSettings`
- **Fix:** Used `maxOutputTokens: options.maxTokens` in all SDK calls
- **Commit:** 3f6ad8e

**2. [Rule 1 - Bug] AI SDK v6 Prompt discriminated union**
- **Found during:** Task 2 typecheck
- **Issue:** AI SDK v6 requires either `messages` or `prompt`, never both — they are mutually exclusive in the `Prompt` type
- **Fix:** Added explicit branching in each method: `options.messages?.length > 0 ? { messages } : { prompt }`
- **Commit:** 3f6ad8e

**3. [Rule 1 - Bug] TypeScript TS4053 — Output type cannot be named**
- **Found during:** Task 2 typecheck
- **Issue:** AI SDK exports `output as Output` as a value namespace, making it unusable as an external-facing return type annotation
- **Fix:** Annotated `streamText`, `generateText`, `streamObject` return types as `Promise<any>` with eslint-disable comments
- **Commit:** 3f6ad8e

## Known Stubs

None. All data flows are wired. Usage recording writes to real DB tables and event store. The gateway is not called by any higher-level code yet (that's Phase 3+).

## Self-Check: PASSED

All files created and commits verified:
- FOUND: packages/engine/src/gateway/circuit-breaker.ts
- FOUND: packages/engine/src/gateway/diversity.ts
- FOUND: packages/engine/src/gateway/failover.ts
- FOUND: packages/engine/src/gateway/gateway.ts
- FOUND: commit fd420f9 (Task 1)
- FOUND: commit 3f6ad8e (Task 2)
