---
phase: 22-schema-migrations-integrity-indexes
plan: 01
subsystem: database
tags: [drizzle, postgres, migrations, indexes, constraints, event-sourcing]

# Dependency graph
requires:
  - phase: 21-local-image-mcp-app-delivery
    provides: "asset_jobs table and event types that needed to be indexed"
provides:
  - "UNIQUE constraint on events(project_id, sequence_number) — DB-enforced append-only ordering"
  - "Composite indexes on events for efficient replay and time-range queries"
  - "Partial unique index on seeds(parent_id, version) WHERE parent_id IS NOT NULL"
  - "Reverse-lookup index on bead_edges(to_bead_id) for DAG traversal"
  - "Migration 0015 — data cleanup dedup before constraints are applied"
  - "Migration 0016 — Drizzle-generated DDL adding all constraints and indexes"
  - "appendEvent retry-on-23505 for concurrent sequence conflicts"
affects: [phase-23, event-sourcing, bead-dispatch, evolution-lineage]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-authored data-only SQL migration (no schema delta) placed before constraint migration"
    - "Drizzle uniqueIndex().where(isNotNull()) for partial unique indexes"
    - "PostgresError code 23505 check via instanceof postgres.PostgresError for retry logic"

key-files:
  created:
    - packages/shared/src/db/migrations/0015_data_cleanup.sql
    - packages/shared/src/db/migrations/0016_small_red_wolf.sql
    - packages/shared/src/db/migrations/meta/0016_snapshot.json
  modified:
    - packages/shared/src/db/schema/event.ts
    - packages/shared/src/db/schema/seed.ts
    - packages/shared/src/db/schema/bead.ts
    - packages/shared/src/db/event-store.ts
    - packages/shared/src/db/migrations/meta/_journal.json

key-decisions:
  - "Data cleanup migration (0015) is hand-authored SQL with no Drizzle snapshot — it deduplicates before constraints land"
  - "Drizzle does not allow identical snapshots in its journal chain, so 0015_snapshot.json was omitted"
  - "appendEvent retry uses duck-typed PostgresError instanceof check (postgres.PostgresError) for correctness and type safety"

patterns-established:
  - "Partial unique index pattern: uniqueIndex().on().where(isNotNull()) for seeds lineage enforcement"
  - "Pre-constraint data cleanup: always migrate data before adding UNIQUE constraints"
  - "Event sequence retry: read MAX then insert with retry on 23505 for concurrent writers"

requirements-completed: [DATA-01, DATA-02, DATA-03, DATA-04]

# Metrics
duration: 25min
completed: 2026-04-01
---

# Phase 22 Plan 01: Schema Migrations Integrity Indexes Summary

**PostgreSQL uniqueness constraints and composite indexes on events, seeds, and bead_edges — with a dedup migration 0015 and Drizzle-generated migration 0016, plus appendEvent 3-retry loop on sequence conflict**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-01T00:00:00Z
- **Completed:** 2026-04-01T00:25:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Created hand-authored data cleanup migration 0015 with DISTINCT ON dedup for events and seeds before constraints are applied
- Added DB-enforced uniqueness: `events_project_sequence_unique` UNIQUE constraint + two composite indexes + partial unique index on seeds + bead_edges reverse-lookup index
- Updated `appendEvent` with a 3-attempt retry loop that catches PostgresError code 23505 (unique violation) and retries with a fresh MAX sequence number

## Task Commits

Each task was committed atomically:

1. **Task 1: Hand-author migration 0015 (data cleanup) and update Drizzle journal** - `1461fb1` (chore)
2. **Task 2: Add schema declarations, generate migration 0016, and update appendEvent with retry** - `23f2331` (feat)

## Files Created/Modified

- `packages/shared/src/db/migrations/0015_data_cleanup.sql` — DISTINCT ON dedup SQL for events and seeds before constraints
- `packages/shared/src/db/migrations/0016_small_red_wolf.sql` — Drizzle-generated DDL: UNIQUE constraint + 4 indexes
- `packages/shared/src/db/migrations/meta/_journal.json` — Updated with entries for 0015 and 0016
- `packages/shared/src/db/migrations/meta/0016_snapshot.json` — Drizzle schema snapshot post-0016
- `packages/shared/src/db/schema/event.ts` — Added unique('events_project_sequence_unique') + 2 indexes
- `packages/shared/src/db/schema/seed.ts` — Added uniqueIndex('seeds_parent_version_unique_idx').where(isNotNull(parentId))
- `packages/shared/src/db/schema/bead.ts` — Added index('bead_edges_to_bead_id_idx') on beadEdges table
- `packages/shared/src/db/event-store.ts` — appendEvent retry loop on postgres.PostgresError code 23505

## Decisions Made

- **Data-only migration without Drizzle snapshot**: Migration 0015 is pure SQL (no DDL), so it has no corresponding schema snapshot in Drizzle's meta. The journal entry exists but `0015_snapshot.json` was omitted because Drizzle rejects identical adjacent snapshots. Migration 0016 carries the full DDL diff.
- **Retry via instanceof postgres.PostgresError**: Used `err instanceof postgres.PostgresError` (via default import) rather than a named `{ PostgresError }` import because the postgres package uses `export =` semantics with a namespace — `postgres.PostgresError` is the correct access pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed duplicate 0015_snapshot.json to fix Drizzle collision error**
- **Found during:** Task 1 (after creating 0015 snapshot as copy of 0014)
- **Issue:** Drizzle rejects identical adjacent snapshots — running `drizzle-kit generate` failed with "collision" error because 0015 and 0014 snapshots had identical content hashes
- **Fix:** Removed `0015_snapshot.json` from the migration meta directory; data-only migrations need no snapshot
- **Files modified:** packages/shared/src/db/migrations/meta/ (0015_snapshot.json removed)
- **Verification:** `drizzle-kit generate` ran successfully producing 0016_small_red_wolf.sql
- **Committed in:** 23f2331 (Task 2 commit)

**2. [Rule 1 - Bug] Used postgres.PostgresError instanceof instead of named import**
- **Found during:** Task 2 (TypeScript compilation check)
- **Issue:** `import { PostgresError } from 'postgres'` is not valid for postgres v3 (`export =` module format); access must be via `import postgres from 'postgres'` then `postgres.PostgresError`
- **Fix:** Used default import with namespace access; created `isUniqueViolation()` helper with `err instanceof postgres.PostgresError`
- **Files modified:** packages/shared/src/db/event-store.ts
- **Verification:** Typecheck passes for event-store.ts with no errors on the modified lines
- **Committed in:** 23f2331 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 × Rule 1 - Bug)
**Impact on plan:** Both auto-fixes required for correct Drizzle migration generation and TypeScript compilation. No scope changes.

## Issues Encountered

- Worktree was behind main branch by 75 commits (missing migrations 0013 and 0014 from v1.1 phases 18-21). Resolved by rebasing onto main before starting work.

## User Setup Required

None - no external service configuration required. Migrations will be applied on next `pnpm db:migrate`.

## Next Phase Readiness

- DB integrity guarantees established: concurrent appendEvent calls are safe with the retry loop
- Migrations 0015 and 0016 ready to run against production DB (run cleanup before constraints)
- Phase 23+ can rely on `events_project_sequence_unique` UNIQUE constraint being enforced at DB level

---
*Phase: 22-schema-migrations-integrity-indexes*
*Completed: 2026-04-01*
