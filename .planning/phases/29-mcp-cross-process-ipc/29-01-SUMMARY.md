---
phase: 29-mcp-cross-process-ipc
plan: "01"
subsystem: engine/asset, mcp
tags: [ipc, redis, pub-sub, mcp, push-notifications]
dependency_graph:
  requires: []
  provides: [ipc-publisher, ipc-subscriber, redis-pubsub-bridge]
  affects: [engine/asset, mcp]
tech_stack:
  added: [ioredis in @get-cauldron/mcp]
  patterns: [module-level publisher, error-swallowing, psubscribe wildcard, error-listener-first]
key_files:
  created:
    - packages/engine/src/asset/ipc-publisher.ts
    - packages/engine/src/asset/__tests__/ipc-publisher.test.ts
    - packages/mcp/src/ipc-subscriber.ts
    - packages/mcp/src/__tests__/ipc-subscriber.test.ts
  modified:
    - packages/engine/src/asset/index.ts
    - packages/mcp/package.json
decisions:
  - "Use import { Redis } from 'ioredis' (named export) not default import for Node16 module resolution compatibility"
  - "Publisher uses enableOfflineQueue:false for best-effort semantics -- no command queuing during Redis outage"
  - "psubscribe wildcard pattern cauldron:job-status:* covers all jobs with one subscriber connection"
  - "Error listener registered before psubscribe to prevent unhandled EventEmitter crash"
metrics:
  duration: "6m 3s"
  completed: "2026-04-02"
  tasks_completed: 2
  files_changed: 6
---

# Phase 29 Plan 01: MCP Cross-Process IPC Modules Summary

**One-liner:** Redis pub/sub IPC bridge: engine publishes job status changes on `cauldron:job-status:{jobId}`, MCP subscribes with wildcard pattern and calls `notifyJobStatusChanged` on receipt.

## What Was Built

### ipc-publisher.ts (engine/asset)

Module-level Redis publisher for the Inngest worker process:
- `configurePublisher(redisUrl, logger)` — creates a shared `Redis` instance with `enableOfflineQueue: false` and idempotency guard
- `publishJobStatusChanged(jobId)` — publishes to `cauldron:job-status:{jobId}`, swallows all errors
- Error listener registered immediately to prevent unhandled EventEmitter crash
- Exported from `engine/asset/index.ts` for use in CLI bootstrap

### ipc-subscriber.ts (mcp)

Dedicated Redis subscriber for the MCP stdio process:
- `createJobStatusSubscriber(server, redisUrl, logger)` — creates a dedicated `Redis` subscriber instance
- Registers error listener FIRST (critical ordering), then calls `psubscribe('cauldron:job-status:*')`
- `pmessage` handler calls `notifyJobStatusChanged(server, message)` where `message` is the jobId
- All logging via pino (stderr) — never stdout (MCP JSON-RPC pipe)

### Package dependency

`ioredis ^5.10.1` added to `@get-cauldron/mcp/package.json`.

## Test Coverage

| File | Tests | All Pass |
|------|-------|----------|
| `engine/src/asset/__tests__/ipc-publisher.test.ts` | 5 | Yes |
| `mcp/src/__tests__/ipc-subscriber.test.ts` | 5 | Yes |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ioredis named export required for Node16 module resolution**
- **Found during:** Task 1 typecheck
- **Issue:** `import Redis from 'ioredis'` with `module: "Node16"` caused `TS2709: Cannot use namespace 'Redis' as a type`
- **Fix:** Changed to `import { Redis } from 'ioredis'` (named export) which is exported by ioredis as both `default` and named `Redis`
- **Files modified:** `ipc-publisher.ts`, `ipc-subscriber.ts`, both test mocks updated to export `{ default: MockRedis, Redis: MockRedis }`
- **Commit:** 2549ed7 (publisher), 006e598 (subscriber)

**2. [Rule 1 - Bug] ioredis psubscribe callback type mismatch**
- **Found during:** Task 2 typecheck
- **Issue:** `TS2769: No overload matches this call` — ioredis Callback type expects `Error | null | undefined`, not `Error | null`
- **Fix:** Changed callback signature from `(err: Error | null)` to `(err?: Error | null)`
- **Files modified:** `ipc-subscriber.ts`
- **Commit:** 006e598

## Known Stubs

None. Both modules are fully wired with no placeholder data.

## Self-Check

Files exist:
- packages/engine/src/asset/ipc-publisher.ts — FOUND
- packages/mcp/src/ipc-subscriber.ts — FOUND
- packages/engine/src/asset/__tests__/ipc-publisher.test.ts — FOUND
- packages/mcp/src/__tests__/ipc-subscriber.test.ts — FOUND

Commits:
- 2549ed7 — feat(29-01): add Redis IPC publisher for cross-process job status notifications
- 006e598 — feat(29-01): add Redis IPC subscriber for MCP job status push notifications

## Self-Check: PASSED
