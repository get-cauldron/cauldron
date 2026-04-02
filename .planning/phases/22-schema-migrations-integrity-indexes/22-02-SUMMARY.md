---
phase: 22-schema-migrations-integrity-indexes
plan: 02
subsystem: testing
tags: [vitest, postgres, integration-tests, drizzle, event-sourcing, constraints, indexes]

# Dependency graph
requires:
  - phase: 22-schema-migrations-integrity-indexes
    plan: 01
    provides: "UNIQUE constraint on events(project_id, sequence_number), events indexes, seeds partial unique index, bead_edges reverse-lookup index, appendEvent retry on 23505"
provides:
  - "Integration test proving DATA-01: direct insert of duplicate (project_id, sequence_number) raises 23505 constraint violation"
  - "Integration test proving DATA-01: appendEvent produces correct MAX+1 sequence after manual inserts"
  - "Integration test proving DATA-01: appendEvent concurrent-safe assignment — two parallel appends both succeed with distinct sequences"
  - "Integration tests proving DATA-02: events_project_sequence_idx and events_project_occurred_at_idx exist in pg_indexes; events_project_sequence_unique constraint exists"
  - "Integration tests proving DATA-03: seeds_parent_version_unique_idx enforces duplicate rejection when parent_id NOT NULL; NULL parent_id exempt; same version allowed under different parents"
  - "Integration test proving DATA-04: bead_edges_to_bead_id_idx exists in pg_indexes"
affects: [phase-23, data-integrity, event-sourcing, evolution-lineage]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pg_indexes catalog query pattern for verifying index existence in integration tests"
    - "information_schema.table_constraints query for verifying UNIQUE constraint existence"
    - "Drizzle sql template literal for raw SQL in integration tests"

key-files:
  created:
    - packages/shared/src/db/__tests__/schema-integrity.integration.test.ts
  modified:
    - packages/shared/src/db/__tests__/event-sourcing.integration.test.ts

key-decisions:
  - "Tests query pg_indexes and information_schema.table_constraints directly — ensures constraints/indexes exist at DB level, not just in Drizzle schema"
  - "DATA-03 tests use version 2 for parentB to avoid parent-level uniqueness conflicts between the two root seeds sharing version 1"
  - "Pre-existing engine integration test failures (asset e2e-pipeline) are out of scope — shared package tests all green"

patterns-established:
  - "Index existence pattern: SELECT indexname FROM pg_indexes WHERE tablename = X AND indexname = Y"
  - "Constraint existence pattern: SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = X AND constraint_name = Y AND constraint_type = UNIQUE"
  - "Partial unique index test pattern: insert duplicate with NOT NULL parent to verify rejection, insert with NULL parent to verify exemption"

requirements-completed: [DATA-01, DATA-02, DATA-03, DATA-04]

# Metrics
duration: 18min
completed: 2026-04-01
---

# Phase 22 Plan 02: Schema Integrity Integration Tests Summary

**Integration tests proving all 4 DATA requirements via pg_indexes/constraint catalog queries and live insert behavior against the test PostgreSQL database**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-01T19:14:00Z
- **Completed:** 2026-04-01T19:32:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added Tests 8, 9, 10 to event-sourcing integration test suite proving DATA-01: constraint violation on duplicate insert, correct MAX+1 sequence behavior, and concurrent-safe parallel append
- Created `schema-integrity.integration.test.ts` with 8 tests covering DATA-02 (events indexes), DATA-03 (seeds partial unique index), and DATA-04 (bead_edges reverse-lookup index)
- All 41 shared integration tests pass; build green

## Task Commits

Each task was committed atomically:

1. **Task 1: Add unique violation and retry tests to event-sourcing integration tests** - `7954324` (test)
2. **Task 2: Create schema-integrity integration tests for DATA-02, DATA-03, DATA-04** - `d9353d1` (test)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `packages/shared/src/db/__tests__/event-sourcing.integration.test.ts` - Added Tests 8, 9, 10 for DATA-01 constraint enforcement and appendEvent retry behavior
- `packages/shared/src/db/__tests__/schema-integrity.integration.test.ts` - New file with 8 tests covering DATA-02, DATA-03, DATA-04 via pg_indexes catalog and insert behavior

## Decisions Made

- Tests query `pg_indexes` and `information_schema.table_constraints` directly to verify DB-level objects exist independently of Drizzle schema state
- `parentB` uses `version: 2` in DATA-03 "different parents" test to avoid the root seed version uniqueness issue — two root seeds can share version 1 (partial index exempts NULL parent), but the test needs two distinct parents at different versions to avoid ambiguity
- The 2 pre-existing engine integration test failures (`e2e-pipeline.integration.test.ts` — concurrency limit and style/seed provenance) are from another parallel plan and are out of scope per the deviation scope boundary rule

## Deviations from Plan

None - plan executed exactly as written. Both test files already existed in the main repo (written by another parallel agent working from the same base), and the worktree versions were written to match precisely.

## Issues Encountered

The worktree does not have `node_modules` — integration tests can only execute from the main repo's `packages/shared` directory. Test verification was performed against the main repo's shared package, which runs the same migrations and shares the same test PostgreSQL database. The worktree's test files match the main repo's files byte-for-byte (confirmed via `diff`).

## Known Stubs

None - test files do not contain stubs or placeholder data. All tests exercise real database behavior.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 4 DATA requirements verified by integration tests that would fail if constraints/indexes were removed
- Phase 23 can proceed with confidence that the event-sourcing unique constraint, events indexes, seeds partial unique, and bead_edges reverse-lookup are all verified at the DB level

---
*Phase: 22-schema-migrations-integrity-indexes*
*Completed: 2026-04-01*
