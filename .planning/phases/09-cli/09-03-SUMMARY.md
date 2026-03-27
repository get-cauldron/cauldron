---
phase: 09-cli
plan: "03"
subsystem: cli
tags: [cli, sse, logs, streaming, eventsource]
dependency_graph:
  requires: ["09-01"]
  provides: ["cauldron logs command", "SSE streaming CLI"]
  affects: ["packages/api"]
tech_stack:
  added: []
  patterns: ["eventsource v4 custom fetch wrapper for auth headers", "TDD red-green cycle for CLI command"]
key_files:
  created:
    - packages/api/src/commands/logs.ts
    - packages/api/src/commands/logs.test.ts
  modified: []
decisions:
  - "eventsource v4 uses custom fetch function (not headers init option) for auth injection"
  - "logsCommand is synchronous (void, not async) — EventSource keeps process alive"
  - "Pre-existing typecheck errors in cli.ts/run.ts/interview.ts are out of scope"
metrics:
  duration: "4min"
  completed: "2026-03-27"
  tasks_completed: 1
  files_created: 2
  files_modified: 0
---

# Phase 09 Plan 03: cauldron logs SSE Streaming Command Summary

**One-liner:** SSE-backed real-time log streaming with per-bead color-coded prefixes, bead filtering, and clean SIGINT handling via eventsource v4 custom fetch auth wrapper.

## What Was Built

`packages/api/src/commands/logs.ts` implements the `cauldron logs <project-id>` command:

- Connects directly to `/api/events/[projectId]` via `EventSource` (bypasses tRPC client per plan pitfall 3)
- Injects `Authorization: Bearer <apiKey>` header via eventsource v4's custom `fetch` wrapper (not a `headers` init option — v4 API changed from v3)
- Per-bead color-coded `[bead-prefix]` output using `getBeadColor()` from output.ts
- `[system]` prefix for events with no `beadId`
- `--bead <id>` flag filters to a single bead's events
- `--json` flag outputs raw JSON per event via `formatJson()`
- SIGINT/SIGTERM handler calls `es.close()` then `process.exit(0)` for clean exit
- Event type coloring: red for `*fail*`, teal for `*complete*`, white otherwise

## TDD Execution

**RED:** Wrote 8 failing tests covering all behaviors — failed on missing module.
**GREEN:** Implemented logs.ts — all 8 tests pass.
No refactor phase needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] eventsource v4 auth header API**
- **Found during:** Task 1 (implementation)
- **Issue:** Plan specified `{ headers: { Authorization: ... } }` in EventSource init options. eventsource v4 does not accept a `headers` key — it accepts a `fetch` function that wraps the underlying fetch.
- **Fix:** Used `fetch: (url, init) => fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${apiKey}` } })` pattern instead
- **Files modified:** packages/api/src/commands/logs.ts
- **Commit:** 787804e

**2. [Rule 1 - Bug] vi.hoisted() required for mock variables**
- **Found during:** Task 1 (test GREEN run)
- **Issue:** `MockEventSource` was referenced in `vi.mock` factory before initialization — known Vitest 4 pattern from Phase 06 decisions
- **Fix:** Wrapped all mock state in `vi.hoisted()` per established project pattern
- **Files modified:** packages/api/src/commands/logs.test.ts
- **Commit:** 787804e (same commit after fixing)

### Out of Scope (Pre-existing)

Pre-existing TypeScript errors in `cli.ts`, `run.ts`, `interview.ts`, and `projects.test.ts` were observed but not fixed — they predate this plan and are outside scope per deviation boundary rules. Logged for awareness.

## Known Stubs

None — logs.ts is fully wired. EventSource connects to the real server endpoint. No placeholder data flows.

## Self-Check: PASSED

- packages/api/src/commands/logs.ts — FOUND
- packages/api/src/commands/logs.test.ts — FOUND
- .planning/phases/09-cli/09-03-SUMMARY.md — FOUND
- Commit 90d36c1 (test RED) — FOUND
- Commit 787804e (feat GREEN) — FOUND
