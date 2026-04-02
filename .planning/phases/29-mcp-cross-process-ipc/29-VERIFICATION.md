---
phase: 29-mcp-cross-process-ipc
verified: 2026-04-02T09:00:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
---

# Phase 29: MCP Cross-Process IPC Verification Report

**Phase Goal:** Push notifications from the Inngest worker process reach the MCP stdio process reliably via Redis pub/sub — push is best-effort and pull via check-job-status remains the correctness path
**Verified:** 2026-04-02T09:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Plan 01 truths:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `publishJobStatusChanged` publishes to `cauldron:job-status:{jobId}` channel when configured | VERIFIED | ipc-publisher.ts line 38: `await p.publish(\`cauldron:job-status:${jobId}\`, jobId)` |
| 2 | `publishJobStatusChanged` silently returns when publisher is not configured | VERIFIED | ipc-publisher.ts line 34: `if (!publisher) return;` |
| 3 | `publishJobStatusChanged` swallows Redis errors without throwing | VERIFIED | ipc-publisher.ts lines 36-41: try/catch with empty catch block |
| 4 | `createJobStatusSubscriber` calls `notifyJobStatusChanged` on pmessage events | VERIFIED | ipc-subscriber.ts lines 45-47: `sub.on('pmessage', ...) -> notifyJobStatusChanged(server, message)` |
| 5 | Subscriber registers error listener before psubscribe to prevent unhandled crash | VERIFIED | ipc-subscriber.ts: `sub.on('error', ...)` at line 30 precedes `sub.psubscribe(...)` at line 37 |

Plan 02 truths:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 6 | An asset job status change in the Inngest worker triggers a Redis PUBLISH | VERIFIED | events.ts: `await publishJobStatusChanged(jobId)` at 5 locations (lines 154, 163, 178, 260, 269) |
| 7 | The MCP stdio process receives pub/sub messages and calls notifyJobStatusChanged | VERIFIED | mcp/index.ts line 45: `createJobStatusSubscriber(server, redisUrl, logger)` after `server.connect(transport)` |
| 8 | A Redis connection failure is logged but does not surface as an error to the caller | VERIFIED | Both modules: error listener calls `logger.warn(...)` only; errors never re-thrown |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/engine/src/asset/ipc-publisher.ts` | Redis publisher for cross-process job status IPC | VERIFIED | Exports `configurePublisher` and `publishJobStatusChanged`; 43 lines; fully substantive |
| `packages/mcp/src/ipc-subscriber.ts` | Redis subscriber for job status push notifications | VERIFIED | Exports `createJobStatusSubscriber`; 50 lines; fully substantive |
| `packages/engine/src/asset/__tests__/ipc-publisher.test.ts` | Publisher unit tests | VERIFIED | 5 tests covering all truth behaviors; all pass |
| `packages/mcp/src/__tests__/ipc-subscriber.test.ts` | Subscriber unit tests | VERIFIED | 5 tests covering all truth behaviors, including call-order verification; all pass |
| `packages/engine/src/asset/events.ts` | publishJobStatusChanged called after every onJobStatusChanged | VERIFIED | 5 call sites confirmed in generateAssetHandler |
| `packages/cli/src/bootstrap.ts` | configurePublisher wired at CLI startup | VERIFIED | Lines 72-73: reads REDIS_URL, calls configurePublisher |
| `packages/mcp/src/bootstrap.ts` | redisUrl passed through bootstrap deps | VERIFIED | McpBootstrapDeps interface includes `redisUrl: string`; returned on line 62 |
| `packages/mcp/src/index.ts` | createJobStatusSubscriber wired after server.connect | VERIFIED | Line 45: `createJobStatusSubscriber(server, redisUrl, logger)` immediately after `server.connect(transport)` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/engine/src/asset/ipc-publisher.ts` | Redis | `publisher.publish('cauldron:job-status:{jobId}')` | WIRED | Line 38: exact channel pattern present |
| `packages/mcp/src/ipc-subscriber.ts` | `packages/mcp/src/resources/job-status.ts` | `notifyJobStatusChanged` call on pmessage | WIRED | Line 7 imports `notifyJobStatusChanged`; line 46 calls it in pmessage handler |
| `packages/engine/src/asset/events.ts` | `packages/engine/src/asset/ipc-publisher.ts` | `await publishJobStatusChanged(jobId)` after `onJobStatusChanged` | WIRED | Import at line 17; 5 call sites confirmed |
| `packages/cli/src/bootstrap.ts` | `packages/engine/src/asset/ipc-publisher.ts` | `configurePublisher(redisUrl, ...)` during bootstrap | WIRED | Line 26 imports `configurePublisher`; lines 72-73 call it |
| `packages/mcp/src/index.ts` | `packages/mcp/src/ipc-subscriber.ts` | `createJobStatusSubscriber(server, ...)` after server.connect | WIRED | Line 7 imports; line 45 calls after `await server.connect(transport)` |

### Data-Flow Trace (Level 4)

These modules are IPC bridge components, not rendering components. Data flows via Redis channels rather than through React state. Level 4 is adapted accordingly.

| Artifact | Data Path | Source Produces Real Data | Status |
|----------|-----------|--------------------------|--------|
| `ipc-publisher.ts` | `publishJobStatusChanged(jobId)` -> `redis.publish('cauldron:job-status:{jobId}', jobId)` | Yes — jobId comes from live Inngest event data | FLOWING |
| `ipc-subscriber.ts` | `pmessage` event -> `notifyJobStatusChanged(server, message)` | Yes — message is the jobId string published by the engine | FLOWING |
| `events.ts` | Every `onJobStatusChanged?.(jobId)` site also calls `await publishJobStatusChanged(jobId)` | Yes — calls use the same jobId from the live DB job record | FLOWING |

### Behavioral Spot-Checks

These modules require a running Redis instance and two live processes for end-to-end behavioral verification. Static spot-checks were run instead.

| Behavior | Check | Result | Status |
|----------|-------|--------|--------|
| ipc-publisher.ts exports configurePublisher | `grep -q "export function configurePublisher" packages/engine/src/asset/ipc-publisher.ts` | Match found | PASS |
| ipc-publisher.ts exports publishJobStatusChanged | `grep -q "export async function publishJobStatusChanged" packages/engine/src/asset/ipc-publisher.ts` | Match found | PASS |
| Channel naming uses exact convention | `grep -q "cauldron:job-status:" packages/engine/src/asset/ipc-publisher.ts` | Match found | PASS |
| enableOfflineQueue: false in publisher | `grep -q "enableOfflineQueue: false" packages/engine/src/asset/ipc-publisher.ts` | Match found | PASS |
| Error listener registered before psubscribe | Code review: `sub.on('error', ...)` at line 30, `sub.psubscribe(...)` at line 37 | Correct order | PASS |
| MCP index creates subscriber after server.connect | Code review: `await server.connect(transport)` line 42, `createJobStatusSubscriber(...)` line 45 | Correct order | PASS |
| ioredis added to MCP package.json | `grep -q "ioredis" packages/mcp/package.json` | `"ioredis": "^5.10.1"` in dependencies | PASS |
| Unit tests pass (engine) | `pnpm -F @get-cauldron/engine test` | 500 passed, 40 test files | PASS |
| Unit tests pass (mcp) | `pnpm -F @get-cauldron/mcp test` | 42 passed, 6 test files | PASS |
| MCP typecheck | `pnpm -F @get-cauldron/mcp typecheck` | No errors | PASS |
| Engine typecheck | `pnpm -F @get-cauldron/engine typecheck` | No errors (bug fixed during verification) | PASS |

### Bug Fixed During Verification

**File:** `packages/engine/src/execution/__tests__/merge-queue.test.ts`

**Root cause:** The ai SDK v6 `LanguageModelUsage` type requires `inputTokenDetails` and `outputTokenDetails` as non-optional nested objects (their sub-fields are `| undefined`, but the objects themselves are required). Four mock `usage` objects in the test file supplied only `{ inputTokens, outputTokens }`, omitting these required fields.

**Fix:** Introduced two shared constants (`mockUsage`, `mockUsageZero`) that include all required fields — `inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined }` and `outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined }` — and replaced all four inline `usage` literals with references to these constants.

**Verification:** `pnpm -F @get-cauldron/engine typecheck` now passes clean. All 500 engine tests continue to pass.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| ARCH-01 | 29-01-PLAN.md, 29-02-PLAN.md | MCP push notifications delivered via Redis pub/sub bridge between Inngest worker process and MCP stdio process | SATISFIED | Publisher in engine/asset/ipc-publisher.ts; subscriber in mcp/src/ipc-subscriber.ts; wired end-to-end through events.ts, CLI bootstrap, MCP bootstrap, and MCP index.ts |

No orphaned requirements. ARCH-01 is the only requirement mapped to phase 29 in REQUIREMENTS.md and is claimed and satisfied by both plans.

### Anti-Patterns Found

None in phase 29 files. The `LanguageModelUsage` type mismatch found in `merge-queue.test.ts` has been fixed (see "Bug Fixed During Verification" above).

### Human Verification Required

#### 1. End-to-end push notification delivery

**Test:** Start a Redis instance, the CLI Inngest worker, and the MCP stdio process. Trigger an asset generation job. Observe whether `notifyJobStatusChanged` is called in the MCP process before a subsequent `check-job-status` poll.
**Expected:** The MCP process receives a push notification within milliseconds of the Inngest worker completing a state transition, without requiring a poll.
**Why human:** Requires two live processes and a running Redis instance; cannot be verified statically.

#### 2. MCP stdio pipe safety under Redis errors

**Test:** Start the MCP server with Redis unavailable. Verify that Redis connection errors appear on stderr (not stdout) and the MCP JSON-RPC protocol continues to function normally.
**Expected:** Error messages routed to stderr via pino; no JSON-RPC corruption; MCP server continues responding to tool calls.
**Why human:** Requires a live MCP client, a live MCP server, and deliberate Redis unavailability to observe real runtime behavior.

### Gaps Summary

No gaps. All 8 must-have truths are verified, all artifacts are substantive and fully wired, all key links are confirmed, and ARCH-01 is satisfied. One type bug found in `merge-queue.test.ts` was fixed during verification.

---

_Verified: 2026-04-02T09:00:00Z_
_Verifier: Claude (gsd-verifier)_
