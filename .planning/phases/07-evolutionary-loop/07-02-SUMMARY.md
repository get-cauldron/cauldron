---
phase: 07-evolutionary-loop
plan: 02
subsystem: evolution
tags: [convergence, budget, evolutionary-loop, lineage, stagnation, oscillation]

requires:
  - phase: 07-evolutionary-loop-01
    provides: "types.ts (ConvergenceSignal, GapAnalysis, thresholds), embeddings.ts (computeEmbedding, cosineSimilarity, jaccardSimilarity)"
  - phase: 03-interview-seed-pipeline
    provides: "crystallizer.ts getSeedLineage recursive CTE for lineage traversal"
  - phase: 02-llm-gateway
    provides: "gateway/errors.ts BudgetExceededError, gateway/budget.ts checkBudget pattern"

provides:
  - "convergence.ts: all 5 convergence signal detectors with any-of halt semantics"
  - "budget.ts: checkLineageBudget aggregates llm_usage across full seed ancestry"
  - "checkHardCap: fires at generation >= 30 (D-09)"
  - "checkStagnation: fires when last 3 scores identical (D-09/EVOL-06)"
  - "checkOntologyStability: fires when Jaccard AND cosine >= 0.95 (D-10/EVOL-05)"
  - "checkOscillation: fires when period-2/3/4 cosine >= 0.95 (EVOL-07)"
  - "checkRepetitiveFeedback: fires when >= 70% gap IDs repeat (D-13/EVOL-08)"
  - "checkConvergence: priority-ordered orchestrator (hard_cap > stagnation > ontology > oscillation > repetitive)"

affects:
  - "07-evolutionary-loop-03"
  - "07-evolutionary-loop-04"

tech-stack:
  added: []
  patterns:
    - "TDD: RED→GREEN with controlled mock inputs for deterministic convergence signal testing"
    - "EmbeddingFn injection: computeEmbeddingFn parameter defaults to real implementation, injectable for tests"
    - "Lineage budget: inArray(llmUsage.seedId, lineageIds) aggregates across full ancestry"

key-files:
  created:
    - "packages/engine/src/evolution/convergence.ts"
    - "packages/engine/src/evolution/budget.ts"
    - "packages/engine/src/evolution/__tests__/convergence.test.ts"
    - "packages/engine/src/evolution/__tests__/budget.test.ts"
  modified: []

key-decisions:
  - "EmbeddingFn intersection type cast (ReturnType<typeof vi.fn> & EmbeddingFn) for TypeScript compatibility with Vitest mocks without losing mock method types"
  - "checkOntologyStability short-circuits: Jaccard checked first (no embedding cost), cosine only computed if Jaccard passes"
  - "checkConvergence fetches lineage once and passes it to stagnation, oscillation, repetitive feedback — avoids multiple DB calls"

patterns-established:
  - "Convergence detector: each signal is independently exportable and testable, orchestrator composes them"
  - "Injectable async function parameter pattern for testability: computeEmbeddingFn = computeEmbedding"

requirements-completed: [EVOL-05, EVOL-06, EVOL-07, EVOL-08, EVOL-09, EVOL-12]

duration: 4min
completed: 2026-03-27
---

# Phase 07 Plan 02: Convergence Detectors and Lineage Budget Summary

**Five priority-ordered convergence signal detectors (hard_cap, stagnation, ontology_stability, oscillation, repetitive_feedback) with lineage-scoped budget enforcement via getSeedLineage + inArray aggregation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-27T00:35:53Z
- **Completed:** 2026-03-27T00:39:59Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- All 5 convergence signals implemented with any-of halt semantics per D-09
- Lineage budget check aggregates LLM cost across all ancestor seeds using getSeedLineage + inArray
- 31 tests passing (24 convergence + 7 budget) covering all spec behaviors
- TypeScript strict mode compliant across all packages

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Convergence tests** - `1bea9d1` (test)
2. **Task 1 (GREEN): Convergence detector** - `d35133a` (feat)
3. **Task 2 (RED): Budget tests** - `77252db` (test)
4. **Task 2 (GREEN): Lineage budget + typecheck fix** - `b8c3af0` (feat)

_TDD tasks produced multiple commits: RED test first, then GREEN implementation._

## Files Created/Modified

- `packages/engine/src/evolution/convergence.ts` - All 5 convergence signals + checkConvergence orchestrator
- `packages/engine/src/evolution/budget.ts` - checkLineageBudget with inArray lineage aggregation
- `packages/engine/src/evolution/__tests__/convergence.test.ts` - 24 tests covering all signal behaviors
- `packages/engine/src/evolution/__tests__/budget.test.ts` - 7 tests covering under/at/over limit and multi-seed aggregation

## Decisions Made

- **EmbeddingFn intersection type for Vitest mocks:** `computeEmbedding as unknown as ReturnType<typeof vi.fn> & EmbeddingFn` — TypeScript wouldn't accept Vitest's generic `Mock<Procedure | Constructable>` as `EmbeddingFn | undefined`; intersection type preserves mock methods while satisfying the function signature type.
- **checkOntologyStability short-circuits on Jaccard:** Jaccard (O(n) set operation) checked before cosine (requires embedding API calls). If Jaccard fails, no embeddings computed.
- **checkConvergence fetches lineage once:** Single `getSeedLineage` call, result passed to all remaining checks — avoids N database round trips.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed budget test `toThrow('BudgetExceededError')` matcher**
- **Found during:** Task 2 (budget tests, TDD GREEN)
- **Issue:** Test used `rejects.toThrow('BudgetExceededError')` which matches against error message, not error name. The mock BudgetExceededError message is `"Budget exceeded: 1000 of 1000"` which doesn't contain "BudgetExceededError".
- **Fix:** Changed test to use `.catch()` + `expect(error.name).toBe('BudgetExceededError')`
- **Files modified:** `packages/engine/src/evolution/__tests__/budget.test.ts`
- **Verification:** All 7 budget tests pass
- **Committed in:** b8c3af0 (Task 2 feat commit)

**2. [Rule 1 - Bug] Fixed TypeScript typecheck error: Vitest mock incompatible with EmbeddingFn**
- **Found during:** Overall verification (`pnpm -r typecheck`)
- **Issue:** `ReturnType<typeof vi.fn>` is `Mock<Procedure | Constructable>` which TS doesn't accept as `EmbeddingFn | undefined` parameter
- **Fix:** Added `type EmbeddingFn` in test file and cast mock as `unknown as ReturnType<typeof vi.fn> & EmbeddingFn`
- **Files modified:** `packages/engine/src/evolution/__tests__/convergence.test.ts`
- **Verification:** `pnpm -r typecheck` passes with no errors
- **Committed in:** b8c3af0 (bundled with Task 2 feat commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** Both fixes were minor test correctness issues, no scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `checkConvergence` ready to be called from the evolutionary loop orchestrator (Plan 03)
- `checkLineageBudget` ready to be called before each evolutionary cycle
- All 5 signals can be imported independently or via the orchestrator
- Blocks: none — all Plan 02 dependencies satisfied

## Self-Check: PASSED

- convergence.ts: FOUND
- budget.ts: FOUND
- convergence.test.ts: FOUND
- budget.test.ts: FOUND
- SUMMARY.md: FOUND
- Commits 1bea9d1, d35133a, 77252db, b8c3af0: ALL FOUND

---
*Phase: 07-evolutionary-loop*
*Completed: 2026-03-27*
