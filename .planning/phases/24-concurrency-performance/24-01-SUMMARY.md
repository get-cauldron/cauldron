---
phase: 24-concurrency-performance
plan: "01"
subsystem: engine
tags: [concurrency, locking, gateway, scheduler, optimistic-locking, usage-recording]
dependency_graph:
  requires: []
  provides: [CONC-01, CONC-02]
  affects: [decomposition/scheduler.ts, gateway/gateway.ts]
tech_stack:
  added: []
  patterns:
    - Version-conditioned optimistic locking on completeBead (mirrors claimBead pattern)
    - Synchronous usage recording with error propagation after failover resolution
key_files:
  created: []
  modified:
    - packages/engine/src/decomposition/scheduler.ts
    - packages/engine/src/decomposition/types.ts
    - packages/engine/src/decomposition/index.ts
    - packages/engine/src/decomposition/__tests__/scheduler.test.ts
    - packages/engine/src/decomposition/__tests__/events.test.ts
    - packages/engine/src/gateway/gateway.ts
    - packages/engine/src/gateway/__tests__/gateway.test.ts
decisions:
  - "Usage recording moved outside executeWithFailover to prevent DB errors from triggering provider re-failover — DB errors are not provider failures"
  - "vi.resetAllMocks() required in completeBead tests instead of vi.clearAllMocks() — Vitest 4 clearAllMocks does clear mockReturnValue implementations"
metrics:
  duration: 17m
  completed: "2026-04-02"
  tasks_completed: 2
  files_modified: 7
---

# Phase 24 Plan 01: Concurrency Gaps — Optimistic Locking & Sync Usage Recording Summary

Closed two concurrency bugs: completeBead now uses version-conditioned WHERE (same pattern as claimBead) returning a CompleteBeadResult on conflict, and all four gateway methods now await usage recording synchronously so checkBudget sees actual spend.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Add version-conditioned optimistic locking to completeBead (CONC-01) | cca9e07, f4910ae | scheduler.ts, types.ts, index.ts, scheduler.test.ts |
| 2 | Make LLM usage recording synchronous (CONC-02) | 1122d45, 3620faf | gateway.ts, gateway.test.ts, events.test.ts |

## What Was Built

### Task 1: Optimistic locking on completeBead (CONC-01)

`completeBead()` in `scheduler.ts` previously updated beads unconditionally — an Inngest retry could silently double-complete a bead. Changed to follow the same pattern as `claimBead()`:

1. SELECT current bead; return `{ success: false }` if not found or already terminal (completed/failed)
2. UPDATE WHERE `version = current.version`; return `{ success: false }` if 0 rows (version conflict)
3. On success: emit event, run D-14 cascade, return `{ success: true, newVersion }`

Added `CompleteBeadResult` type to `types.ts` and exported from `index.ts`. Callers in `events.ts` continue to work unchanged (they ignore the return value, which is backward-compatible).

### Task 2: Synchronous usage recording (CONC-02)

`recordUsageAsync()` in `gateway.ts` was fire-and-forget — a budget check immediately after an LLM call could see stale spend. Changed to:

- Rename to `recordUsage()`, signature `private async recordUsage(...): Promise<void>`
- `await this.writeUsage(...)` with try/catch that LOGS the error AND re-throws it
- For `generateText` and `generateObject`: moved usage recording call OUTSIDE `executeWithFailover` to prevent DB errors from being misclassified as provider failures and triggering unnecessary re-failover
- For `streamText` and `streamObject`: onFinish callbacks changed to `async` and await `recordUsage`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DB errors from writeUsage were triggering provider re-failover**
- **Found during:** Task 2 GREEN phase — error propagation test revealed "All providers exhausted" instead of "DB write failed"
- **Issue:** When `recordUsage` threw inside the `execute` callback of `executeWithFailover`, the failover utility caught it as a provider failure and tried the next model chain entry
- **Fix:** Moved `recordUsage` call outside `executeWithFailover` for `generateText` and `generateObject`. DB errors now propagate cleanly past failover. Capture `chosenModelId` inside execute callback for use after failover returns.
- **Files modified:** `packages/engine/src/gateway/gateway.ts`
- **Commit:** 3620faf

**2. [Rule 1 - Bug] vi.clearAllMocks() cleared mockReturnValue implementations in Vitest 4**
- **Found during:** Task 1 GREEN phase — completeBead tests 11-16 and DAG topology tests failed due to mock state contamination
- **Issue:** In Vitest 4, `vi.clearAllMocks()` unexpectedly clears `mockReturnValue` implementations (not just call history), causing subsequent tests to get undefined from mocked select chains
- **Fix:** Changed `vi.clearAllMocks()` to `vi.resetAllMocks()` in `completeBead` and `findReadyBeads – DAG topology edge cases` describe blocks. Also changed all conditional-edge mockSelect chains from `mockReturnValue` to `mockReturnValueOnce` to avoid cross-test leakage.
- **Files modified:** `packages/engine/src/decomposition/__tests__/scheduler.test.ts`
- **Commit:** f4910ae

**3. [Rule 2 - Missing fix] events.test.ts mock for completeBead returned undefined**
- **Found during:** typecheck after Task 2
- **Issue:** `events.test.ts` had `vi.mocked(schedulerModule.completeBead).mockResolvedValue(undefined)` which was valid when completeBead returned void but is now a type error
- **Fix:** Updated to `mockResolvedValue({ success: true, beadId: BEAD_ID, newVersion: 2 })`
- **Files modified:** `packages/engine/src/decomposition/__tests__/events.test.ts`
- **Commit:** 3620faf

## Test Results

- Engine tests: **471 passed, 0 failed** (38 test files)
- Type check: **clean**
- Build: **all 5 packages successful**

## Self-Check: PASSED

- scheduler.ts: FOUND
- types.ts: FOUND
- gateway.ts: FOUND
- commit f4910ae (CONC-01 GREEN): FOUND
- commit 3620faf (CONC-02 GREEN): FOUND
