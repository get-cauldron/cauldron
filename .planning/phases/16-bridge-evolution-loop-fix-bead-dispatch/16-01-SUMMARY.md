---
phase: 16-bridge-evolution-loop-fix-bead-dispatch
plan: 01
subsystem: engine
tags: [inngest, evolution, holdout, bead-dispatch, event-sourcing]

# Dependency graph
requires:
  - phase: 15-wire-holdout-generation-fix-cli-run
    provides: holdout generation and CLI run fixes
  - phase: 07-evolutionary-loop
    provides: evolutionCycleHandler listening for evolution_started Inngest event
  - phase: 05-dag-decomposition-scheduler
    provides: beadDispatchHandler with claim-bead step
provides:
  - convergenceHandler emits both DB appendEvent and inngest.send for evolution_started on holdout failure
  - beadDispatchHandler emits bead_claimed event after successful claim for live DAG active status
affects: [evolution-loop, web-dag-visualization, sse-streaming]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-emit pattern: DB appendEvent (audit trail) + inngest.send (event trigger) inside same step.run block for retry idempotency"
    - "inngest.send() called directly (not step.sendEvent()) inside step.run to bridge DB-only audit trail to Inngest trigger channel"

key-files:
  created: []
  modified:
    - packages/engine/src/holdout/events.ts
    - packages/engine/src/holdout/__tests__/events.test.ts
    - packages/engine/src/decomposition/events.ts
    - packages/engine/src/decomposition/__tests__/events.test.ts

key-decisions:
  - "inngest.send() called directly inside step.run block (not step.sendEvent()) — step.sendEvent() requires Inngest context and would change the step parameter type; inngest.send() is callable anywhere and wrapped in step.run for idempotency"
  - "emit-claimed step placed between claim-bead and emit-dispatched — ensures bead_claimed is only emitted after successful claim, before dispatch event, maintaining event ordering"

patterns-established:
  - "Gap bridge pattern: when DB-only event emission does not reach an Inngest trigger, add inngest.send() inside the same step.run block alongside appendEvent()"

requirements-completed: [HOLD-07, HOLD-08, EVOL-01, EVOL-02, EVOL-03, EVOL-04, EVOL-05, EVOL-06, EVOL-07, EVOL-08, EVOL-09, EVOL-10, EVOL-11, EVOL-12, DAG-05, EXEC-03, WEB-03]

# Metrics
duration: 7min
completed: 2026-03-27
---

# Phase 16 Plan 01: Bridge Evolution Loop + Fix Bead Dispatch Summary

**Dual-emit evolution trigger: convergenceHandler now sends inngest.send({ name: 'evolution_started' }) alongside appendEvent, bridging the DB-only audit trail to the Inngest FSM trigger channel; beadDispatchHandler emits bead_claimed after successful claim for live DAG active status.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-27T21:40:00Z
- **Completed:** 2026-03-27T21:48:19Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Bridged Gap 1 (evolution trigger): `convergenceHandler` in `holdout/events.ts` now calls `inngest.send({ name: 'evolution_started' })` inside the existing `step.run('emit-failure-event')` block — the evolution FSM (`handleEvolutionStarted`) now receives the trigger it listens for
- Added Gap 3 fix (bead_claimed): `beadDispatchHandler` in `decomposition/events.ts` emits `bead_claimed` via `appendEvent` after a successful bead claim, enabling the web DAG to show beads transitioning to active status via SSE
- 4 new tests (2 per fix) verify both the positive (emit) and negative (no emit) paths with TDD discipline

## Task Commits

Each task was committed atomically:

1. **Task 1: Bridge evolution trigger — add inngest.send() to convergenceHandler** - `e572f9b` (feat)
2. **Task 2: Emit bead_claimed event after successful bead claim** - `f05fbe6` (feat)

## Files Created/Modified
- `packages/engine/src/holdout/events.ts` - Added `inngest.send({ name: 'evolution_started', data: { seedId, projectId, codeSummary, failureReport } })` inside `emit-failure-event` step.run block
- `packages/engine/src/holdout/__tests__/events.test.ts` - Added Test 9 (send fires on failure with correct data) and Test 10 (send NOT called on pass); updated `runHandler` to spy on `inngest.send`
- `packages/engine/src/decomposition/events.ts` - Added `emit-claimed` step.run between `claim-bead` and `emit-dispatched` steps with `type: 'bead_claimed'` appendEvent
- `packages/engine/src/decomposition/__tests__/events.test.ts` - Added Test 9 (bead_claimed emitted with beadId + agentId) and Test 10 (NOT emitted on failed claim)

## Decisions Made
- `inngest.send()` called directly (not `step.sendEvent()`) inside `step.run` — `step.sendEvent()` is a durable Inngest primitive requiring the step parameter type to include `sendEvent`, while `inngest.send()` is fire-and-forget callable anywhere; wrapping in `step.run` gives retry idempotency
- `codeSummary` included in `inngest.send` data payload — evolution FSM (`evolutionCycleHandler`) requires `codeSummary` in its `event.data` shape per type signature

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Tests initially ran against main repo packages (node_modules missing from worktree) — resolved by running `pnpm install` in worktree root

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Evolution loop trigger gap is now bridged — holdout failure → `inngest.send` → `handleEvolutionStarted` FSM chain is complete
- Bead active status now trackable via SSE through `bead_claimed` events in the event store
- Ready for Phase 16-02 if additional bridge gaps remain

---
*Phase: 16-bridge-evolution-loop-fix-bead-dispatch*
*Completed: 2026-03-27*
