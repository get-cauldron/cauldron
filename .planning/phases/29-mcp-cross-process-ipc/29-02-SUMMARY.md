---
phase: 29-mcp-cross-process-ipc
plan: "02"
subsystem: engine/asset, cli, mcp
tags: [ipc, redis, pub-sub, mcp, push-notifications, wiring]
dependency_graph:
  requires: [29-01]
  provides: [cross-process-ipc-fully-wired]
  affects: [engine/asset/events, cli/bootstrap, mcp/bootstrap, mcp/index]
tech_stack:
  added: []
  patterns: [publishJobStatusChanged after every onJobStatusChanged, createJobStatusSubscriber after server.connect]
key_files:
  created: []
  modified:
    - packages/engine/src/asset/events.ts
    - packages/engine/src/asset/__tests__/events.test.ts
    - packages/cli/src/bootstrap.ts
    - packages/mcp/src/bootstrap.ts
    - packages/mcp/src/index.ts
decisions:
  - "publishJobStatusChanged is called immediately after onJobStatusChanged on every state transition — both in-process callback and cross-process IPC fire together"
  - "redisUrl defaults to redis://localhost:6379 in both CLI and MCP bootstraps via REDIS_URL env var"
  - "createJobStatusSubscriber called after server.connect() to ensure MCP server is ready for notifications before subscribing"
metrics:
  duration: "~8m"
  completed: "2026-04-02"
  tasks_completed: 2
  files_changed: 5
---

# Phase 29 Plan 02: IPC Wiring Summary

**One-liner:** Wire the Redis pub/sub IPC path end-to-end: events.ts calls publishJobStatusChanged after every job state transition, CLI bootstrap configures the publisher, and MCP index creates the subscriber after server.connect().

## What Was Built

### events.ts — publishJobStatusChanged wired

Added `import { publishJobStatusChanged } from './ipc-publisher.js'` and inserted `await publishJobStatusChanged(jobId)` immediately after every `onJobStatusChanged?.(jobId)` call. There are 5 locations covering all state transitions:

- submit-to-comfyui success (asset_job_active)
- submit-to-comfyui failure (asset_job_failed)
- poll-completion failure (asset_job_failed)
- collect-artifacts success (asset_job_completed)
- collect-artifacts failure (asset_job_failed)

Both the in-process callback and cross-process IPC now fire together on every transition. publishJobStatusChanged is best-effort — errors are swallowed by the publisher itself.

### CLI bootstrap.ts — configurePublisher wired

Added `configurePublisher` to the imports from `@get-cauldron/engine`. After `configureAssetDeps(...)`, reads `REDIS_URL` env var (defaulting to `redis://localhost:6379`) and calls `configurePublisher(redisUrl, logger)`. The publisher is now ready before Inngest handlers begin processing.

### MCP bootstrap.ts — redisUrl propagated

Added `redisUrl: string` to the `McpBootstrapDeps` interface. Inside `bootstrapMcp()`, reads `REDIS_URL` env var (defaulting to `redis://localhost:6379`) and includes it in the return value.

### MCP index.ts — createJobStatusSubscriber wired

Added `import { createJobStatusSubscriber } from './ipc-subscriber.js'`. Destructures `redisUrl` from `bootstrapMcp()`. After `await server.connect(transport)`, calls `createJobStatusSubscriber(server, redisUrl, logger)`. The subscriber is long-lived and persists for the process lifetime.

## Test Coverage

| File | New Tests | All Pass |
|------|-----------|----------|
| `engine/src/asset/__tests__/events.test.ts` | 1 (Test 19) | Yes (500 total) |
| `mcp/src/__tests__/ipc-subscriber.test.ts` | 0 new | Yes (42 total) |

Test 19 verifies that `publishJobStatusChanged` is called with the jobId after a successful `generateAssetHandler` run. The ipc-publisher mock (`vi.mock('../ipc-publisher.js', ...)`) prevents any Redis connections in the test suite.

## Deviations from Plan

### Pre-existing Issues (Out of Scope)

**1. [Pre-existing] merge-queue.test.ts TS2739 type error**
- **Found during:** Overall verification (pnpm build)
- **Issue:** `src/execution/__tests__/merge-queue.test.ts(319,9): Type '{ inputTokens: number; outputTokens: number; }' is missing the following properties from type 'LanguageModelUsage': inputTokenDetails, outputTokenDetails, totalTokens`
- **Status:** Pre-existing before this plan (confirmed by git stash check). Not caused by this plan's changes.
- **Deferred:** Logged to deferred-items; not blocking this plan's objectives.

### Auto-fixed Issues

None — plan executed as written.

## Known Stubs

None. All IPC connections are fully wired with no placeholder data.

## Self-Check

Files exist:
- packages/engine/src/asset/events.ts — FOUND
- packages/engine/src/asset/__tests__/events.test.ts — FOUND
- packages/cli/src/bootstrap.ts — FOUND
- packages/mcp/src/bootstrap.ts — FOUND
- packages/mcp/src/index.ts — FOUND

Commits:
- 410d5f1 — feat(29-02): wire publishJobStatusChanged into events.ts and CLI bootstrap
- d9cbf20 — feat(29-02): wire createJobStatusSubscriber into MCP bootstrap and index

## Self-Check: PASSED
