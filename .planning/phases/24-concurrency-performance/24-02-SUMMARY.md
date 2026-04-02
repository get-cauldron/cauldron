---
phase: 24-concurrency-performance
plan: 02
subsystem: api
tags: [trpc, postgres, sql, performance, n+1, lateral-join]

# Dependency graph
requires:
  - phase: 24-concurrency-performance
    provides: Phase 24 context and PERF-01 requirement
  - phase: 22-operator-controls
    provides: Composite index on events (project_id, occurred_at)
  - phase: 23-soft-delete-llm-usage-fk
    provides: llm_usage.project_id SET NULL on project delete
provides:
  - Single-query projects list via PostgreSQL LATERAL JOINs eliminating N+1 pattern
  - projects.list returns lastActivity, lastEventType, totalCostCents in O(1) queries
affects: [web, trpc, projects-router, performance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "LATERAL JOIN pattern for per-row subqueries in Drizzle raw SQL (db.execute(sql`...`))"
    - "Drizzle db.execute<T>() generic for typed raw query results"

key-files:
  created: []
  modified:
    - packages/web/src/trpc/routers/projects.ts
    - packages/web/src/trpc/routers/__tests__/projects.wiring.test.ts

key-decisions:
  - "Used PostgreSQL LATERAL JOIN over window functions for lateral subquery approach — cleaner semantics for TOP-1 per group"
  - "Used db.execute(sql`...`) raw SQL via Drizzle instead of query builder for LATERAL JOIN (Drizzle query builder does not support LATERAL)"
  - "Typed raw query result with db.execute<T>() generic to preserve type safety"

patterns-established:
  - "LATERAL JOIN for N+1 elimination: LEFT JOIN LATERAL (SELECT ... FROM table WHERE fk = p.id ORDER BY ... LIMIT 1) alias ON true"

requirements-completed: [PERF-01]

# Metrics
duration: 15min
completed: 2026-04-01
---

# Phase 24 Plan 02: N+1 Query Elimination Summary

**Projects list N+1 eliminated with PostgreSQL LATERAL JOINs — query count drops from 2N+1 to 1 regardless of project count**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-01T20:10:00Z
- **Completed:** 2026-04-01T20:25:00Z
- **Tasks:** 1 (TDD: test + implementation)
- **Files modified:** 2

## Accomplishments

- Replaced the `Promise.all(rows.map(async (project) => ...))` N+1 pattern with a single SQL query
- Used two PostgreSQL LATERAL subqueries: one for latest event (with index seek on `project_id, occurred_at`), one for cost aggregation
- Return shape preserved identically: `lastActivity`, `lastEventType`, `totalCostCents` per project
- Added 6 new wiring tests covering the full behavior spec: events present, no events, no usage, summed usage, archive filter, soft-delete filter
- Typecheck passes; all 62 wiring tests pass

## Task Commits

Each task was committed atomically (TDD: test commit then implementation commit):

1. **Task 1 (RED): Add failing behavior tests for N+1 elimination** - `446df29` (test)
2. **Task 1 (GREEN): Implement single-query LATERAL JOIN** - `de4cc69` (feat)

**Plan metadata:** see final commit

## Files Created/Modified

- `packages/web/src/trpc/routers/projects.ts` — Replaced N+1 Promise.all with single raw SQL query using two LEFT JOIN LATERAL subqueries; removed unused imports
- `packages/web/src/trpc/routers/__tests__/projects.wiring.test.ts` — Added 6 new wiring tests covering lastActivity/lastEventType/totalCostCents behavior spec

## Decisions Made

- Used `db.execute(sql`...`)` raw SQL because Drizzle's query builder has no native LATERAL JOIN support
- Used `db.execute<T>()` generic to preserve compile-time type safety for raw result rows
- Used LATERAL JOIN over window functions: cleaner semantics for TOP-1-per-group (one LATERAL per lateral concern)
- Removed `events` table schema import since it's no longer referenced as a Drizzle table object — events are now referenced inline in the raw SQL string

## Deviations from Plan

None — plan executed exactly as written. The plan's suggested SQL strategy (LATERAL subqueries) was used directly.

## Issues Encountered

- Pre-existing failures in `execution-page.test.tsx` (4 tests) are unrelated to this plan and were not touched. Logged as out-of-scope per deviation boundary rules.

## Known Stubs

None — return shape is fully wired with real data from the database.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- PERF-01 complete: projects list is now O(1) queries
- Pattern established for LATERAL JOIN in other N+1 hotspots if needed
- No blockers for remaining Phase 24 plans

---
*Phase: 24-concurrency-performance*
*Completed: 2026-04-01*
