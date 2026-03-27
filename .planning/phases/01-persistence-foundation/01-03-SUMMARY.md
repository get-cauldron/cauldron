---
phase: 01-persistence-foundation
plan: 03
subsystem: database
tags: [postgres, drizzle, event-sourcing, vitest, integration-tests, docker]

requires:
  - phase: 01-persistence-foundation-plan-02
    provides: "Drizzle schema definitions for events, seeds, beads, bead_edges, holdout_vault, project_snapshots, and migrations"

provides:
  - "Event sourcing module: appendEvent, deriveProjectState, replayFromSnapshot, upsertSnapshot, applyEvent, initialProjectState"
  - "Integration tests for event sourcing and schema invariants against real Docker PostgreSQL (no mocks)"
  - "Dev seed data for CLI Bulk Renamer v1 test case via pnpm db:seed"
  - "Vitest integration test config with maxWorkers:1 for sequential DB execution"
  - "Unique constraint on project_snapshots.project_id enabling onConflictDoUpdate snapshot upsert"

affects: [phase-02-interview, phase-03-seed-management, phase-05-bead-scheduler, phase-06-execution]

tech-stack:
  added: [vitest-integration-config]
  patterns:
    - "Event sourcing: appendEvent never updates, deriveProjectState replays from scratch, replayFromSnapshot replays after snapshot"
    - "Integration test setup: createTestDb + runMigrations in beforeAll, truncateAll in afterEach"
    - "Snapshot upsert pattern via onConflictDoUpdate with unique projectId constraint"
    - "Vitest maxWorkers:1 required when multiple integration test files share a single PostgreSQL instance"

key-files:
  created:
    - packages/shared/src/db/event-store.ts
    - packages/shared/src/db/__tests__/event-sourcing.integration.test.ts
    - packages/shared/src/db/__tests__/schema-invariants.integration.test.ts
    - packages/shared/src/db/__tests__/setup.ts
    - packages/shared/src/db/seed-data.ts
    - packages/shared/src/db/seed.ts
    - packages/shared/vitest.integration.config.ts
    - packages/shared/src/db/migrations/0001_graceful_ultragirl.sql
  modified:
    - packages/shared/src/db/schema/snapshot.ts

key-decisions:
  - "Snapshot upsert requires unique constraint on project_snapshots.project_id — added .unique() to schema and generated migration 0001"
  - "maxWorkers:1 required in vitest integration config — concurrent forks share same Postgres DB, causing FK violations between test files"
  - "replayFromSnapshot fetches earliest snapshot (ORDER BY snapshotAt ASC) — supports history but uses first snapshot as base, not latest"

patterns-established:
  - "createTestDb() + runMigrations(db) in beforeAll; truncateAll(db) in afterEach — standard integration test lifecycle"
  - "TEST_DATABASE_URL env var (port 5433) for test isolation; DATABASE_URL (port 5432) for dev"
  - "appendEvent is the ONLY write path for events — no update/delete functions in event-store module"

requirements-completed: [INFR-04]

duration: 9min
completed: 2026-03-25
---

# Phase 01 Plan 03: Event Sourcing and Schema Invariants Summary

**Event sourcing functions (append, replay, snapshot) with 13 integration tests proving data layer correctness against real Docker PostgreSQL — no mocks**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-25T22:18:02Z
- **Completed:** 2026-03-25T22:27:23Z
- **Tasks:** 2 (TDD)
- **Files modified:** 9

## Accomplishments

- Event store module with append-only event log, full replay, and snapshot-based incremental replay
- 13 integration tests covering event sequencing, state derivation, seed lineage CTE, all 4 bead edge types, ready-bead DAG query, and holdout vault lifecycle
- Dev seed data for CLI Bulk Renamer v1 test case loadable via `pnpm db:seed`

## Task Commits

1. **Task 1: Implement event sourcing module with append, replay, and snapshot** - `25b510e` (feat)
2. **Task 2: Schema invariant tests and dev seed data** - `631dfe5` (feat)

## Files Created/Modified

- `packages/shared/src/db/event-store.ts` - appendEvent, deriveProjectState, replayFromSnapshot, upsertSnapshot, applyEvent, initialProjectState
- `packages/shared/src/db/__tests__/event-sourcing.integration.test.ts` - 7 integration tests for event sourcing
- `packages/shared/src/db/__tests__/schema-invariants.integration.test.ts` - 6 integration tests for schema invariants
- `packages/shared/src/db/__tests__/setup.ts` - createTestDb, runMigrations, truncateAll helpers
- `packages/shared/src/db/seed-data.ts` - seedDevData() for CLI Bulk Renamer example data
- `packages/shared/src/db/seed.ts` - script entry point for pnpm db:seed
- `packages/shared/vitest.integration.config.ts` - Integration test config with maxWorkers:1
- `packages/shared/src/db/migrations/0001_graceful_ultragirl.sql` - unique constraint on project_snapshots.project_id
- `packages/shared/src/db/schema/snapshot.ts` - Added .unique() to projectId column

## Decisions Made

- **Snapshot unique constraint:** `upsertSnapshot` needs `onConflictDoUpdate` which requires a unique target. Added `.unique()` to `projectId` in snapshot schema and generated migration 0001.
- **Vitest maxWorkers:1:** With `pool: 'forks'`, multiple test files ran concurrently sharing the same Postgres instance, causing FK violations when one file's `afterEach` truncated while another file's test was mid-insert. `maxWorkers: 1` forces sequential execution. `poolOptions.forks.singleFork` is the Vitest 3 API and was silently ignored in Vitest 4.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added .unique() to project_snapshots.projectId and generated migration**
- **Found during:** Task 1 (event store implementation)
- **Issue:** Plan's `upsertSnapshot` implementation uses `onConflictDoUpdate` with `target: schema.projectSnapshots.projectId` but the migration had no unique constraint on that column, causing the conflict target to fail
- **Fix:** Added `.unique()` to `projectId` in `snapshot.ts`, ran `pnpm db:generate` to produce migration `0001_graceful_ultragirl.sql`
- **Files modified:** `packages/shared/src/db/schema/snapshot.ts`, `packages/shared/src/db/migrations/0001_graceful_ultragirl.sql`
- **Verification:** Integration tests pass with upsert working correctly
- **Committed in:** `25b510e` (Task 1 commit)

**2. [Rule 1 - Bug] Fixed vitest integration config: replaced deprecated poolOptions with maxWorkers:1**
- **Found during:** Task 2 (schema invariant tests)
- **Issue:** `poolOptions.forks.singleFork` was the Vitest 3 API — silently ignored in Vitest 4. Test files ran concurrently, causing FK violations between test files sharing the same Postgres database
- **Fix:** Replaced `pool: 'forks' + poolOptions.forks.singleFork` with `pool: 'forks' + maxWorkers: 1`
- **Files modified:** `packages/shared/vitest.integration.config.ts`
- **Verification:** All 13 integration tests pass sequentially without FK conflicts
- **Committed in:** `631dfe5` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** Both auto-fixes were required for correctness. No scope creep.

## Issues Encountered

- Docker Desktop was not running at execution start — started it via `open -a Docker` and waited for socket availability at `~/.docker/run/docker.sock`
- Both postgres containers (dev and test) were pulled fresh during execution

## User Setup Required

None - no external service configuration required beyond Docker being running.

## Next Phase Readiness

- Data layer is fully proven: events append-only, state derivable, snapshots upsertable, all schema invariants verified
- Phase 02 (interview engine) can rely on `appendEvent` and `deriveProjectState` from event-store.ts
- Phase 05 (DAG scheduler) can rely on the ready-bead SQL query pattern established in schema-invariants tests
- Run `pnpm --filter @cauldron/shared test:integration` to verify Docker Postgres is up before any subsequent phase
- `TEST_DATABASE_URL` defaults to `postgres://cauldron:cauldron@localhost:5433/cauldron_test` — docker compose up postgres-test required

## Self-Check: PASSED

- FOUND: packages/shared/src/db/event-store.ts
- FOUND: packages/shared/src/db/__tests__/event-sourcing.integration.test.ts
- FOUND: packages/shared/src/db/__tests__/schema-invariants.integration.test.ts
- FOUND: packages/shared/src/db/seed-data.ts
- FOUND: packages/shared/src/db/seed.ts
- FOUND: packages/shared/vitest.integration.config.ts
- FOUND: .planning/phases/01-persistence-foundation/01-03-SUMMARY.md
- FOUND commit: 25b510e (Task 1)
- FOUND commit: 631dfe5 (Task 2)
- FOUND commit: 4b892d2 (docs)
- All 13 integration tests pass against real Docker PostgreSQL

---
*Phase: 01-persistence-foundation*
*Completed: 2026-03-25*
