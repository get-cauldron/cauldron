---
phase: 07-evolutionary-loop
plan: "04"
subsystem: evolution
tags: [evolution, fsm, inngest, orchestration, barrel-exports, integration]
dependency_graph:
  requires:
    - "07-01: evaluator.ts (evaluateGoalAttainment), mutator.ts (mutateSeed, mutateSeedFromProposal), types.ts"
    - "07-02: convergence.ts (checkConvergence, checkStagnation), budget.ts (checkLineageBudget)"
    - "07-03: lateral-thinking.ts (runLateralThinking)"
    - "Phase 04: holdout/events.ts (inngest instance, handleEvolutionConverged)"
    - "Phase 05: decomposition/events.ts (bead.dispatch_requested event shape)"
  provides:
    - "evolution/events.ts: evolutionCycleHandler (durable 8-state FSM), handleEvolutionStarted (Inngest function), configureEvolutionDeps"
    - "evolution/index.ts: barrel re-exports all 8 evolution submodules"
    - "engine/index.ts: evolution module now accessible via @cauldron/engine"
  affects:
    - "Any caller of @cauldron/engine that imports evolution types or functions"
    - "Inngest server: evolution/run-cycle function registered on evolution_started"
tech_stack:
  added: []
  patterns:
    - "Module-level deps with configureEvolutionDeps() — same pattern as holdout/events.ts and decomposition/events.ts"
    - "evolutionCycleHandler extracted for testability — tests call directly with fake step object"
    - "try/catch BudgetExceededError wrapping step.run budget-check for pre-cycle halt"
    - "step.sendEvent delegation to evolution_converged — avoids duplicating holdout unseal logic (Pitfall 3)"
    - "Spread conditional previousSeedId for ac_only tier dispatch: ...(tier === 'ac_only' ? { previousSeedId } : {})"
key_files:
  created:
    - packages/engine/src/evolution/events.ts
    - packages/engine/src/evolution/index.ts
    - packages/engine/src/evolution/__tests__/fsm.test.ts
  modified:
    - packages/engine/src/index.ts
decisions:
  - "BudgetExceededError caught outside step.run — budget-check step itself throws, try/catch wraps step.run call to intercept"
  - "step.sendEvent delegation to evolution_converged for ALL terminal states — Pitfall 3 avoided (no duplicated holdout unseal)"
  - "Lateral stagnation path always dispatches tier=full with no previousSeedId — lateral thinking is always a complete rethink"
  - "Conditional spread for previousSeedId: ac_only passes it (bead reuse), full omits it (clean slate per D-08)"
  - "checkConvergence called with currentGeneration from seed.generation cast — matches convergence.ts actual signature"
metrics:
  duration: "8min"
  completed: "2026-03-27"
  tasks_completed: 2
  files_changed: 4
---

# Phase 7 Plan 4: Evolution FSM Integration Summary

**Evolution FSM Inngest function wires evaluator, convergence detector, mutator, lateral thinking, and budget into a single durable 8-state cycle handler, completing the autonomous evolutionary loop.**

## What Was Built

**Evolution FSM** (`evolution/events.ts`):

- `configureEvolutionDeps({ db, gateway, budgetLimitCents? })`: module-level deps pattern, mirrors holdout/events.ts
- `evolutionCycleHandler`: extracted for testability, called directly by Inngest wrapper and tests with fake step
- `handleEvolutionStarted`: Inngest function wrapper listening on `evolution_started` (id: `evolution/run-cycle`)

**Full 8-state FSM per D-21:**

1. **Budget pre-check** (pre-cycle): `checkLineageBudget` before any evaluation. `BudgetExceededError` → emit `evolution_halted` + send `evolution_converged` → `{ status: 'halted', reason: 'budget_exceeded' }`
2. **load-seed** (evaluating state): fetch seed from DB by seedId
3. **evaluate-goal-attainment** (evaluating state): `evaluateGoalAttainment` with diversity enforcement, produces `GoalAttainmentResult` with tier
4. **check-goal-met** (converged terminal): score >= 0.95 → emit `evolution_goal_met` + delegate to `evolution_converged` → `{ status: 'converged', reason: 'goal_met' }`
5. **check-convergence** (scoring state): `checkConvergence` with all 5 signals. Halt → emit `evolution_halted` + delegate → `{ status: 'halted', signal: signalType }`
6. **fetch-lineage + check-stagnation** (evolving/lateral_thinking): `getSeedLineage` + `checkStagnation`
   - **Stagnation path**: emit `evolution_lateral_thinking` → `runLateralThinking` → null? → emit `evolution_escalated` + delegate → `{ status: 'halted', reason: 'escalated' }`. Non-null → `mutateSeedFromProposal` → dispatch with `tier='full'`
7. **generate-evolved-seed** (evolving state, normal path): `mutateSeed` with goal result and tier
8. **dispatch-decomposition** (decomposing state): `step.sendEvent` `bead.dispatch_requested` with `tier` + conditional `previousSeedId` per D-08

**Barrel exports** (`evolution/index.ts`): Re-exports all 8 evolution submodules — types, evaluator, convergence, mutator, lateral-thinking, budget, events, embeddings.

**Engine index** (`engine/src/index.ts`): Added `export * from './evolution/index.js'` so all evolution functionality is accessible via `@cauldron/engine`.

## Test Results

7 FSM integration tests pass (all scenarios from plan spec):
1. Goal met (score=0.96) → converged, evolution_goal_met emitted, evolution_converged sent
2. Convergence halt (hard_cap) → halted, evolution_halted emitted
3. Normal evolution full tier → mutateSeed called, no previousSeedId in dispatch
4. Normal evolution ac_only tier → mutateSeed called, previousSeedId passed per D-08
5. Stagnation + lateral success → mutateSeedFromProposal called (not mutateSeed), tier=full dispatched
6. Stagnation + lateral failure → halted/escalated, evolution_escalated emitted
7. Budget exceeded → halted/budget_exceeded, evolution_halted emitted

All 76 evolution unit tests pass (all 7 test files). `pnpm -r typecheck` and `pnpm -r build` pass.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written. The one implementation detail worth noting: `checkConvergence` in `convergence.ts` takes `currentGeneration` as a parameter (not derived from seedId alone), so the handler reads `seed.generation` and passes it. This matches the actual convergence.ts implementation from Plan 02.

## Known Stubs

None. All exports are fully implemented and wired.

## Self-Check: PASSED

Files created:
- `packages/engine/src/evolution/events.ts` — FOUND
- `packages/engine/src/evolution/index.ts` — FOUND
- `packages/engine/src/evolution/__tests__/fsm.test.ts` — FOUND

Files modified:
- `packages/engine/src/index.ts` — FOUND (contains `export * from './evolution/index.js'`)

Commits:
- c945fdf — feat(07-04): Evolution FSM Inngest function with 8-state cycle orchestration (Task 1)
- 524d0db — feat(07-04): barrel exports for evolution module and engine index wiring (Task 2)
