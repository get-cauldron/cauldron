---
phase: 23-fk-cascade-strategy
plan: 01
subsystem: database
tags: [postgresql, drizzle, migrations, foreign-keys, cascade, set-null]

# Dependency graph
requires:
  - phase: 22-operator-controls-end-to-end-validation
    provides: "Migration 0016 and all prior schema state (asset_jobs table)"
provides:
  - "Migration 0017: all FK constraints changed from NO ACTION to CASCADE (structural) or SET NULL (audit)"
  - "Drizzle schema files in sync with migration — db:generate produces empty diff"
  - "seeds.parentId self-referencing FK with SET NULL (evolution lineage preserved)"
  - "events.projectId and llm_usage.projectId made nullable with SET NULL FKs"
  - "truncateAll updated to include asset_jobs"
affects: [integration-tests, data-cleanup, project-deletion, evolution-lineage]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-crafted Drizzle migration for FK behavior changes (db:generate cannot generate DROP+ADD CONSTRAINT pairs)"
    - "Drizzle self-referencing FK uses AnyPgColumn type annotation to avoid TypeScript circular inference"
    - "Audit columns made nullable before SET NULL FK constraint is added (PostgreSQL requirement)"
    - "0017_snapshot.json represents schema state after hand-crafted migration; db:generate confirms no drift"

key-files:
  created:
    - packages/shared/src/db/migrations/0017_fk_cascade_strategy.sql
    - packages/shared/src/db/migrations/meta/0017_snapshot.json
  modified:
    - packages/shared/src/db/schema/seed.ts
    - packages/shared/src/db/schema/bead.ts
    - packages/shared/src/db/schema/event.ts
    - packages/shared/src/db/schema/llm-usage.ts
    - packages/shared/src/db/schema/holdout.ts
    - packages/shared/src/db/schema/interview.ts
    - packages/shared/src/db/schema/snapshot.ts
    - packages/shared/src/db/schema/asset-job.ts
    - packages/shared/src/db/__tests__/setup.ts
    - packages/shared/src/db/event-store.ts
    - packages/shared/src/db/migrations/meta/_journal.json

key-decisions:
  - "CASCADE for structural tables (seeds, beads, bead_edges, holdout_vault, interviews, project_snapshots, asset_jobs) — rows have no value without parent project"
  - "SET NULL for audit tables (events, llm_usage) — cost history and event logs survive project deletion for reporting"
  - "llm_usage.bead_id and llm_usage.seed_id also use SET NULL — cascade deletes beads/seeds would block without this change"
  - "seeds.parentId self-reference uses SET NULL — child seeds become root seeds, evolution lineage preserved"
  - "events.projectId was missing FK entirely — phase 23 adds it for the first time (no DROP needed)"
  - "Hand-crafted migration instead of db:generate — Drizzle cannot generate DROP+ADD CONSTRAINT pairs for FK behavior changes"

patterns-established:
  - "Self-referencing Drizzle FK: use .references((): AnyPgColumn => table.id, { onDelete: 'set null' }) to avoid TS circular inference"
  - "After hand-crafted migration: copy the generated 0018 snapshot to 0017_snapshot.json, delete 0018 files, remove 0018 from journal"

requirements-completed: [DATA-05]

# Metrics
duration: 25min
completed: 2026-04-01
---

# Phase 23 Plan 01: FK Cascade Strategy Summary

**PostgreSQL FK cascade strategy applied across all 10 tables: structural tables CASCADE, audit tables SET NULL, with one hand-crafted migration (0017) and all Drizzle schema files synchronized.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-01T00:00:00Z
- **Completed:** 2026-04-01T00:25:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Migration 0017 written with 2 DROP NOT NULL, 11 DROP CONSTRAINT, 8 CASCADE, 5 SET NULL statements
- All 8 schema files updated with correct onDelete options matching the hand-crafted migration
- `pnpm db:generate` produces no new migration (schema perfectly in sync with 0017)
- `pnpm typecheck` passes across all 7 packages with two deviation fixes

## Task Commits

1. **Task 1: Write hand-crafted FK cascade migration** - `f4140ad` (chore)
2. **Task 2: Update all Drizzle schema files to match migration** - `3b7400a` (feat)

## Files Created/Modified

- `packages/shared/src/db/migrations/0017_fk_cascade_strategy.sql` - Hand-crafted migration for all FK cascade strategy changes
- `packages/shared/src/db/migrations/meta/0017_snapshot.json` - Drizzle schema snapshot representing state after migration 0017
- `packages/shared/src/db/migrations/meta/_journal.json` - Added 0017 entry, removed spurious 0018 entry
- `packages/shared/src/db/schema/seed.ts` - cascade on projectId, set null self-ref on parentId with AnyPgColumn
- `packages/shared/src/db/schema/bead.ts` - cascade on seedId, fromBeadId, toBeadId
- `packages/shared/src/db/schema/event.ts` - import projects, make projectId nullable with set null FK
- `packages/shared/src/db/schema/llm-usage.ts` - make projectId nullable, add set null to beadId and seedId
- `packages/shared/src/db/schema/holdout.ts` - cascade on seedId
- `packages/shared/src/db/schema/interview.ts` - cascade on projectId
- `packages/shared/src/db/schema/snapshot.ts` - cascade on projectId
- `packages/shared/src/db/schema/asset-job.ts` - cascade on projectId
- `packages/shared/src/db/__tests__/setup.ts` - add asset_jobs to truncateAll list
- `packages/shared/src/db/event-store.ts` - non-null assertion on event.projectId (always provided at insert time)

## Decisions Made

- Used `AnyPgColumn` type annotation for seeds.parentId self-reference to avoid TypeScript circular inference error
- Added `!` non-null assertion in event-store.ts appendEvent — projectId is always provided at insert time; null only after project hard-delete via SET NULL FK
- Hand-crafted migration (not db:generate) because Drizzle cannot generate DROP+ADD CONSTRAINT pairs for FK behavior changes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript circular inference on seeds.parentId self-reference**
- **Found during:** Task 2 (schema file updates)
- **Issue:** `() => seeds.id` caused TS7022 "seeds implicitly has type 'any'" circular inference error
- **Fix:** Added `AnyPgColumn` import and typed the callback: `.references((): AnyPgColumn => seeds.id, { onDelete: 'set null' })`
- **Files modified:** `packages/shared/src/db/schema/seed.ts`
- **Verification:** `pnpm typecheck` passes across all 7 packages
- **Committed in:** 3b7400a (Task 2 commit)

**2. [Rule 1 - Bug] Fixed TypeScript type error in event-store.ts after events.projectId became nullable**
- **Found during:** Task 2 (typecheck run)
- **Issue:** `eq(schema.events.projectId, event.projectId)` — `event.projectId` inferred as `string | null | undefined` after nullable schema change, but `eq()` requires `string | SQLWrapper`
- **Fix:** Added non-null assertion (`event.projectId!`) with comment explaining projectId is always provided at insert time
- **Files modified:** `packages/shared/src/db/event-store.ts`
- **Verification:** `pnpm typecheck` passes
- **Committed in:** 3b7400a (Task 2 commit)

**3. [Rule 3 - Blocking] Handled Drizzle snapshot drift after db:generate produced 0018**
- **Found during:** Task 2 (db:generate verification)
- **Issue:** `pnpm db:generate` produced a new migration 0018 containing the same changes as hand-crafted 0017, because Drizzle's internal snapshot (0016_snapshot.json) didn't reflect the hand-crafted migration
- **Fix:** Copied the 0018_snapshot.json to 0017_snapshot.json, deleted 0018 SQL and snapshot files, removed 0018 from journal
- **Files modified:** `meta/_journal.json`, `meta/0017_snapshot.json` (created)
- **Verification:** Second `pnpm db:generate` run: "No schema changes, nothing to migrate"
- **Committed in:** 3b7400a (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs, 1 Rule 3 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required. Migration 0017 will run on next `pnpm db:migrate`.

## Next Phase Readiness

- Migration 0017 is ready to apply against the production DB via `pnpm db:migrate`
- Integration tests for DATA-05 (fk-cascade.integration.test.ts) are Wave 0 gaps — not in this plan's scope but needed for full requirement verification
- All downstream phases can rely on CASCADE behavior for project deletion and SET NULL preservation for audit tables

---
*Phase: 23-fk-cascade-strategy*
*Completed: 2026-04-01*

## Self-Check: PASSED

- [x] `packages/shared/src/db/migrations/0017_fk_cascade_strategy.sql` - FOUND
- [x] `packages/shared/src/db/migrations/meta/0017_snapshot.json` - FOUND
- [x] `packages/shared/src/db/schema/seed.ts` - FOUND
- [x] `packages/shared/src/db/schema/bead.ts` - FOUND
- [x] `packages/shared/src/db/schema/event.ts` - FOUND
- [x] `packages/shared/src/db/schema/llm-usage.ts` - FOUND
- [x] commit f4140ad - FOUND
- [x] commit 3b7400a - FOUND
