---
phase: 14-wire-interview-start-fix-seed-crystallization-path
plan: "01"
subsystem: web/trpc/interview
tags: [interview, crystallization, trpc, fsm, event-sourcing]
dependency_graph:
  requires:
    - "@get-cauldron/engine crystallizeSeed"
    - "@get-cauldron/engine ImmutableSeedError"
    - "@get-cauldron/engine InterviewFSM.startOrResume"
  provides:
    - "startInterview tRPC mutation"
    - "approveSummary calls crystallizeSeed (event-sourced path)"
  affects:
    - "packages/web/src/trpc/routers/interview.ts"
    - "packages/web/src/trpc/routers/__tests__/interview-engine.test.ts"
tech_stack:
  added: []
  patterns:
    - "TRPCError CONFLICT wrapping ImmutableSeedError"
    - "InterviewFSM.startOrResume for interview creation"
    - "crystallizeSeed for event-sourced seed creation"
key_files:
  created: []
  modified:
    - "packages/web/src/trpc/routers/interview.ts"
    - "packages/web/src/trpc/routers/__tests__/interview-engine.test.ts"
decisions:
  - "crystallizeSeed() replaces inline DB insert in approveSummary — routes seed creation through event store, DB trigger enforcement, and immutability guard"
  - "ImmutableSeedError caught at tRPC boundary and converted to CONFLICT code — lets web clients distinguish duplicate crystallization from other errors"
metrics:
  duration: "8min"
  completed: "2026-03-27T20:20:01Z"
  tasks: 2
  files: 2
---

# Phase 14 Plan 01: Wire Interview Start and Fix Seed Crystallization Path — Summary

## One-liner

Added `startInterview` tRPC mutation and replaced the inline seed insert in `approveSummary` with `crystallizeSeed()` from the engine, routing crystallization through the event store and immutability guard.

## What Was Built

**Task 1: Add startInterview mutation and fix approveSummary crystallization path**

- Added `startInterview` as the first procedure in the interview router (was 9, now 10 procedures)
- `startInterview` accepts `projectId` and optional `mode`, constructs `InterviewFSM`, and calls `fsm.startOrResume()` — closes the P0 gap where there was no way to create the interview DB row via the web UI
- Replaced the inline `ctx.db.insert(seeds).values(...)` + manual `approved -> crystallized` update in `approveSummary` with a single `crystallizeSeed()` call — this routes seed creation through the engine's event store (`seed_crystallized` event), DB trigger enforcement, and immutability guard (ImmutableSeedError)
- Added `TRPCError({ code: 'CONFLICT' })` wrapping for `ImmutableSeedError` at the tRPC boundary
- Added imports: `crystallizeSeed`, `ImmutableSeedError` from `@get-cauldron/engine`; `TRPCError` from `@trpc/server`

**Task 2: Add tests for startInterview and fixed approveSummary**

- Extended mock: added `mockStartOrResume`, `mockCrystallizeSeed`, expanded `MockInterviewFSM` to include `startOrResume`, added `ImmutableSeedError` mock class, added `update`/`insert` mock chains to `makeCtx`
- `startInterview` tests: FSM constructed with correct deps, `startOrResume` called with `projectId + mode`, returns correct shape, works without mode parameter (2 tests)
- `approveSummary` tests: `crystallizeSeed` called with correct args, `ImmutableSeedError` converts to CONFLICT, `reviewing -> approved` transition fires before crystallization (3 tests)
- All 10 tests pass (5 existing + 5 new)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — both gaps are now fully wired.

## Self-Check: PASSED

- `packages/web/src/trpc/routers/interview.ts` — FOUND
- `packages/web/src/trpc/routers/__tests__/interview-engine.test.ts` — FOUND
- Commit `192cd9b` — FOUND (feat(14-01): add startInterview mutation...)
- Commit `378d06b` — FOUND (test(14-01): add tests for startInterview...)
- TypeScript compile: PASSED (no errors)
- All 10 tests: PASSED
