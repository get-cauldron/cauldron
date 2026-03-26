---
phase: 04-holdout-vault
plan: "03"
subsystem: holdout-vault
tags: [holdout, encryption, inngest, evaluation, evolution]
dependency_graph:
  requires: [04-02]
  provides: [holdout-unseal, holdout-evaluator, inngest-convergence-handler]
  affects: [phase-07-evo-loop]
tech_stack:
  added: []
  patterns:
    - Inngest v4 createFunction with merged triggers config object (not separate 2nd-arg trigger)
    - InngestFunction<any> type annotation to avoid TS2883 non-portable inferred type errors
    - Extracted convergenceHandler() for unit testability without Inngest runtime
    - Fake step.run() in tests: immediately calls callback, no Inngest harness needed
    - storeEvalResults/unsealVault extend existing vault.ts following assertValidTransition pattern
key_files:
  created:
    - packages/engine/src/holdout/evaluator.ts
    - packages/engine/src/holdout/__tests__/evaluator.test.ts
    - packages/engine/src/holdout/__tests__/events.test.ts
    - packages/engine/src/holdout/events.ts
  modified:
    - packages/engine/src/holdout/vault.ts
    - packages/engine/src/holdout/index.ts
decisions:
  - "Inngest v4 createFunction API: triggers belong in the first argument object (not second). createFunction({ id, triggers: [{ event }] }, handler)"
  - "convergenceHandler() extracted from Inngest wrapper for testability — tests call it directly with a fake step object; Inngest wrapper delegates to it"
  - "InngestFunction<any,any,any,any> explicit type annotation required to avoid TS2883 non-portable inferred type errors from deep Inngest generics"
  - "evaluationModel set to 'evaluation-stage' string — Phase 6 will wire in actual resolved model ID from gateway response"
metrics:
  duration: 5min
  completed: "2026-03-26"
  tasks: 2
  files: 6
---

# Phase 4 Plan 3: Holdout Evaluator, Unseal Protocol, and Convergence Handler Summary

Completes the holdout vault lifecycle by implementing unsealing (HOLD-06), LLM-based evaluation (HOLD-07), and failure-triggered re-evolution (HOLD-08). The Inngest event handler wires these together: on evolution_converged, unseal the vault, evaluate scenarios, and if any fail, emit evolution_started with failure context for Phase 7.

## What Was Built

### Task 1: Unseal vault and LLM holdout evaluator

**`unsealVault()` in `vault.ts`:** Reads a sealed vault row, calls `unsealPayload()` from the crypto module, parses the JSON to `HoldoutScenario[]`, transitions vault status to `unsealed`, sets `unsealedAt`, and emits `holdouts_unsealed` event. Throws on any non-`sealed` status (enforced by `assertValidTransition`).

**`storeEvalResults()` in `vault.ts`:** Reads unsealed vault, verifies status is `unsealed`, updates with `results` JSONB, `evaluatedAt`, and transitions to `evaluated`.

**`evaluator.ts`:**
- `EVALUATION_SYSTEM_PROMPT`: instructs the LLM to evaluate each Given/When/Then scenario against code, requiring evidence for any pass verdict
- `EvalResultSchema`: Zod schema for structured LLM output (`scenarioResults[]` with `scenarioId`, `pass`, `reasoning`, `evidence`)
- `evaluateHoldouts()`: builds a prompt combining scenario JSON + code summary, calls `gateway.generateObject` with `stage: 'evaluation'`, computes overall `passed = all scenarios pass`, calls `buildFailureReport()` if any fail
- `buildFailureReport()`: filters to failed scenarios, joins with scenario metadata (title, category), returns `HoldoutFailureReport` with `triggeredBy: 'holdout_failure'`

### Task 2: Inngest convergence event handler

**`events.ts`:**
- `inngest` client with `id: 'cauldron-engine'`
- `configureVaultDeps({ db, gateway })` factory — Phase 6 will call this at startup
- `convergenceHandler()` — extracted business logic with 4 `step.run()` durable steps:
  1. `unseal-vault`: calls `unsealVault()`
  2. `evaluate-holdouts`: calls `evaluateHoldouts()`
  3. `store-eval-results`: calls `storeEvalResults()`
  4. `emit-failure-event` (conditional): if `!evalResult.passed`, calls `appendEvent` with `type: 'evolution_started'` and `triggeredBy: 'holdout_failure'`
- `handleEvolutionConverged` — Inngest function wrapper that delegates to `convergenceHandler()`, listens on `evolution_converged` event

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Inngest v4 createFunction API mismatch**
- **Found during:** Task 2 implementation
- **Issue:** Plan's code example used the v3-style `createFunction(config, trigger, handler)` three-argument signature. Inngest v4 changed to `createFunction({ id, triggers }, handler)` — the trigger moves into the first object.
- **Fix:** Corrected to `inngest.createFunction({ id: '...', triggers: [{ event: 'evolution_converged' }] }, handler)`
- **Files modified:** `packages/engine/src/holdout/events.ts`

**2. [Rule 1 - Bug] TS2883 non-portable inferred type on Inngest function**
- **Found during:** Task 2 TypeScript compilation
- **Issue:** Exporting `handleEvolutionConverged` with its fully inferred Inngest type caused TS2883 errors (10 errors) because the type referenced private internal Inngest types (`DurationLike`, `ExclusiveKeys`, `GroupTools`, etc.)
- **Fix:** Added explicit `InngestFunction<any,any,any,any>` type annotation. This is the established pattern in the codebase (cf. `Promise<any>` on gateway methods for the same class of AI SDK type non-portability)
- **Files modified:** `packages/engine/src/holdout/events.ts`
- **Commit:** `ced66ce`

**3. [Rule 2 - Missing functionality] Handler not testable without Inngest runtime**
- **Found during:** Task 2 test execution
- **Issue:** Plan's test approach used `handleEvolutionConverged.handler` — Inngest functions don't expose a `.handler` property on their public API. Tests would have needed the full Inngest test harness.
- **Fix:** Extracted `convergenceHandler()` as a standalone exported function. The Inngest wrapper delegates to it. Tests call `convergenceHandler()` directly with a fake `step` object. This improves testability and follows the "extract and delegate" pattern used for testable side-effecting code.
- **Files modified:** `packages/engine/src/holdout/events.ts`, `packages/engine/src/holdout/__tests__/events.test.ts`

## Test Results

All 154 engine unit tests pass (no failures):

| Scope | Tests |
|-------|-------|
| evaluator (unsealVault, evaluateHoldouts, buildFailureReport, storeEvalResults) | 10 |
| events (Inngest client, convergenceHandler pipeline) | 8 |
| vault, crypto, generator, key-isolation (prior plans) | 136 |
| **Total** | **154** |

## State Machine Completeness

The holdout vault status machine is now fully implemented:

```
pending_review -> approved -> sealed -> unsealed -> evaluated
```

- `pending_review -> approved`: `approveScenarios()` (Plan 02)
- `approved -> sealed`: `sealVault()` (Plan 02)
- `sealed -> unsealed`: `unsealVault()` (this plan)
- `unsealed -> evaluated`: `storeEvalResults()` (this plan)

## Known Stubs

**`evaluationModel` field in `evaluateHoldouts()`:** Set to the string `'evaluation-stage'` rather than the actual resolved model ID from the gateway response. The gateway's `generateObject` does not currently expose the selected model ID on the response object — Phase 6 will wire in real model tracking when the execution pipeline is connected. The value is stored in `holdout_vault.results` JSONB and the `HoldoutFailureReport`, so downstream consumers (Phase 7 evo loop) will see `'evaluation-stage'` until Phase 6 resolves it.

This stub does not prevent the plan's goal from being achieved — unseal, evaluate, and emit-failure all work correctly. The model tracking is informational only.

## Self-Check

Verified:
- `packages/engine/src/holdout/evaluator.ts` — FOUND
- `packages/engine/src/holdout/events.ts` — FOUND
- `packages/engine/src/holdout/__tests__/evaluator.test.ts` — FOUND
- `packages/engine/src/holdout/__tests__/events.test.ts` — FOUND
- Commit `4c18928` — FOUND
- Commit `ced66ce` — FOUND
