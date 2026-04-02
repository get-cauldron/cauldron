---
phase: 23-fk-cascade-strategy
plan: 02
subsystem: testing
tags: [postgresql, drizzle, integration-tests, foreign-keys, cascade, set-null, DATA-05]

# Dependency graph
requires:
  - phase: 23-fk-cascade-strategy/23-01
    provides: "Migration 0017: all FK constraints changed to CASCADE/SET NULL"
provides:
  - "16 integration tests proving all DATA-05 cascade and SET NULL behaviors at DB level"
  - "Migration 0018: drops legacy auto-named FK constraints that shadowed cascade behavior"
affects: [ci, data-cleanup, project-deletion, evolution-lineage]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vitest integration test with real DELETE (not TRUNCATE) to exercise FK enforcement"
    - "information_schema.referential_constraints metadata verification for FK delete_rules"
    - "Conditional DO/BEGIN migration blocks for safe DROP IF EXISTS on legacy constraints"

key-files:
  created:
    - packages/shared/src/db/__tests__/fk-cascade.integration.test.ts
    - packages/shared/src/db/migrations/0018_drop_legacy_fk_constraints.sql
    - packages/shared/src/db/migrations/meta/0018_snapshot.json
  modified:
    - packages/shared/src/db/migrations/meta/_journal.json

key-decisions:
  - "Added migration 0018 to drop legacy auto-named constraints (interviews_project_id_fkey, llm_usage_seed_id_fkey) that migration 0017 missed — these were blocking DELETE on projects"
  - "Used conditional DO/BEGIN blocks in 0018 SQL so migration is safe to run on any DB regardless of whether legacy constraints exist"
  - "0018 snapshot is identical to 0017 snapshot — no Drizzle-visible schema changes"

patterns-established:
  - "Real DELETE pattern: use db.delete().where() not TRUNCATE to test FK cascade behavior"
  - "Vitest message in toBe: use expect(value, 'message').toBe() not expect(value).toBe(expected, 'message')"

requirements-completed: [DATA-05]

# Metrics
duration: 7min
completed: 2026-04-02
---

# Phase 23 Plan 02: FK Cascade Integration Tests Summary

**16 integration tests proving all DATA-05 cascade and SET NULL FK behaviors, plus migration 0018 to clean up legacy auto-named constraints that blocked project deletion.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-02T01:44:15Z
- **Completed:** 2026-04-02T01:51:00Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments

- Created `fk-cascade.integration.test.ts` with 4 describe blocks and 16 tests covering all DATA-05 cascade paths
- Verified CASCADE on 8 structural tables: seeds, beads, bead_edges, holdout_vault, interviews, project_snapshots, asset_jobs (all deleted on project deletion)
- Verified SET NULL on 5 audit FKs: events.project_id, llm_usage.project_id, llm_usage.bead_id, llm_usage.seed_id, seeds.parent_id
- Verified all 13 FK constraint delete_rules via information_schema metadata queries
- Added migration 0018 to drop legacy `_fkey` named constraints that migration 0017 missed
- All 57 shared integration tests pass (including 6 test files)

## Task Commits

1. **Task 1: Write FK cascade integration tests** - `810ad2b` (test)

## Files Created/Modified

- `packages/shared/src/db/__tests__/fk-cascade.integration.test.ts` - 341-line integration test file with 4 describe blocks proving all DATA-05 FK behaviors
- `packages/shared/src/db/migrations/0018_drop_legacy_fk_constraints.sql` - Conditional migration to drop legacy auto-named NO ACTION constraints
- `packages/shared/src/db/migrations/meta/0018_snapshot.json` - Drizzle snapshot (identical to 0017 — no schema changes)
- `packages/shared/src/db/migrations/meta/_journal.json` - Added 0018 entry

## Decisions Made

- Added migration 0018 to drop legacy `interviews_project_id_fkey` and `llm_usage_seed_id_fkey` NO ACTION constraints — these were auto-created by early Drizzle initialization and were never dropped by migration 0017, causing project DELETE to fail with FK violations
- Used `DO $$ BEGIN IF EXISTS ... END IF; END $$` pattern so migration is idempotent and safe on any DB

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added migration 0018 to drop legacy auto-named FK constraints**
- **Found during:** Task 1 (running integration tests)
- **Issue:** Two legacy NO ACTION constraints (`interviews_project_id_fkey`, `llm_usage_seed_id_fkey`) existed in the test DB alongside the new CASCADE/SET NULL constraints added by migration 0017. These legacy constraints were auto-named by early Drizzle table creation and were never dropped because 0017 only dropped the properly-named `_projects_id_fk` variants. The NO ACTION constraints blocked `DELETE FROM projects` with FK violation errors.
- **Fix:** Created migration 0018 with conditional `DO/BEGIN/IF EXISTS` DROP statements for both legacy constraints. Added 0018 to the journal and created its snapshot (identical to 0017 — no schema changes visible to Drizzle). Ran migration against test DB.
- **Files modified:** `0018_drop_legacy_fk_constraints.sql`, `meta/0018_snapshot.json`, `meta/_journal.json`
- **Verification:** `pnpm -F @get-cauldron/shared test -- src/__tests__/fk-cascade.integration.test.ts` — all 57 tests pass
- **Committed in:** 810ad2b (Task 1 commit)

**2. [Rule 1 - Bug] Fixed Vitest `toBe` message argument usage**
- **Found during:** Task 1 (typecheck during `pnpm test:integration`)
- **Issue:** `expect(result.length).toBe(1, 'message')` — Vitest's `toBe` only accepts 1 argument; the message goes as the second argument to `expect()` itself
- **Fix:** Changed to `expect(result.length, 'message').toBe(1)`
- **Files modified:** `fk-cascade.integration.test.ts`
- **Verification:** `pnpm test:integration` — shared package build succeeds
- **Committed in:** 810ad2b (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

When running `pnpm test:integration` (all packages in parallel), the engine integration tests occasionally fail due to shared test DB contention (parallel test isolation issue). This is a pre-existing issue unrelated to this plan. Running each package's integration tests sequentially (`pnpm -F @get-cauldron/shared test:integration` then `pnpm -F @get-cauldron/engine test:integration`) shows all tests pass.

## User Setup Required

None - no external service configuration required. Migration 0018 will run on next `pnpm db:migrate` against the production DB.

## Next Phase Readiness

- DATA-05 requirement fully verified by integration tests
- All 13 FK constraint delete_rules confirmed via information_schema metadata queries
- CASCADE and SET NULL behaviors proven with real DELETE operations
- Phase 23 complete — migration 0017 + 0018 applied, tests passing

---
*Phase: 23-fk-cascade-strategy*
*Completed: 2026-04-02*

## Self-Check

- [x] `packages/shared/src/db/__tests__/fk-cascade.integration.test.ts` - FOUND
- [x] `packages/shared/src/db/migrations/0018_drop_legacy_fk_constraints.sql` - FOUND
- [x] `packages/shared/src/db/migrations/meta/0018_snapshot.json` - FOUND
- [x] commit 810ad2b - verified by git rev-parse
