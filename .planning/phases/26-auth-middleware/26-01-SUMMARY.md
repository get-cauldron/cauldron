---
phase: 26-auth-middleware
plan: 01
subsystem: web/trpc
tags: [auth, security, trpc, middleware, sec-02]
dependency_graph:
  requires: [packages/web/src/trpc/init.ts]
  provides: [authenticated tRPC mutations, SEC-02 enforcement]
  affects: [packages/web/src/trpc/routers/projects.ts, packages/web/src/trpc/routers/interview.ts, packages/web/src/trpc/routers/execution.ts]
tech_stack:
  added: []
  patterns: [tRPC middleware chaining, authenticatedProcedure pattern]
key_files:
  created:
    - packages/web/src/trpc/routers/__tests__/auth-middleware.test.ts
  modified:
    - packages/web/src/trpc/routers/projects.ts
    - packages/web/src/trpc/routers/interview.ts
    - packages/web/src/trpc/routers/execution.ts
decisions:
  - All 14 tRPC mutations require authenticatedProcedure; all queries remain on publicProcedure
  - Auth middleware test uses vi.mock pattern (not appRouter) to avoid pre-existing inngest import issue in Vitest
metrics:
  duration_seconds: 246
  completed_date: "2026-04-02"
  tasks_completed: 2
  files_modified: 4
---

# Phase 26 Plan 01: Auth Middleware Summary

**One-liner:** Wire `authenticatedProcedure` to all 14 tRPC mutation endpoints across 3 routers (SEC-02), with unit tests proving UNAUTHORIZED rejection on mutations and query passthrough.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Switch 14 mutations to authenticatedProcedure | 2fb07be | projects.ts, interview.ts, execution.ts |
| 2 | Add auth-middleware test (TDD) | 9bb2f36 | __tests__/auth-middleware.test.ts |

## What Was Built

### Task 1: Router Updates (3 files)

Updated import lines and switched `publicProcedure` to `authenticatedProcedure` for all mutation endpoints:

- **projects.ts**: `create`, `archive`, `delete`, `updateSettings` (4 mutations)
- **interview.ts**: `startInterview`, `sendAnswer`, `approveSummary`, `rejectSummary`, `approveHoldout`, `rejectHoldout`, `sealHoldouts` (7 mutations)
- **execution.ts**: `triggerDecomposition`, `triggerExecution`, `respondToEscalation` (3 mutations)

All query endpoints (`list`, `byId`, `getTranscript`, `getSummary`, `getHoldouts`, `getDAG`, `getProjectDAG`, `getBeadDetail`, `getPipelineStatus`) remain on `publicProcedure`.

### Task 2: Auth Middleware Tests (1 file)

Created `packages/web/src/trpc/routers/__tests__/auth-middleware.test.ts` with 16 tests:

- 14 mutation rejection tests (one per mutation) — verify `UNAUTHORIZED` when `authenticated: false`
- 2 query passthrough tests — verify `projects.list` and `interview.getTranscript` do not throw `UNAUTHORIZED`

## Verification

- `grep -c 'authenticatedProcedure' projects.ts` → 5 (1 import + 4 mutations)
- `grep -c 'authenticatedProcedure' interview.ts` → 8 (1 import + 7 mutations)
- `grep -c 'authenticatedProcedure' execution.ts` → 4 (1 import + 3 mutations)
- No `authenticatedProcedure` followed by `.query()` — 0 matches
- `pnpm -F @get-cauldron/web test` → 173 tests passing (157 existing + 16 new)
- Web typecheck → 0 web-specific errors (pre-existing engine inngest module errors are out of scope)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test uses individual routers not appRouter**

- **Found during:** Task 2
- **Issue:** The plan showed `appRouter.createCaller()` in the test skeleton, but importing `appRouter` in a Vitest unit test triggers an unresolved `inngest` module error from the engine package (pre-existing build infrastructure issue). The test would fail to load entirely.
- **Fix:** Used `vi.mock('@get-cauldron/engine', ...)` + `vi.mock('@get-cauldron/shared', ...)` pattern consistent with `execution.test.ts`, then imported individual routers (`projectsRouter`, `interviewRouter`, `executionRouter`) and called `.createCaller()` on each. This correctly tests the auth middleware since it runs in the tRPC procedure chain before any router logic.
- **Files modified:** `packages/web/src/trpc/routers/__tests__/auth-middleware.test.ts`
- **Commit:** 9bb2f36

### Pre-existing Build Issue (Out of Scope)

The `pnpm build` (Next.js full build) fails due to engine package `inngest` module not found in asset/events.ts and decomposition/events.ts. This was verified to be pre-existing before our changes via `git stash` test. Logged for tracking — not caused by this plan.

## Known Stubs

None. All 14 mutations are wired to `authenticatedProcedure` with real auth enforcement via `init.ts`.

## Self-Check: PASSED
