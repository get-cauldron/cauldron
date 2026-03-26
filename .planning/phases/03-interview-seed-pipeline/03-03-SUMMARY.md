---
phase: 03-interview-seed-pipeline
plan: "03"
subsystem: interview
tags: [interview, fsm, seed, crystallization, brownfield-detection, immutability, postgres-trigger, recursive-cte, tdd]

requires:
  - phase: 03-01
    provides: DB schema for interviews, seeds, migrations with prevent_seed_mutation trigger
  - phase: 03-02
    provides: scorer.ts, perspectives.ts, ranker.ts, types.ts for FSM integration

provides:
  - InterviewFSM class orchestrating full interview lifecycle (start/resume, answer, crystallize)
  - detectInterviewMode with git rev-list brownfield auto-detection (D-04)
  - synthesizeFromTranscript converting transcript to SeedSummary via LLM generateObject
  - crystallizeSeed with ImmutableSeedError app guard and seed_crystallized event (D-25/D-26)
  - getSeedLineage recursive CTE traversal (D-27, SEED-04)
  - formatScoreBreakdown user-visible dimension breakdown with weakest (D-17)
  - 24 engine unit tests + 11 new integration tests against real Postgres

affects:
  - phase 04 (holdout vault — depends on crystallized seeds)
  - phase 05 (DAG scheduler — depends on seeds existing)
  - phase 06+ (implementation agents receive seeds as input)
  - API/dashboard layers that orchestrate InterviewFSM

tech-stack:
  added: [node:child_process execSync for brownfield detection]
  patterns:
    - TDD red/green for synthesizer and format modules
    - FSM phase transitions with explicit VALID_TRANSITIONS table
    - Parallel Promise.all for scoring + perspectives (D-21)
    - Recursive CTE for seed lineage traversal
    - DB trigger + app-level guard (belt-and-suspenders immutability)
    - vi.mock('@cauldron/shared') pattern for engine unit tests needing DB types

key-files:
  created:
    - packages/engine/src/interview/synthesizer.ts
    - packages/engine/src/interview/crystallizer.ts
    - packages/engine/src/interview/format.ts
    - packages/engine/src/interview/fsm.ts
    - packages/engine/src/interview/__tests__/synthesizer.test.ts
    - packages/engine/src/interview/__tests__/fsm.test.ts
    - packages/shared/src/db/__tests__/interview.integration.test.ts
    - packages/shared/src/db/__tests__/seed-immutability.test.ts
  modified:
    - packages/engine/src/interview/index.ts

key-decisions:
  - "crystallizer.ts getSeedLineage uses result as unknown as Seed[] (no .rows property) — matches existing schema-invariants test pattern"
  - "vi.mock('@cauldron/shared') required in engine unit tests to prevent DATABASE_URL error at import time"
  - "FSM tests use granular per-call mockResolvedValueOnce sequencing since db.where resolves to different types across crystallizeSeed calls"
  - "selectActivePerspectives late-turn (overall >= 0.7) returns 2 perspectives — FSM threshold test uses pre-existing high scores to trigger late-turn path"

patterns-established:
  - "Engine unit tests mock @cauldron/shared at module level with vi.mock to avoid DB connection requirement"
  - "FSM uses assertValidTransition helper before all phase mutations for explicit validation"
  - "Integration tests follow event-sourcing.integration.test.ts pattern: createTestDb, runMigrations in beforeAll, truncateAll in afterEach"

requirements-completed: [INTV-04, INTV-06, INTV-07, SEED-01, SEED-02, SEED-03, SEED-04]

duration: 8min
completed: 2026-03-26
---

# Phase 03 Plan 03: Interview FSM, Synthesizer, Crystallizer, and Integration Tests Summary

**InterviewFSM orchestrating full turn cycle with parallel scoring/perspectives, brownfield git-history detection, LLM synthesizer converting transcripts to immutable crystallized seeds with DB trigger + app guard, and recursive CTE lineage traversal**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-26T01:57:51Z
- **Completed:** 2026-03-26T02:05:52Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- InterviewFSM with all lifecycle methods: startOrResume (D-03/D-04), submitAnswer (D-07/D-21), requestEarlyCrystallization (D-06), generateSummary (D-22), approveAndCrystallize (D-23/INTV-07), pause, abandon
- Brownfield auto-detection via `git rev-list --count HEAD` — returns 'brownfield' if commits > 0, 'greenfield' otherwise (D-04)
- seedSummarySchema (Zod) + SYNTHESIZER_SYSTEM_PROMPT + synthesizeFromTranscript for LLM-driven seed generation (D-22, INTV-06)
- crystallizeSeed with ImmutableSeedError (app-level, D-26), getSeedLineage (recursive CTE, D-27/SEED-04), seed_crystallized event firing
- formatScoreBreakdown with weakestDimension and per-dimension labels (D-17)
- 24 engine unit tests (10 files, 109 total) and 24 shared integration tests (3 files) all passing
- Full typecheck and build green

## Task Commits

1. **Task 1: Synthesizer, crystallizer, score formatter, and synthesizer unit tests** - `2415650` (feat)
2. **Task 2: InterviewFSM with brownfield auto-detection and unit tests** - `825f96e` (feat)
3. **Task 3: Integration tests for interview CRUD, seed crystallization, and immutability trigger** - `9259a5d` (test)

## Files Created/Modified

- `packages/engine/src/interview/synthesizer.ts` - seedSummarySchema, SYNTHESIZER_SYSTEM_PROMPT, synthesizeFromTranscript
- `packages/engine/src/interview/crystallizer.ts` - crystallizeSeed, ImmutableSeedError, getSeedLineage with recursive CTE
- `packages/engine/src/interview/format.ts` - formatScoreBreakdown with D-17 dimension breakdown and weakestDimension
- `packages/engine/src/interview/fsm.ts` - InterviewFSM class, detectInterviewMode, assertValidTransition, VALID_TRANSITIONS
- `packages/engine/src/interview/__tests__/synthesizer.test.ts` - 8 unit tests for synthesizer and format (TDD)
- `packages/engine/src/interview/__tests__/fsm.test.ts` - 24 unit tests for FSM transitions, brownfield detection, and lifecycle
- `packages/shared/src/db/__tests__/interview.integration.test.ts` - 11 integration tests: CRUD, FK, JSONB, lineage CTE
- `packages/shared/src/db/__tests__/seed-immutability.test.ts` - 5 integration tests for prevent_seed_mutation trigger
- `packages/engine/src/interview/index.ts` - Updated to export all new symbols

## Decisions Made

- `getSeedLineage` returns `result as unknown as Seed[]` (not `result.rows`) — drizzle-orm postgres-js execute returns the array directly, matching the pattern in schema-invariants tests
- `vi.mock('@cauldron/shared')` added at the top of `fsm.test.ts` — shared's `client.ts` throws at import time without DATABASE_URL; mock prevents this without altering the module
- FSM threshold constant is `0.8` (clarity >= 0.8 === ambiguity <= 0.2 per D-05) — matches Ouroboros spec exactly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed crystallizer.ts type error: .rows vs direct return**
- **Found during:** Task 1 (after typecheck)
- **Issue:** `db.execute()` in drizzle-orm/postgres-js returns `RowList` directly, not an object with `.rows`. Original plan code used `result.rows` which caused TS2339 error
- **Fix:** Changed to `result as unknown as Seed[]` — matches existing schema-invariants.integration.test.ts pattern
- **Files modified:** packages/engine/src/interview/crystallizer.ts
- **Verification:** `pnpm --filter @cauldron/engine run typecheck` exits 0
- **Committed in:** 2415650 (Task 1 commit)

**2. [Rule 3 - Blocking] Added vi.mock('@cauldron/shared') to fsm.test.ts**
- **Found during:** Task 2 (test execution)
- **Issue:** Importing fsm.ts → @cauldron/shared → client.ts throws 'DATABASE_URL environment variable is required' at import time, blocking all tests
- **Fix:** Added `vi.mock('@cauldron/shared', () => ({ ... }))` at top of fsm.test.ts, matching the pattern from budget.test.ts
- **Files modified:** packages/engine/src/interview/__tests__/fsm.test.ts
- **Verification:** All 24 FSM unit tests pass
- **Committed in:** 825f96e (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both necessary. No scope creep.

## Issues Encountered

- FSM `approveAndCrystallize` test initially used flat mock DB that returned undefined instead of arrays for crystallizer's `select().from().where()` chain — required a more granular mock implementation with per-call counters
- Late-turn (overall >= 0.7) selectActivePerspectives returns only 2 perspectives, not 3 — threshold test initially set up 3 perspective mocks causing `rankCandidates` to receive undefined from gateway

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Interview-to-seed pipeline complete end-to-end: start interview → submit answers → score → generate summary → approve → crystallize immutable seed
- Phase 4 (holdout vault) can begin: crystallized seeds are the input
- Phase 5 (DAG scheduler) can begin in parallel: seeds table and seed_crystallized events are ready
- Both phases are independent of each other per STATE.md decisions
