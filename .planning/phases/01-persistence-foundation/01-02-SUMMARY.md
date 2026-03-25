---
phase: 01-persistence-foundation
plan: 02
subsystem: database
tags: [drizzle-orm, postgresql, drizzle-kit, postgres-js, schema, migrations]

# Dependency graph
requires:
  - phase: 01-persistence-foundation/01-01
    provides: Turborepo monorepo scaffold, packages/shared package stub, Docker Compose dev environment

provides:
  - Complete Drizzle schema for all 7 Cauldron tables with proper enums and foreign keys
  - packages/shared/src/db/schema/* — canonical TypeScript type source for all downstream phases
  - Initial migration SQL (0000_mixed_blue_shield.sql) ready to apply against PostgreSQL
  - DB client (drizzle() + postgres.js) and migration runner script
  - TypeScript types inferred from schema exported from @cauldron/shared

affects:
  - 02-interview-pipeline
  - 03-seed-crystallization
  - 04-holdout-vault
  - 05-dag-scheduler
  - 06-agent-execution

# Tech tracking
tech-stack:
  added:
    - drizzle-orm 0.45.1 (schema definition, query builder, postgres-js adapter)
    - drizzle-kit 0.31.10 (migration generation via drizzle-kit generate)
    - postgres 3.4.8 (postgres.js driver)
    - dotenv 16.4.0 (DATABASE_URL loading)
    - "@types/node" (Node.js type definitions for process.env)
  patterns:
    - Drizzle pgTable + pgEnum as single source of truth for TypeScript types (no codegen)
    - $inferSelect / $inferInsert for zero-overhead type derivation
    - .js extensions on all relative imports (required by Node16 moduleResolution)
    - Append-only table design: events table has no updatedAt column by design
    - seeds table has no updatedAt column — immutability enforced at application level

key-files:
  created:
    - packages/shared/src/db/schema/project.ts — projects table (uuid PK, name, description, timestamps)
    - packages/shared/src/db/schema/seed.ts — seeds table with structured D-01 columns, parent_id for D-03 lineage, no updatedAt
    - packages/shared/src/db/schema/bead.ts — beads + bead_edges tables with beadStatusEnum and beadEdgeTypeEnum
    - packages/shared/src/db/schema/event.ts — append-only events table with eventTypeEnum, no updatedAt
    - packages/shared/src/db/schema/holdout.ts — holdout_vault table with AES-256-GCM fields per D-04
    - packages/shared/src/db/schema/snapshot.ts — project_snapshots table per D-07
    - packages/shared/src/db/schema/index.ts — re-exports all tables and enums
    - packages/shared/src/types/index.ts — re-exports all inferred types
    - packages/shared/src/db/client.ts — drizzle() + postgres.js DB client with DbClient type
    - packages/shared/src/db/migrate.ts — migration runner for pnpm db:migrate
    - packages/shared/drizzle.config.ts — Drizzle Kit config (dialect postgresql, schema/index.ts)
    - packages/shared/src/db/migrations/0000_mixed_blue_shield.sql — initial migration SQL
  modified:
    - packages/shared/src/index.ts — now exports schema, types, and db client
    - packages/shared/tsconfig.json — added types:["node"] for process.env access
    - packages/shared/package.json — added @types/node devDependency

key-decisions:
  - "Node16 moduleResolution requires explicit .js extensions on all relative TypeScript imports"
  - "seeds table has no updatedAt — immutability at column-level signals the invariant to future developers"
  - "events table has no updatedAt — append-only invariant enforced at schema level (D-05)"
  - "client.ts included in Task 1 commit because index.ts export required it for typecheck to pass"
  - "drizzle.config.ts uses process.env['DATABASE_URL'] (bracket notation) to avoid TypeScript strict mode issues"

patterns-established:
  - "Pattern 1: All schema files in packages/shared/src/db/schema/ — no schema definitions in api or engine packages"
  - "Pattern 2: Drizzle types exported via typeof table.$inferSelect — no separate type files needed per table"
  - "Pattern 3: .js extensions on all relative imports throughout packages/shared (Node16 ESM requirement)"
  - "Pattern 4: pnpm db:generate uses DATABASE_URL env var prefix — works without a running database"

requirements-completed: [INFR-02, INFR-05]

# Metrics
duration: 3min
completed: 2026-03-25
---

# Phase 01 Plan 02: Drizzle Schema + Migration Infrastructure Summary

**7-table Drizzle schema with enums, FKs, seed immutability, DAG edge types, and append-only event log — initial migration SQL generated from TypeScript definitions**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-25T22:13:01Z
- **Completed:** 2026-03-25T22:15:38Z
- **Tasks:** 2 of 2
- **Files modified:** 14

## Accomplishments

- Defined all 7 tables (projects, seeds, beads, bead_edges, events, holdout_vault, project_snapshots) with correct column types, enums, and FK constraints
- Enforced core invariants at schema level: no updatedAt on events or seeds, parent_id on seeds for lineage traversal
- Generated initial migration SQL (0000_mixed_blue_shield.sql) cleanly without needing a running database
- Exported all TypeScript types from @cauldron/shared via Drizzle $inferSelect/$inferInsert — zero codegen step

## Task Commits

Each task was committed atomically:

1. **Task 1: Define complete Drizzle schema with all 7 tables** - `b35c13c` (feat)
2. **Task 2: Configure Drizzle Kit and create migration infrastructure** - `3a07049` (feat)

## Files Created/Modified

- `packages/shared/src/db/schema/project.ts` — projects table
- `packages/shared/src/db/schema/seed.ts` — seeds with D-01 structured columns, D-03 parent_id, no updatedAt
- `packages/shared/src/db/schema/bead.ts` — beads + bead_edges with all 4 edge types and 5 bead statuses
- `packages/shared/src/db/schema/event.ts` — append-only events with 11 milestone event types, no updatedAt
- `packages/shared/src/db/schema/holdout.ts` — holdout_vault with ciphertext, encryptedDek, iv, authTag
- `packages/shared/src/db/schema/snapshot.ts` — project_snapshots with state JSONB and lastEventSequence
- `packages/shared/src/db/schema/index.ts` — barrel re-export
- `packages/shared/src/types/index.ts` — type re-exports
- `packages/shared/src/db/client.ts` — drizzle() + postgres() DB client
- `packages/shared/src/db/migrate.ts` — migration runner script
- `packages/shared/drizzle.config.ts` — Drizzle Kit configuration
- `packages/shared/src/db/migrations/0000_mixed_blue_shield.sql` — initial migration
- `packages/shared/src/index.ts` — updated package entry with schema + types + db exports
- `packages/shared/tsconfig.json` — added types:["node"]

## Decisions Made

- Node16 moduleResolution requires `.js` extensions on all relative imports — applied across all new files
- `client.ts` created during Task 1 (not Task 2) because `src/index.ts` references it and typecheck ran at end of Task 1
- Used bracket notation `process.env['DATABASE_URL']` in drizzle.config.ts to satisfy TypeScript strict mode

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing .js extensions on all relative imports**
- **Found during:** Task 1 (first typecheck run)
- **Issue:** Node16 moduleResolution requires explicit `.js` extensions on relative imports. All relative imports in schema files were missing extensions.
- **Fix:** Added `.js` suffix to all relative import paths across schema files, index.ts, and types/index.ts
- **Files modified:** seed.ts, bead.ts, holdout.ts, snapshot.ts, schema/index.ts, types/index.ts, src/index.ts
- **Verification:** `pnpm --filter @cauldron/shared typecheck` exits 0
- **Committed in:** b35c13c (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added @types/node for process.env**
- **Found during:** Task 1 (typecheck — `Cannot find name 'process'`)
- **Issue:** packages/shared tsconfig didn't include Node.js type definitions, so `process.env` in client.ts failed typecheck
- **Fix:** `pnpm --filter @cauldron/shared add -D @types/node` and added `"types": ["node"]` to packages/shared/tsconfig.json
- **Files modified:** packages/shared/package.json, packages/shared/tsconfig.json
- **Verification:** `pnpm --filter @cauldron/shared typecheck` exits 0
- **Committed in:** b35c13c (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes required for TypeScript compilation correctness. No scope creep.

## Issues Encountered

None beyond the two auto-fixed items above.

## User Setup Required

None - no external service configuration required for schema definition and migration generation. Running migrations requires `DATABASE_URL` to point at a live PostgreSQL instance (Docker Compose from Plan 01 provides this).

## Next Phase Readiness

- Complete schema and TypeScript types ready for Plan 01-03 (seed script, integration tests)
- All subsequent phases can import table types directly from @cauldron/shared
- `pnpm --filter @cauldron/shared db:migrate` will apply 0000_mixed_blue_shield.sql once Docker Compose postgres is running
- Drizzle Kit generates incremental migrations automatically as schema evolves

---
*Phase: 01-persistence-foundation*
*Completed: 2026-03-25*

## Self-Check: PASSED

All 10 key files verified present. Both task commits (b35c13c, 3a07049) confirmed in git log.
