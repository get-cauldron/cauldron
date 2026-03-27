---
phase: 11-engine-inngest-serve-evolution-bootstrap
plan: 02
subsystem: api
tags: [inngest, trpc, pipeline, bead-dispatch, execution]

# Dependency graph
requires:
  - phase: 10-wire-trpc-mutations-to-engine
    provides: engineInngest import alias already wired in execution.ts
  - phase: 11-engine-inngest-serve-evolution-bootstrap-01
    provides: Inngest serve endpoint + evolution bootstrap configured

provides:
  - pipelineTriggerFunction sends bead.dispatch_requested after trigger-pipeline step
  - pipelineTriggerFunction returns { status: 'no_seed' } when no seed exists
  - triggerExecution mutation dispatches bead.dispatch_requested via engineInngest.send()

affects:
  - engine bead dispatch handler receives events from git push and CLI execute

# Tech tracking
tech-stack:
  added: []
  patterns:
    - step.sendEvent inside Inngest function for cross-client event dispatch
    - engineInngest.send() from tRPC mutation for async Inngest dispatch

key-files:
  created: []
  modified:
    - packages/web/src/inngest/pipeline-trigger.ts
    - packages/web/src/trpc/routers/execution.ts

key-decisions:
  - "pipelineTriggerFunction uses step.sendEvent (not inngest.send) because it runs inside an Inngest function context — step.sendEvent is durable"
  - "triggerExecution uses engineInngest.send() (not step.sendEvent) because tRPC mutations are not inside Inngest function context"
  - "bead.dispatch_requested from pipeline trigger carries only { seedId, projectId } (no beadId) — evolution bootstrap path, not individual bead dispatch"

patterns-established:
  - "Pattern: Cross-client Inngest event dispatch — web client sends events that engine client's functions receive; event routing is by name, not client ID"
  - "Pattern: pipelineTriggerFunction returns distinct status strings ('triggered', 'no_seed', 'superseded') for callers to differentiate outcomes"

requirements-completed:
  - DAG-06
  - EXEC-01
  - EXEC-03
  - EVOL-01
  - EVOL-03
  - EVOL-04

# Metrics
duration: 5min
completed: 2026-03-27
---

# Phase 11 Plan 02: Wire Pipeline Trigger and Execution Trigger to Send Inngest Events

**pipelineTriggerFunction and triggerExecution mutation now send bead.dispatch_requested to engine via Inngest event routing, completing the git-push -> webhook -> pipeline -> bead-dispatch chain**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-27T17:25:00Z
- **Completed:** 2026-03-27T17:29:59Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Wired `pipelineTriggerFunction` to find the latest seed and send `bead.dispatch_requested` after trigger-pipeline step
- Added `{ status: 'no_seed', projectId }` return path when no seed exists, preventing silent success misrepresentation
- Wired `triggerExecution` tRPC mutation to call `engineInngest.send()` with `bead.dispatch_requested` event after audit appendEvent
- TypeScript compiles cleanly in both cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire pipelineTriggerFunction to send bead.dispatch_requested** - `d1d8b09` (feat)
2. **Task 2: Wire triggerExecution mutation to send bead.dispatch_requested** - `c06933e` (feat)

## Files Created/Modified
- `packages/web/src/inngest/pipeline-trigger.ts` - Added find-latest-seed step and step.sendEvent('dispatch-bead-execution') with bead.dispatch_requested; added no_seed return path; removed misleading orchestration comment
- `packages/web/src/trpc/routers/execution.ts` - Added engineInngest.send() call in triggerExecution mutation after audit appendEvent

## Decisions Made
- Used `step.sendEvent` in `pipelineTriggerFunction` because it is running inside an Inngest function — durable, part of the step graph
- Used `engineInngest.send()` in `triggerExecution` tRPC mutation because tRPC mutations are not inside Inngest function context — `.send()` is the correct API for external callers
- The `bead.dispatch_requested` event from pipeline trigger carries only `{ seedId, projectId }` without `beadId` — this matches the evolution bootstrap pattern from `evolution/events.ts`, not individual bead dispatch

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Self-Check

- [x] `packages/web/src/inngest/pipeline-trigger.ts` modified with step.sendEvent and no_seed path
- [x] `packages/web/src/trpc/routers/execution.ts` modified with engineInngest.send()
- [x] TypeScript compiles: `tsc --noEmit` on web package exits clean
- [x] Commits d1d8b09 and c06933e exist

## Self-Check: PASSED

Both files modified as specified. TypeScript compiles cleanly. Both commits confirmed.

## Next Phase Readiness
- Full chain connected: git push -> webhook -> pipelineTriggerFunction -> bead.dispatch_requested -> engine
- CLI execute command -> triggerExecution -> bead.dispatch_requested -> engine
- Ready for end-to-end smoke testing once Inngest serve endpoint is running

---
*Phase: 11-engine-inngest-serve-evolution-bootstrap*
*Completed: 2026-03-27*
