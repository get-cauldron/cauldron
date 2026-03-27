---
phase: 11-engine-inngest-serve-evolution-bootstrap
plan: 01
subsystem: api
tags: [inngest, hono, engine, evolution, bootstrap]

# Dependency graph
requires:
  - phase: 10-wire-trpc-mutations-to-engine
    provides: bootstrap.ts with configureSchedulerDeps/configureVaultDeps wired
  - phase: 07-evolutionary-loop
    provides: handleEvolutionStarted, configureEvolutionDeps, evolution FSM
  - phase: 06-parallel-execution-engine
    provides: handleBeadDispatchRequested, handleBeadCompleted, handleMergeRequested
  - phase: 04-holdout-vault
    provides: handleEvolutionConverged, inngest client (cauldron-engine)
provides:
  - Hono app serving all 5 cauldron-engine Inngest functions at /api/inngest
  - createInngestApp() factory function in packages/api/src/inngest-serve.ts
  - configureEvolutionDeps wired in CLI bootstrap
affects:
  - 11-02 (serve endpoint mounting)
  - engine Inngest dev server function discovery

# Tech tracking
tech-stack:
  added: []
  patterns:
    - inngest/hono adapter (not inngest/next) for Hono-based Inngest serve endpoints
    - ENGINE_FUNCTIONS const array exported from serve module for smoke test verification
    - bootstrap.ts configures all 3 dep sets (scheduler, vault, evolution) before server starts

key-files:
  created:
    - packages/api/src/inngest-serve.ts
    - packages/api/src/__tests__/inngest-serve.test.ts
  modified:
    - packages/api/src/bootstrap.ts
    - packages/api/src/__tests__/bootstrap.test.ts

key-decisions:
  - "Use inngest/hono adapter (not inngest/next) per CLAUDE.md Hono mandate for backend service API surface"
  - "Export ENGINE_FUNCTIONS const so smoke test can verify count/identity without module internals inspection"
  - "No ensureInitialized() lazy init needed — bootstrap.ts already configures deps before serve starts"

patterns-established:
  - "inngest as engineInngest alias avoids collision between inngest npm package and exported engine client"
  - "All dep configure calls (configureSchedulerDeps, configureVaultDeps, configureEvolutionDeps) in bootstrap before server"

requirements-completed:
  - DAG-06
  - DAG-07
  - DAG-08
  - DAG-09
  - EXEC-01
  - EXEC-02
  - EXEC-03
  - EXEC-04
  - EXEC-05
  - EXEC-06
  - EXEC-07
  - EXEC-08
  - EXEC-09
  - CODE-01
  - CODE-02
  - CODE-03
  - CODE-04
  - TEST-01
  - TEST-02
  - TEST-03
  - TEST-04
  - TEST-05
  - TEST-06
  - EVOL-01
  - EVOL-02
  - EVOL-03
  - EVOL-04
  - EVOL-05
  - EVOL-06
  - EVOL-07
  - EVOL-08
  - EVOL-09
  - EVOL-10
  - EVOL-11
  - EVOL-12
  - HOLD-05
  - HOLD-06
  - HOLD-07
  - HOLD-08

# Metrics
duration: 5min
completed: 2026-03-27
---

# Phase 11 Plan 01: Engine Inngest Serve + Evolution Bootstrap Summary

**Hono app at /api/inngest serving all 5 cauldron-engine functions (bead dispatch, bead complete, merge, holdout convergence, evolution cycle), with configureEvolutionDeps wired in CLI bootstrap alongside scheduler and vault deps**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-27T17:24:00Z
- **Completed:** 2026-03-27T17:29:33Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created `packages/api/src/inngest-serve.ts`: `createInngestApp()` returns a Hono app using `inngest/hono` adapter serving all 5 engine Inngest functions at `/api/inngest` (GET/POST/PUT)
- Created smoke test confirming `serve()` is called with the `cauldron-engine` client and all 5 function IDs
- Wired `configureEvolutionDeps({ db, gateway })` in `bootstrap.ts` so evolution events don't throw on first dispatch

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Hono-based engine Inngest serve app and smoke test** - `c8825f7` (feat)
2. **Task 2: Wire configureEvolutionDeps in bootstrap.ts and update test** - `a2791be` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified

- `packages/api/src/inngest-serve.ts` - Hono app factory, ENGINE_FUNCTIONS const, mounts at /api/inngest
- `packages/api/src/__tests__/inngest-serve.test.ts` - Smoke test verifying all 5 functions registered
- `packages/api/src/bootstrap.ts` - Added configureEvolutionDeps import and call
- `packages/api/src/__tests__/bootstrap.test.ts` - Added configureEvolutionDeps to mock and assertion

## Decisions Made

- Used `inngest/hono` adapter (not `inngest/next`) per CLAUDE.md mandate that Hono handles standalone backend service API surface
- Used `inngest as engineInngest` alias to avoid collision between the `inngest` npm package identifier and the engine's exported client (consistent with execution.ts router pattern)
- Exported `ENGINE_FUNCTIONS` as a named const so smoke tests can verify the exact count without relying on internal `serve()` argument inspection details
- No `ensureInitialized()` lazy initialization needed — `bootstrap.ts` already configures all deps before the Hono server mounts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Engine serve endpoint is ready; Plan 02 can mount `createInngestApp()` on the CLI Hono server alongside existing routes
- All 3 dep configure calls (scheduler, vault, evolution) now run at bootstrap — no evolution event handler will throw on missing deps

---
*Phase: 11-engine-inngest-serve-evolution-bootstrap*
*Completed: 2026-03-27*
