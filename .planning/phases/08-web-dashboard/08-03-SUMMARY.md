---
phase: 08-web-dashboard
plan: 03
subsystem: ui
tags: [sse, server-sent-events, react-hooks, real-time, postgresql, drizzle-orm, nextjs]

# Dependency graph
requires:
  - phase: 08-01
    provides: Next.js scaffold, tRPC plumbing, shared package exports
  - phase: 01-persistence-foundation
    provides: events table schema with sequenceNumber, occurredAt fields

provides:
  - SSE Route Handler at /api/events/{projectId} with Last-Event-ID replay and 2s polling
  - Typed SSEEvent interface and event category arrays (BEAD_STATUS_EVENTS, INTERVIEW_EVENTS, EVOLUTION_EVENTS, ESCALATION_EVENTS)
  - useSSE generic hook with auto-reconnect and Last-Event-ID tracking
  - useBeadStatus hook mapping bead lifecycle events to typed BeadStatus states
  - useEscalation hook with unreadCount and resolveEscalation for escalation management

affects:
  - 08-04 (DAG visualization — consumes useBeadStatus for node status)
  - 08-05 (agent logs — consumes useSSE for log streaming)
  - 08-06 (evolution progress — consumes useSSE/EVOLUTION_EVENTS)

# Tech tracking
tech-stack:
  added:
    - drizzle-orm@^0.45.1 added to packages/web as direct dependency (needed for query operators in Route Handler)
  patterns:
    - SSE Route Handler pattern: ReadableStream with replay-then-poll, lastSeq cursor prevents duplicate delivery
    - useRef for stable callback (onEventRef.current = onEvent) prevents stale closure in SSE listener
    - Event category arrays (as const) for client-side type-safe event filtering

key-files:
  created:
    - packages/web/src/lib/sse-event-types.ts
    - packages/web/src/app/api/events/[projectId]/route.ts
    - packages/web/src/hooks/useSSE.ts
    - packages/web/src/hooks/useBeadStatus.ts
    - packages/web/src/hooks/useEscalation.ts
  modified:
    - packages/web/package.json (added drizzle-orm dependency)
    - packages/web/src/hooks/useEscalation.ts (replaced 08-01 stub with real SSE implementation)

key-decisions:
  - "Polling (2s interval) over LISTEN/NOTIFY for v1 — dedicated PG connection per SSE subscriber not justified yet; polling queries only events > lastSeq so it's efficient"
  - "lastSeq tracked via let in ReadableStream start() closure — advances during replay then continues in poll, preventing duplicate event delivery"
  - "occurredAt mapped to createdAt in SSE payload — consistent interface for consumers regardless of DB column name"
  - "drizzle-orm added as direct web dep — cleaner than importing operators via shared transitive dep resolution"

patterns-established:
  - "SSE Route Handler: replay missed events first, then poll — lastSeq cursor shared between phases"
  - "useRef for stable callback in event handlers — prevents stale closures on re-renders"
  - "Event category arrays as const — enables type-safe includes() checks client-side"

requirements-completed:
  - WEB-04
  - WEB-09

# Metrics
duration: 4min
completed: 2026-03-27
---

# Phase 08 Plan 03: SSE Streaming Infrastructure Summary

**SSE Route Handler at /api/events/{projectId} with replay+polling and three React hooks (useSSE, useBeadStatus, useEscalation) providing the real-time transport layer for all dashboard feature pages.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-27T02:25:21Z
- **Completed:** 2026-03-27T02:29:27Z
- **Tasks:** 2
- **Files modified:** 5 created + 2 modified

## Accomplishments

- SSE Route Handler streams project events in real-time with Last-Event-ID replay for reconnection recovery
- Three client-side hooks ready for consumption by DAG visualization, agent logs, and evolution progress pages
- Replaced 08-01 stub `useEscalation` with full SSE-backed implementation supporting unreadCount and resolution
- TypeScript passes cleanly across the full web package

## Task Commits

Each task was committed atomically:

1. **Task 1: SSE event types and Route Handler** - `f38c61f` (feat)
2. **Task 2: Client-side SSE hooks — useSSE, useBeadStatus, useEscalation** - `b8391d4` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `packages/web/src/lib/sse-event-types.ts` — SSEEvent interface, BEAD_STATUS_EVENTS, INTERVIEW_EVENTS, EVOLUTION_EVENTS, ESCALATION_EVENTS arrays
- `packages/web/src/app/api/events/[projectId]/route.ts` — SSE Route Handler with replay+polling, keepalive, abort cleanup
- `packages/web/src/hooks/useSSE.ts` — Generic hook with EventSource, 'pipeline' event listener, auto-reconnect, Last-Event-ID
- `packages/web/src/hooks/useBeadStatus.ts` — Bead lifecycle event → BeadStatus Map via useSSE
- `packages/web/src/hooks/useEscalation.ts` — Escalation tracking with unreadCount, resolveEscalation, activeEscalation
- `packages/web/package.json` — Added drizzle-orm as direct dependency

## Decisions Made

- Polling (2s) over PostgreSQL LISTEN/NOTIFY for v1 — no dedicated connection pool cost, efficient since queries use sequenceNumber cursor
- `lastSeq` tracked in ReadableStream closure, advanced during replay phase before polling begins — prevents re-sending replayed events
- `occurredAt` mapped to `createdAt` in SSE payload to give consumers a stable interface name
- `drizzle-orm` added as direct dependency to `packages/web` to use `eq`, `gt`, `and`, `asc` operators in the Route Handler

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added drizzle-orm to web package dependencies**
- **Found during:** Task 1 (SSE Route Handler)
- **Issue:** Route Handler imports `eq`, `gt`, `and`, `asc` from `drizzle-orm` but web package had no direct dependency on it
- **Fix:** Ran `pnpm add drizzle-orm@^0.45.1` in packages/web
- **Files modified:** packages/web/package.json, pnpm-lock.yaml
- **Verification:** TypeScript typecheck passes
- **Committed in:** f38c61f (Task 1 commit)

**2. [Rule 1 - Bug] Fixed lastSeq cursor advancement during replay phase**
- **Found during:** Task 1 (code review before commit)
- **Issue:** Initial implementation set `lastSeq = since` but didn't advance it during replay loop — first poll would re-query and re-send events already delivered during replay
- **Fix:** Moved `lastSeq` declaration before replay loop; added `lastSeq = event.sequenceNumber` inside replay loop
- **Files modified:** packages/web/src/app/api/events/[projectId]/route.ts
- **Verification:** Replay events set lastSeq; polling starts from highest replayed sequence
- **Committed in:** f38c61f (Task 1 commit)

**3. [Rule 1 - Bug] Replaced 08-01 stub useEscalation with real implementation**
- **Found during:** Task 2 (hooks creation)
- **Issue:** 08-01 created a stub useEscalation with different interface (EscalationEvent type, string _projectId param) that would conflict with the real implementation
- **Fix:** Overwrote stub with real SSE-backed useEscalation matching plan spec
- **Files modified:** packages/web/src/hooks/useEscalation.ts
- **Verification:** TypeScript passes; useEscalation exports EscalationNotification, resolveEscalation, unreadCount, activeEscalation
- **Committed in:** b8391d4 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** All fixes necessary for correctness and compilation. No scope creep.

## Issues Encountered

- TypeScript incremental cache had a stale error referencing `ProjectListClient` from a parallel agent's work — cleared cache with `rm tsconfig.tsbuildinfo`, typecheck passed on retry.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SSE transport layer complete; all downstream plans can consume useSSE, useBeadStatus, useEscalation
- /api/events/{projectId} endpoint ready — feature pages need DB running to test live streaming
- LISTEN/NOTIFY upgrade path available when SSE subscriber count warrants dedicated PG connections

## Self-Check: PASSED

All created files exist on disk and all task commits found in git history.
- packages/web/src/lib/sse-event-types.ts: FOUND
- packages/web/src/app/api/events/[projectId]/route.ts: FOUND
- packages/web/src/hooks/useSSE.ts: FOUND
- packages/web/src/hooks/useBeadStatus.ts: FOUND
- packages/web/src/hooks/useEscalation.ts: FOUND
- Commit f38c61f: FOUND
- Commit b8391d4: FOUND
