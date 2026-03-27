---
phase: 16-bridge-evolution-loop-fix-bead-dispatch
plan: "02"
subsystem: web
tags: [bead-dispatch, sse, inngest, trpc, auth]
dependency_graph:
  requires: []
  provides: [per-bead-dispatch-with-beadId, sse-query-param-auth]
  affects: [execution-router, pipeline-trigger, sse-route, useSSE-hook]
tech_stack:
  added: []
  patterns: [per-bead-inngest-dispatch, EventSource-query-param-auth, URLSearchParams-token]
key_files:
  created: []
  modified:
    - packages/web/src/trpc/routers/execution.ts
    - packages/web/src/inngest/pipeline-trigger.ts
    - packages/web/src/app/api/events/[projectId]/route.ts
    - packages/web/src/hooks/useSSE.ts
    - .env.example
decisions:
  - "triggerExecution calls findReadyBeads then dispatches one bead.dispatch_requested per ready bead with BeadDispatchPayload (beadId, seedId, projectId, moleculeId)"
  - "pipelineTriggerFunction uses step.run find-ready-beads + per-bead step.sendEvent with dispatch-bead-{id} deduplication key"
  - "SSE auth gate extended: url = new URL(request.url) moved before auth gate so searchParams.get('token') is available"
  - "useSSE builds URLSearchParams combining lastEventId and token before constructing EventSource URL"
metrics:
  duration: 7min
  completed_date: "2026-03-27T21:47:34Z"
  tasks_completed: 2
  files_modified: 5
---

# Phase 16 Plan 02: Fix Bead Dispatch Payloads and SSE Auth Summary

Fix bead dispatch payloads in web tRPC/Inngest and add SSE query-param auth fallback.

## Tasks Completed

### Task 1: Fix triggerExecution and pipelineTriggerFunction (commit 9b283fe)

Both web dispatch paths were sending `bead.dispatch_requested` without `beadId`, causing `beadDispatchHandler` to receive incomplete payloads and fail silently.

**execution.ts:** Added `findReadyBeads` to the import from `@get-cauldron/engine`. Replaced the single-event `engineInngest.send()` call with `findReadyBeads(ctx.db, input.seedId)` followed by a loop dispatching one event per bead with full `BeadDispatchPayload` (beadId, seedId, projectId, moleculeId). Return message now reports count of dispatched beads.

**pipeline-trigger.ts:** Added `findReadyBeads` import from `@get-cauldron/engine`. Replaced the single `step.sendEvent('dispatch-bead-execution', ...)` with `step.run('find-ready-beads', ...)` + a loop using `step.sendEvent('dispatch-bead-${bead.id}', ...)` per bead. The unique step name per bead provides Inngest deduplication. Return value now includes `beadsDispatched` count.

### Task 2: SSE query-param auth fallback (commit e175140)

Browser `EventSource` cannot send custom headers, so when `CAULDRON_API_KEY` is set the SSE connection silently returned 401.

**route.ts:** Moved `const url = new URL(request.url)` to before the auth gate so `url.searchParams.get('token')` is available. Auth gate now falls back to the query param when no `Authorization` header is present.

**useSSE.ts:** Replaced the simple `lastEventId` ternary with a `URLSearchParams` builder that sets both `lastEventId` (when > 0) and `token` (when `NEXT_PUBLIC_CAULDRON_API_KEY` is set).

**.env.example:** Added `CAULDRON_API_KEY=` and `NEXT_PUBLIC_CAULDRON_API_KEY=` with explanatory comment after `INNGEST_DEV=1`.

## Verification

- `pnpm -F @get-cauldron/web typecheck` passes (0 errors)
- `pnpm -F @get-cauldron/web test` passes (31/31 tests)

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None — both fixes fully wire real data paths. No placeholders or TODO markers introduced.

## Self-Check: PASSED

Files exist:
- packages/web/src/trpc/routers/execution.ts — FOUND
- packages/web/src/inngest/pipeline-trigger.ts — FOUND
- packages/web/src/app/api/events/[projectId]/route.ts — FOUND
- packages/web/src/hooks/useSSE.ts — FOUND
- .env.example — FOUND

Commits exist:
- 9b283fe — FOUND (Task 1: bead dispatch)
- e175140 — FOUND (Task 2: SSE auth)
