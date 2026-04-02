# Phase 29: MCP Cross-Process IPC - Research

**Researched:** 2026-04-02
**Domain:** Redis pub/sub, ioredis, cross-process notification, MCP stdio server
**Confidence:** HIGH

## Summary

The Inngest worker process (CLI engine server on port 3001) and the MCP stdio process are separate OS processes that cannot share in-process callbacks. The existing `onJobStatusChanged` callback in `events.ts` fires synchronously within the Inngest process — it cannot reach the MCP process as-is. Redis pub/sub is the correct bridge: the Inngest worker publishes a small JSON message on a per-job channel; the MCP process subscribes and calls `notifyJobStatusChanged` when a message arrives.

The key design constraint is "best-effort push, DB pull is truth." Redis connection failures must be caught and logged without surfacing as errors to callers. The `check-job-status` DB query is the authoritative fallback — always works regardless of Redis health.

ioredis 5.10.1 is already installed in the project (CLI `package.json` depends on it; the MCP `package.json` does not). The MCP package needs `ioredis` added as a direct dependency. A subscriber client in ioredis enters an exclusive mode — it cannot issue regular commands — so the subscriber connection must be a dedicated `Redis` instance separate from any other Redis usage.

**Primary recommendation:** Add a `createJobStatusSubscriber` factory to `packages/mcp/src/` that owns a dedicated ioredis subscriber client, subscribes to `cauldron:job-status:{jobId}` channels (or a wildcard pattern), and calls `notifyJobStatusChanged` on message receipt. Add a `publishJobStatusChanged` helper to `packages/engine/src/asset/` that creates a short-lived publisher (or reuses a shared one) and publishes to the same channel key after each state transition. Wire both ends in their respective bootstraps.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — pure infrastructure phase, all decisions at Claude's discretion.

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. The MCP server and Inngest worker run as separate processes. Redis pub/sub bridges the gap for push notifications. The existing `check-job-status` DB query remains the reliable fallback.

### Deferred Ideas (OUT OF SCOPE)
None — infrastructure phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ARCH-01 | MCP push notifications delivered via Redis pub/sub bridge between Inngest worker process and MCP stdio process | ioredis pub/sub API fully documented; channel naming, error-swallowing, and auto-resubscribe patterns all verified from official docs |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ioredis | 5.10.1 | Redis pub/sub client (publisher + subscriber) | Already a project dependency; already used in `packages/cli/src/health.ts`; full pub/sub support with auto-resubscribe |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pino | ^10.3.1 | Structured logging for connection errors | Already project-wide logger — use existing instance, don't create new |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ioredis | node-redis (redis@4) | ioredis already installed; no reason to add a second Redis client library |
| Per-job channel subscription | Single wildcard psubscribe | Wildcard requires pattern subscription mode; per-job subscribe is simpler and matches the MCP server lifecycle (one project per MCP process) |
| Short-lived publish client | Shared long-lived publish client | Short-lived adds TCP overhead per event; a module-level shared publisher is more efficient for frequent status changes |

**Installation:**
```bash
# Add ioredis to MCP package — it's already in engine/cli but not mcp
pnpm --filter @get-cauldron/mcp add ioredis
```

**Version verification:** ioredis 5.10.1 is the installed and current published version (verified via `npm view ioredis version`).

## Architecture Patterns

### Recommended Project Structure

New files to create:
```
packages/engine/src/asset/
├── ipc-publisher.ts       # publishJobStatusChanged(jobId) — Redis PUBLISH
packages/mcp/src/
├── ipc-subscriber.ts      # createJobStatusSubscriber(server, redisUrl, logger)
```

Modified files:
```
packages/engine/src/asset/events.ts        # call publishJobStatusChanged after onJobStatusChanged
packages/engine/src/asset/index.ts         # export publishJobStatusChanged
packages/mcp/src/bootstrap.ts              # create subscriber + wire notifier
packages/mcp/src/index.ts                  # start subscriber after server.connect()
packages/mcp/package.json                  # add ioredis dependency
```

### Pattern 1: Channel Naming Convention

**What:** Use a deterministic channel name per job so publisher and subscriber agree without coordination.

**When to use:** Always — both sides must derive the same channel string from `jobId` alone.

**Channel key:** `cauldron:job-status:{jobId}`

This is a fine-grained per-job channel. The MCP process can subscribe to a wildcard pattern `cauldron:job-status:*` using `psubscribe` — which means one subscription covers all jobs rather than subscribing/unsubscribing per job. The tradeoff: `psubscribe` puts the client in pattern-subscriber mode and uses the `pmessage` event instead of `message`.

**Recommended approach:** Use `psubscribe('cauldron:job-status:*')` in the MCP subscriber — the MCP server handles one project and its jobs; a single pattern subscription is simpler than dynamic subscribe/unsubscribe lifecycle management.

### Pattern 2: Publisher (Inngest Worker Side)

**What:** A module-level shared ioredis client in the engine package that publishes job status changes.

**When to use:** After every call to `onJobStatusChanged` in `events.ts` — both succeed AND fail paths.

```typescript
// Source: ioredis official docs (https://redis.github.io/ioredis/)
// packages/engine/src/asset/ipc-publisher.ts

import Redis from 'ioredis';
import type { Logger } from 'pino';

let publisher: Redis | null = null;

export function configurePublisher(redisUrl: string, logger: Logger): void {
  publisher = new Redis(redisUrl, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
  });
  publisher.on('error', (err) => {
    // Best-effort — log but never throw
    logger.warn({ err }, 'IPC publisher Redis error (non-fatal)');
  });
}

export async function publishJobStatusChanged(jobId: string): Promise<void> {
  if (!publisher) return; // Not configured — silently skip
  try {
    await publisher.publish(`cauldron:job-status:${jobId}`, jobId);
  } catch (err) {
    // Swallow — push is best-effort, DB pull is the correctness path
  }
}
```

**Critical:** `enableOfflineQueue: false` prevents unbounded queue buildup if Redis is down. The error is swallowed — callers in `events.ts` must not fail because of IPC.

### Pattern 3: Subscriber (MCP Stdio Side)

**What:** A dedicated ioredis subscriber client in the MCP package that calls `notifyJobStatusChanged` on receipt.

**When to use:** Started once in `bootstrapMcp` after DB init, before `server.connect()`.

```typescript
// Source: ioredis official docs (https://redis.github.io/ioredis/)
// packages/mcp/src/ipc-subscriber.ts

import Redis from 'ioredis';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Logger } from 'pino';
import { notifyJobStatusChanged } from './resources/job-status.js';

export function createJobStatusSubscriber(
  server: McpServer,
  redisUrl: string,
  logger: Logger
): Redis {
  const sub = new Redis(redisUrl, {
    lazyConnect: false,
    // autoResubscribe: true is the default — channels are restored after reconnect
  });

  sub.on('error', (err) => {
    // Best-effort — never surface as an error to the MCP client
    logger.warn({ err }, 'IPC subscriber Redis error (non-fatal)');
  });

  sub.psubscribe('cauldron:job-status:*', (err) => {
    if (err) {
      logger.warn({ err }, 'IPC subscriber psubscribe failed (non-fatal)');
    }
  });

  sub.on('pmessage', (_pattern: string, _channel: string, message: string) => {
    // message is the jobId (published by ipc-publisher)
    notifyJobStatusChanged(server, message);
  });

  return sub;
}
```

**Critical:** `sub.on('error', ...)` MUST be registered before `psubscribe` — ioredis throws an unhandled error event if no listener is registered when a connection error occurs.

### Pattern 4: Wire in bootstrap.ts (MCP side)

```typescript
// packages/mcp/src/bootstrap.ts — add after configureAssetDeps

import { createJobStatusSubscriber } from './ipc-subscriber.js';

// In bootstrapMcp():
const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
// subscriber is stored in returned deps so index.ts can wire it to the server
return { db, logger, inngest, redisUrl };

// Then in index.ts after createMcpServer():
const subscriber = createJobStatusSubscriber(server, deps.redisUrl, deps.logger);
// subscriber is a long-lived connection — no cleanup needed for stdio lifetime
```

### Pattern 5: Wire publisher in engine bootstrap (CLI side)

```typescript
// packages/cli/src/bootstrap.ts — add to bootstrap()
import { configurePublisher } from '@get-cauldron/engine';

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
configurePublisher(redisUrl, logger);
```

### Anti-Patterns to Avoid

- **Subscriber client issuing regular commands:** ioredis enters an exclusive subscriber mode after `subscribe()`/`psubscribe()` — a subscribed client cannot execute GET, SET, etc. Keep publisher and subscriber as separate `Redis` instances.
- **Throwing on Redis publish failure:** The publish call is best-effort. Any error must be caught and logged, never re-thrown. The `onJobStatusChanged` callback in `events.ts` cannot fail due to IPC.
- **Missing error listener on ioredis client:** ioredis throws an unhandled EventEmitter error if a connection error occurs with no `error` listener. Register `redis.on('error', ...)` before any subscribe/publish call.
- **Blocking server startup on Redis:** The MCP process must start successfully even if Redis is down. The subscriber should connect with `lazyConnect: false` but failures must not crash `main()`.
- **Writing to stdout from subscriber:** In an MCP stdio process, stdout is the JSON-RPC pipe. Any `console.log` from the subscriber will corrupt the protocol. Use `logger` (which writes to stderr) exclusively.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auto-resubscribe on reconnect | Manual reconnect loop with subscribe() calls | ioredis `autoResubscribe: true` (default) | ioredis restores subscriptions automatically after reconnection — custom logic is error-prone and redundant |
| Channel name registry | Shared constants file with channel URL builder | Inline template literal `cauldron:job-status:${jobId}` | One caller, one receiver — a dedicated registry is over-engineering |
| Retry/backoff on publish failure | Custom exponential backoff wrapper | Swallow error immediately | Push is best-effort by design; retries would add latency and complexity for no correctness benefit |

**Key insight:** ioredis handles all reconnection and resubscription automatically. The only custom logic needed is error swallowing and the channel naming convention.

## Common Pitfalls

### Pitfall 1: Subscriber Mode Exclusivity
**What goes wrong:** Calling regular Redis commands (GET, SET, HSET) on a subscriber client causes errors — "Command not allowed in subscriber mode."
**Why it happens:** ioredis enters a mode restriction after `subscribe()` or `psubscribe()`.
**How to avoid:** Use two separate `Redis` instances — one for pub/subscribe, one for any regular commands. In this phase, the publisher is a dedicated instance that only calls `publish()`, so it's safe. The subscriber only calls `psubscribe()` and listens to events — also safe.
**Warning signs:** `ERR Command not allowed in subscriber mode` in logs.

### Pitfall 2: No Error Listener = Unhandled Crash
**What goes wrong:** If Redis is unreachable and no `.on('error', ...)` handler is registered, ioredis emits an unhandled `error` event, which crashes the Node.js process.
**Why it happens:** Node.js EventEmitter throws unhandled `error` events as exceptions.
**How to avoid:** Register `redis.on('error', (err) => logger.warn(err))` immediately after creating the `Redis` instance, before any connect/subscribe operation.
**Warning signs:** Uncaught exception stack trace with `Error: connect ECONNREFUSED`.

### Pitfall 3: stdout Contamination in MCP Stdio Process
**What goes wrong:** Any `console.log` or `process.stdout.write` from the subscriber emits non-JSON-RPC bytes to stdout, corrupting the MCP transport and causing the LLM client to lose the connection.
**Why it happens:** MCP stdio transport uses stdout exclusively as a JSON-RPC pipe. Anything not valid JSON-RPC breaks the protocol.
**How to avoid:** All logging in `ipc-subscriber.ts` must use the pino logger instance which writes to stderr (fd 2). Never use `console.log`, `console.error`, or direct stdout writes.
**Warning signs:** MCP client disconnects unexpectedly; "unexpected token" JSON parse errors in the client.

### Pitfall 4: Publisher Not Configured in Engine Process
**What goes wrong:** `publishJobStatusChanged` is called but `configurePublisher` was never invoked, so the module-level `publisher` is null. The function silently skips.
**Why it happens:** The engine's `configureAssetDeps` is called in `bootstrap.ts` but the Redis publisher is a new module-level dependency that needs its own initialization step.
**How to avoid:** Call `configurePublisher(redisUrl, logger)` in both `packages/cli/src/bootstrap.ts` (engine server path) and any test harness that exercises the full pipeline.
**Warning signs:** No push notifications reaching MCP despite Redis running; no errors logged.

### Pitfall 5: psubscribe vs subscribe Channel Mismatch
**What goes wrong:** Publisher publishes to `cauldron:job-status:abc123` but subscriber uses `subscribe('cauldron:job-status:*')` — the literal asterisk doesn't match in non-pattern mode; no messages received.
**Why it happens:** `subscribe()` matches exact channel names; `psubscribe()` matches glob patterns.
**How to avoid:** Use `psubscribe('cauldron:job-status:*')` on the subscriber side and listen to `pmessage` (not `message`) events. The `pmessage` handler receives `(pattern, channel, message)`.
**Warning signs:** No messages received despite publish working (verifiable via `redis-cli subscribe`).

## Code Examples

### Publisher: Full ipc-publisher.ts

```typescript
// packages/engine/src/asset/ipc-publisher.ts
// Source: ioredis 5.x official docs (https://redis.github.io/ioredis/)

import Redis from 'ioredis';
import type { Logger } from 'pino';

let publisher: Redis | null = null;

export function configurePublisher(redisUrl: string, logger: Logger): void {
  if (publisher) return; // idempotent
  publisher = new Redis(redisUrl, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
  });
  // MUST register error listener before any operation to prevent unhandled crash
  publisher.on('error', (err) => {
    logger.warn({ err }, 'IPC publisher Redis error (non-fatal)');
  });
}

/**
 * Publish a job status change to the Redis IPC channel.
 * Best-effort — errors are swallowed. Returns void, never throws.
 */
export async function publishJobStatusChanged(jobId: string): Promise<void> {
  if (!publisher) return;
  try {
    await publisher.publish(`cauldron:job-status:${jobId}`, jobId);
  } catch {
    // Swallow — push is best-effort
  }
}
```

### Subscriber: Full ipc-subscriber.ts

```typescript
// packages/mcp/src/ipc-subscriber.ts
// Source: ioredis 5.x official docs (https://redis.github.io/ioredis/)

import Redis from 'ioredis';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Logger } from 'pino';
import { notifyJobStatusChanged } from './resources/job-status.js';

/**
 * Create a dedicated Redis subscriber for job status IPC.
 * Subscribes to cauldron:job-status:* pattern and calls notifyJobStatusChanged
 * on every message. Errors are logged but never thrown.
 * Returns the subscriber instance (caller can call .quit() on shutdown).
 */
export function createJobStatusSubscriber(
  server: McpServer,
  redisUrl: string,
  logger: Logger
): Redis {
  const sub = new Redis(redisUrl);

  // Register error handler FIRST — prevents unhandled EventEmitter crash
  sub.on('error', (err) => {
    logger.warn({ err }, 'IPC subscriber Redis error (non-fatal)');
  });

  // Pattern subscription covers all job IDs with one connection
  sub.psubscribe('cauldron:job-status:*', (err) => {
    if (err) {
      logger.warn({ err }, 'IPC subscriber psubscribe failed (non-fatal)');
    }
  });

  // pmessage fires for pattern subscriptions; message is the jobId
  sub.on('pmessage', (_pattern: string, _channel: string, message: string) => {
    notifyJobStatusChanged(server, message);
  });

  return sub;
}
```

### events.ts integration point

```typescript
// In generateAssetHandler, after onJobStatusChanged?.(jobId):
// Add: await publishJobStatusChanged(jobId);
// This runs in the Inngest worker process and publishes to Redis.
// Import: import { publishJobStatusChanged } from './ipc-publisher.js';
```

### Engine package export

```typescript
// packages/engine/src/asset/index.ts — add:
export { configurePublisher, publishJobStatusChanged } from './ipc-publisher.js';
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| In-process callback `onJobStatusChanged` | Redis pub/sub bridge for cross-process IPC | Phase 29 | Enables push notifications across OS process boundary |
| Push not implemented | Best-effort push + DB pull fallback | Phase 29 | MCP clients get real-time status updates without polling |

**Deprecated/outdated:**
- None — this phase adds new infrastructure; existing `onJobStatusChanged` callback remains and is called from within the Inngest process for any in-process consumers.

## Open Questions

1. **Should the publisher be shut down gracefully?**
   - What we know: The CLI engine server runs until SIGTERM/SIGINT. ioredis auto-reconnects by default.
   - What's unclear: Whether calling `publisher.quit()` on process exit is needed or whether ioredis handles cleanup.
   - Recommendation: Add `process.on('SIGTERM', () => publisher?.quit())` in the publisher module for clean shutdown. Not required for correctness.

2. **Should the MCP bootstrap fail if REDIS_URL is unset?**
   - What we know: REDIS_URL is already required by health.ts. The MCP process could work without Redis (push is best-effort).
   - What's unclear: User preference for hard vs. soft failure.
   - Recommendation: Default to `redis://localhost:6379` if REDIS_URL is unset (same behavior as existing health check). The subscriber will fail to connect, log a warning, and the MCP process continues serving without push notifications.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Redis | IPC pub/sub | Not verified (Docker not running at research time) | — | Push notifications silently disabled; DB pull path unaffected |
| ioredis | Publisher + Subscriber | ✓ (in project) | 5.10.1 | — |

**Missing dependencies with no fallback:**
- None that block execution. Redis being down does not block the phase — failure tolerance is a core requirement.

**Missing dependencies with fallback:**
- Redis unavailable at runtime: Push notifications disabled; `check-job-status` DB query remains the authoritative path.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `packages/mcp/vitest.config.ts`, `packages/engine/vitest.config.ts` |
| Quick run command | `pnpm -F @get-cauldron/mcp test && pnpm -F @get-cauldron/engine test` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ARCH-01 | Publisher: `publishJobStatusChanged` calls `redis.publish` with correct channel when publisher is configured | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/ipc-publisher.test.ts` | ❌ Wave 0 |
| ARCH-01 | Publisher: swallows errors — `publishJobStatusChanged` never throws even if `redis.publish` rejects | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/ipc-publisher.test.ts` | ❌ Wave 0 |
| ARCH-01 | Publisher: returns silently when publisher not configured (no configurePublisher call) | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/ipc-publisher.test.ts` | ❌ Wave 0 |
| ARCH-01 | Subscriber: calls `notifyJobStatusChanged` with correct jobId when pmessage event fires | unit | `pnpm -F @get-cauldron/mcp test -- src/__tests__/ipc-subscriber.test.ts` | ❌ Wave 0 |
| ARCH-01 | Subscriber: registers error listener before psubscribe (no unhandled crash) | unit | `pnpm -F @get-cauldron/mcp test -- src/__tests__/ipc-subscriber.test.ts` | ❌ Wave 0 |
| ARCH-01 | events.ts: `publishJobStatusChanged` is called after each `onJobStatusChanged` call in `generateAssetHandler` | unit (existing test file extended) | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/events.test.ts` | ✅ (needs extension) |

### Sampling Rate
- **Per task commit:** `pnpm -F @get-cauldron/mcp test && pnpm -F @get-cauldron/engine test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/engine/src/asset/__tests__/ipc-publisher.test.ts` — covers ARCH-01 publisher unit tests
- [ ] `packages/mcp/src/__tests__/ipc-subscriber.test.ts` — covers ARCH-01 subscriber unit tests
- [ ] `packages/mcp/package.json` — add `ioredis` dependency

*(No new test framework needed — Vitest is already configured in both packages)*

## Project Constraints (from CLAUDE.md)

- **TypeScript end-to-end** — ipc-publisher.ts and ipc-subscriber.ts must be `.ts` with strict types
- **ioredis (^5.10.1)** — already a project dependency; do not introduce `redis@4` or any alternative
- **No third-party crypto** — not relevant to this phase
- **Logging: pino** — use existing pino logger instance; never create a new logger
- **MCP stdio critical constraint: never write to stdout** — all subscriber logging must use the pino instance writing to stderr (fd 2)
- **`enableOfflineQueue: false`** — IPC Redis clients should not queue commands during outages (best-effort semantics)

## Sources

### Primary (HIGH confidence)
- ioredis 5.x official API docs (https://redis.github.io/ioredis/interfaces/CommonRedisOptions.html) — `autoResubscribe`, `lazyConnect`, `enableOfflineQueue`, `maxRetriesPerRequest` options
- ioredis GitHub README (https://github.com/redis/ioredis) — pub/sub API: subscribe, psubscribe, message/pmessage events, subscriber mode exclusivity
- Project source: `packages/cli/src/health.ts` — existing ioredis usage pattern in project
- Project source: `packages/engine/src/asset/events.ts` — `onJobStatusChanged` callback wire points
- Project source: `packages/mcp/src/server.ts`, `bootstrap.ts`, `index.ts` — MCP bootstrap and notification path
- Project source: `packages/mcp/src/resources/job-status.ts` — `notifyJobStatusChanged` function

### Secondary (MEDIUM confidence)
- ioredis npm registry — version 5.10.1 confirmed current (https://www.npmjs.com/package/ioredis)
- ioredis issue #1192 — confirms error event behavior and need for explicit `error` listener (https://github.com/redis/ioredis/issues/1192)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — ioredis already in project, version confirmed from npm registry
- Architecture: HIGH — all integration points read directly from source code; ioredis pub/sub API verified from official docs
- Pitfalls: HIGH — subscriber mode exclusivity and error listener requirement verified from official docs and issue tracker

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (ioredis is stable; API patterns are long-lived)
