---
phase: 05-dag-decomposition-scheduler
plan: 03
subsystem: database
tags: [drizzle, postgres, inngest, concurrency, dag, scheduler, typescript]

# Dependency graph
requires:
  - phase: 05-02
    provides: decomposeSeed, DecompositionResult, BeadSpec dependency edges (dependsOn, waitsFor, conditionalOn)
  - phase: 05-01
    provides: beads/beadEdges schema with version column, coversCriteria, all 4 edge type enums
  - phase: 04-holdout-vault
    provides: Inngest patterns (extracted handler + thin wrapper, configureVaultDeps pattern, InngestFunction<any,any,any,any> type)
  - phase: 01-persistence-foundation
    provides: appendEvent, DbClient type, test setup utilities (createTestDb, runMigrations, truncateAll)
provides:
  - findReadyBeads: NOT EXISTS SQL query returning unblocked pending beads (CLAUDE.md pattern)
  - claimBead: optimistic concurrency claim via version column (D-16)
  - persistDecomposition: inserts molecules (completed structural beads), child beads (pending), all 4 edge types
  - completeBead: status transition + event emission + D-14 conditional cascade
  - beadDispatchHandler: Inngest handler with fan-in (Promise.all(step.waitForEvent)), conditional skip (D-14), atomic claim
  - beadCompletionHandler: re-dispatch newly ready beads on completion
  - handleBeadDispatchRequested/handleBeadCompleted: Inngest function wrappers with per-project concurrency (D-15)
  - runDecomposition: end-to-end pipeline entry point chaining decompose -> persist -> dispatch (D-12)
  - vitest.integration.config.ts: engine package integration test runner with DATABASE_URL env
  - packages/engine/src/__tests__/setup.ts: DB test utilities for engine integration tests
affects:
  - 06-execution (Phase 6 calls runDecomposition after seed crystallization; beadDispatchHandler Phase 6 adds LLM execution logic)

# Tech tracking
tech-stack:
  added:
    - "postgres@3.4.8 as engine devDependency (for integration tests)"
  patterns:
    - "Drizzle sql`` template for NOT EXISTS subquery with INNER JOIN (CLAUDE.md ready-bead pattern)"
    - "Optimistic concurrency: SELECT version -> UPDATE WHERE version = $expected -> check returning rows"
    - "Inngest fan-in: Promise.all(waitsForEdges.map(edge => step.waitForEvent(...)))"
    - "Integration test segregation: vitest.integration.config.ts + DATABASE_URL env; regular test command excludes .integration.test.ts"
    - "Engine integration test setup: set process.env.DATABASE_URL before @cauldron/shared import to avoid client.ts throw"

key-files:
  created:
    - packages/engine/src/decomposition/scheduler.ts
    - packages/engine/src/decomposition/events.ts
    - packages/engine/src/decomposition/pipeline.ts
    - packages/engine/src/decomposition/__tests__/scheduler.test.ts
    - packages/engine/src/decomposition/__tests__/events.test.ts
    - packages/engine/src/decomposition/__tests__/concurrent-claim.integration.test.ts
    - packages/shared/src/db/__tests__/ready-bead.integration.test.ts
    - packages/engine/src/__tests__/setup.ts
    - packages/engine/vitest.integration.config.ts
  modified:
    - packages/engine/src/decomposition/index.ts
    - packages/engine/vitest.config.ts
    - packages/engine/package.json
    - packages/shared/src/db/migrations/meta/_journal.json

key-decisions:
  - "Engine integration tests use vitest.integration.config.ts with DATABASE_URL env to prevent @cauldron/shared client.ts from throwing at import time"
  - "Integration tests excluded from default 'test' command -- vitest.config.ts exclude pattern; run via test:integration"
  - "bead_edges _journal.json was missing entry for 0005_dag_decomposition migration -- auto-fixed so test DB migrates correctly"
  - "conditional_blocks NOT included in the ready-bead SQL query filter -- conditional skip logic handled at dispatch time in beadDispatchHandler, not at query time"
  - "molecule beads inserted with status=completed (structural containers, never executed)"
  - "Engine test DB setup duplicates shared/src/db/__tests__/setup.ts locally -- cross-package relative imports don't resolve in vitest ESM context"

patterns-established:
  - "Integration test DB setup: process.env.DATABASE_URL must be set BEFORE importing @cauldron/shared (ESM import hoisting)"
  - "Drizzle NOT EXISTS: use sql`` template tag for complex correlated subqueries with JOINs"
  - "Concurrent stress tests: Promise.allSettled for exactly-one-winner verification"

requirements-completed: [DAG-04, DAG-05, DAG-06, DAG-08, DAG-09]

# Metrics
duration: 14min
completed: 2026-03-26
---

# Phase 5 Plan 3: DAG Scheduler Summary

**DAG scheduling runtime: ready-bead query, optimistic concurrent claiming, full decomposition persistence, Inngest fan-in handlers, and runDecomposition pipeline entry point**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-26T14:31:13Z
- **Completed:** 2026-03-26T14:45:30Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments
- Implemented the entire DAG scheduling runtime: findReadyBeads (NOT EXISTS SQL), claimBead (optimistic concurrency), persistDecomposition (all 4 edge types), completeBead (with D-14 conditional cascade)
- Concurrent stress test proves exactly-one-winner: 10 agents race for the same bead, exactly 1 succeeds, version increments once, against real PostgreSQL
- Diamond DAG integration tests prove fan-in semantics: D becomes ready only after BOTH B and C complete (6 test cases covering all edge types)
- Inngest event handlers with fan-in (Promise.all(step.waitForEvent)) and conditional skip (D-14), per-project concurrency limit (D-15)
- runDecomposition chains the full pipeline: decomposeSeed -> persistDecomposition -> findReadyBeads -> inngest.send for each ready bead

## Task Commits

1. **Task 1: Scheduler -- ready-bead query, atomic claiming, bead persistence** - `a12e1df` (feat)
2. **Task 2: Inngest event handlers for bead dispatch and fan-in** - `ff39629` (feat)
3. **Task 3: Orchestration pipeline entry point -- runDecomposition** - `7caad24` (feat)
4. **Chore: exclude integration tests from default test command** - `cc998f0` (chore)

## Files Created/Modified
- `packages/engine/src/decomposition/scheduler.ts` - findReadyBeads, claimBead, persistDecomposition, completeBead
- `packages/engine/src/decomposition/events.ts` - beadDispatchHandler (fan-in), beadCompletionHandler, Inngest wrappers
- `packages/engine/src/decomposition/pipeline.ts` - runDecomposition entry point
- `packages/engine/src/decomposition/__tests__/scheduler.test.ts` - 14 unit tests (mocked DB)
- `packages/engine/src/decomposition/__tests__/events.test.ts` - 8 unit tests (mocked scheduler)
- `packages/engine/src/decomposition/__tests__/concurrent-claim.integration.test.ts` - 3 integration tests (real PostgreSQL)
- `packages/shared/src/db/__tests__/ready-bead.integration.test.ts` - 6 integration tests (diamond DAG)
- `packages/engine/src/__tests__/setup.ts` - DB test utilities for engine integration tests
- `packages/engine/vitest.integration.config.ts` - Integration test runner config with DATABASE_URL env
- `packages/engine/src/decomposition/index.ts` - Added exports for scheduler, events, pipeline
- `packages/engine/vitest.config.ts` - Exclude .integration.test.ts from default test run
- `packages/engine/package.json` - Added postgres devDependency, test:integration script
- `packages/shared/src/db/migrations/meta/_journal.json` - Added missing entry for migration 0005

## Decisions Made
- Integration tests excluded from default test command -- requires live PostgreSQL, would break CI without Docker
- `conditional_blocks` excluded from ready-bead SQL query -- conditional skip is dispatch-time logic in beadDispatchHandler (not a scheduling concern)
- Molecule beads inserted as `status='completed'` -- they're structural containers, not executable tasks
- Engine package test setup duplicates shared/setup.ts locally because cross-package relative imports don't resolve in vitest's ESM context

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] _journal.json missing migration 0005 entry**
- **Found during:** Task 1 (concurrent-claim integration test)
- **Issue:** `packages/shared/src/db/migrations/meta/_journal.json` had no entry for `0005_dag_decomposition.sql` -- drizzle-orm's `migrate()` requires the journal to discover migrations, so the test DB couldn't apply migration 0005 and was missing the `version` column
- **Fix:** Added entry `{ "idx": 5, "tag": "0005_dag_decomposition", "breakpoints": true }` to the journal
- **Files modified:** packages/shared/src/db/migrations/meta/_journal.json
- **Verification:** Integration tests pass against test DB with version column present
- **Committed in:** a12e1df (Task 1 commit)

**2. [Rule 3 - Blocking] Engine package missing postgres devDependency for integration tests**
- **Found during:** Task 1 (concurrent-claim integration test setup)
- **Issue:** Engine package's integration test setup needs `postgres` (the postgres.js driver) to create a test DB client, but it wasn't listed as a dependency
- **Fix:** Added `postgres@^3.4.8` to engine devDependencies via `pnpm --filter @cauldron/engine add postgres -D`
- **Files modified:** packages/engine/package.json, pnpm-lock.yaml
- **Verification:** Integration test setup imports postgres cleanly
- **Committed in:** a12e1df (Task 1 commit)

**3. [Rule 3 - Blocking] @cauldron/shared import triggers DATABASE_URL check at test setup time**
- **Found during:** Task 1 (integration test environment setup)
- **Issue:** ESM import hoisting means `import * as schema from '@cauldron/shared'` causes client.ts to execute before any test code runs, throwing if DATABASE_URL is undefined
- **Fix:** Added `vitest.integration.config.ts` with `env: { DATABASE_URL: ... }` so Vitest injects the env var before module resolution; updated vitest.config.ts to exclude .integration.test.ts files from default run
- **Files modified:** packages/engine/vitest.integration.config.ts (created), packages/engine/vitest.config.ts
- **Verification:** Integration tests run cleanly with `pnpm test:integration`
- **Committed in:** a12e1df + cc998f0

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All fixes necessary for integration tests to run. No scope creep -- fixes are infrastructure issues not covered in the plan.

## Issues Encountered
- Diamond DAG `conditional_blocks` test (Test 5 in ready-bead.integration.test.ts) revealed that the ready-bead SQL query should NOT filter on `conditional_blocks` -- the semantics are: the conditional bead appears "ready" from the query's perspective, but beadDispatchHandler checks the upstream status at dispatch time and skips it if the upstream failed. This is the correct design (matches the plan's intent).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- runDecomposition is importable from `@cauldron/engine` and chains the full decompose -> persist -> dispatch pipeline (D-12)
- Phase 6 (execution) needs to:
  1. Wire `configureSchedulerDeps({ db })` during startup
  2. Add actual LLM execution logic inside beadDispatchHandler (after the claim step)
  3. Call `completeBead(db, beadId, 'completed', projectId, seedId)` when execution finishes
  4. Emit `bead.completed` Inngest event to trigger beadCompletionHandler for fan-out

---
*Phase: 05-dag-decomposition-scheduler*
*Completed: 2026-03-26*

## Self-Check: PASSED

All created files verified present. All 4 commits verified in git log.
