---
phase: 25-process-reliability-transactions
plan: "01"
subsystem: engine/execution, web/interview
tags: [timeout, kill, process-management, holdout, transaction, reliability]
dependency_graph:
  requires: []
  provides: [CONC-03, CONC-04]
  affects: [engine/execution/timeout-supervisor, engine/execution/agent-runner, web/trpc/interview]
tech_stack:
  added: []
  patterns: [two-phase-kill, drizzle-transaction, tdd]
key_files:
  created:
    - packages/engine/src/execution/__tests__/timeout-supervisor.test.ts (new kill-target tests)
  modified:
    - packages/engine/src/execution/timeout-supervisor.ts
    - packages/engine/src/execution/agent-runner.ts
    - packages/web/src/trpc/routers/interview.ts
decisions:
  - "Use tx as unknown as DbClient double-cast because PgTransaction lacks $client property that the DbClient Proxy type requires"
  - "setKillTarget subscribes to proc.once('exit') rather than listening continuously to avoid memory leaks on long-running processes"
  - "Holdout failure reverts interview to reviewing (not gathering) since the summary is still valid — user just retries crystallization"
metrics:
  duration: ~20min
  completed: "2026-04-02T02:52:00Z"
  tasks_completed: 2
  files_changed: 3
---

# Phase 25 Plan 01: Process Reliability — Timeout Kill & Holdout Rollback Summary

**One-liner:** Enforced SIGTERM→SIGKILL two-phase agent kill via TimeoutSupervisor.setKillTarget() and Drizzle transaction rollback when holdout generation fails after crystallization.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | TimeoutSupervisor kill target + AgentRunner wiring (CONC-03) | ba289d2 | timeout-supervisor.ts, agent-runner.ts, timeout-supervisor.test.ts |
| 2 | Holdout failure rollback in approveSummary (CONC-04) | b28b7b7 | interview.ts |

## What Was Built

### Task 1: Two-Phase Kill on Hard Timeout (CONC-03)

**TimeoutSupervisor changes:**
- Added `killTarget: ChildProcess | null` and `killGraceTimer: ReturnType<typeof setTimeout> | null` fields
- Added `setKillTarget(proc: ChildProcess): void` — stores process reference, clears old grace timer, subscribes to `proc.once('exit')` to cancel SIGKILL if process exits cleanly
- Modified hard timer body: after callback, sends SIGTERM then sets 5000ms grace timer for SIGKILL
- Updated `stop()` to clear `killGraceTimer` and null `killTarget` preventing stale SIGKILL

**AgentRunner changes:**
- Updated `execPromise()` with optional `onProcess?: (proc: ChildProcess) => void` callback — captures the ChildProcess synchronously before the Promise resolves
- Added optional `supervisor?: TimeoutSupervisor` constructor parameter
- `runWithTddLoop()` calls `this.supervisor?.start()` at entry and wraps body in try/finally calling `this.supervisor?.stop()`
- `runVerification()` passes `onProcess` callback to `execPromise` that calls `this.supervisor?.setKillTarget(proc)`

**Tests:** 6 new kill-target tests added to timeout-supervisor.test.ts suite (17 total, all pass)

### Task 2: Holdout Failure Rollback (CONC-04)

**interview.ts approveSummary mutation:**
- Removed inner try/catch that swallowed holdout errors with `console.error`
- Wrapped `crystallizeSeed` + `generateHoldoutScenarios` + `createVault` in `ctx.db.transaction()`
- Transaction auto-rolls back the seed row if holdout generation fails
- Outer catch reverts interview phase from 'approved' back to 'reviewing' so user can retry
- Throws `TRPCError({ code: 'INTERNAL_SERVER_ERROR' })` instead of silently returning seedId
- Used `tx as unknown as DbClient` double-cast because `PgTransaction` lacks `$client` that the Proxy-based `DbClient` type requires

## Deviations from Plan

None - plan executed exactly as written. The `tx as unknown as DbClient` cast was anticipated by the plan (Option A note: "If TypeScript rejects it, add unknown intermediary").

## Known Stubs

None.

## Pre-existing Issues (Deferred, Out of Scope)

- `inngest` package not installed in engine package — causes build/typecheck failures in events.ts files across asset, decomposition, evolution, holdout, and decomposition/pipeline modules. Pre-dates this plan. Documented in deferred-items.md.

## Self-Check: PASSED

- packages/engine/src/execution/timeout-supervisor.ts — EXISTS, contains setKillTarget, SIGTERM, SIGKILL, killGraceTimer
- packages/engine/src/execution/agent-runner.ts — EXISTS, contains onProcess, supervisor
- packages/engine/src/execution/__tests__/timeout-supervisor.test.ts — EXISTS, contains setKillTarget tests (17 passing)
- packages/web/src/trpc/routers/interview.ts — EXISTS, contains INTERNAL_SERVER_ERROR, transaction
- Commits ba289d2 and b28b7b7 — VERIFIED in git log
