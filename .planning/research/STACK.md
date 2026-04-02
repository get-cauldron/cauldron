# Stack Research

**Domain:** Architectural hardening for Cauldron v1.2 — concurrency safety, data integrity, process control, error resilience
**Researched:** 2026-04-01
**Confidence:** HIGH

## Context

This is a hardening milestone on an existing, validated stack. The base stack (TypeScript, Next.js 16, React 19, Drizzle ORM 0.45, Vercel AI SDK 6, Inngest 4, PostgreSQL, MCP SDK 1.29, Vitest, Playwright) is not re-evaluated here. This document covers only the stack questions introduced by v1.2 features.

---

## Recommended Stack

### Core Technologies — Hardening Specific

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vercel AI SDK `generateText` with `Output.object()` | `ai ^6.0.138` (already installed) | Structured JSON extraction from LLM responses for merge conflict resolution | `generateObject` is deprecated in AI SDK 6 and will be removed in a future version. `generateText({ output: Output.object({ schema }) })` is the correct forward-compatible API. Already in the repo — no new package needed. |
| Drizzle `unique()` table-level constraint | `drizzle-orm ^0.45` (already installed) | Adding composite unique constraints to `events` and `seeds` tables | Schema-level declaration; `drizzle-kit generate` produces a correct `ALTER TABLE ADD CONSTRAINT` migration for existing tables. No additional tooling needed. |
| Node.js `child_process` `subprocess.kill()` + `SIGTERM`→`SIGKILL` two-phase pattern | Node.js built-in (already in use in merge-queue.ts) | Enforcing hard-timeout kill on hung agent processes | Native, no dependency. Two-phase pattern (SIGTERM first, then SIGKILL after grace period) handles the case where child processes catch or ignore SIGTERM. `AbortSignal.timeout()` is an alternative but requires spawn to be AbortSignal-aware; the two-phase `.kill()` pattern is more compatible with the existing `child_process.exec`-based infrastructure. |
| `react-error-boundary` | `^4.1.2` (new addition) | React error boundaries around `DAGCanvas` and other async-rendering components | React 19 still requires class components for `getDerivedStateFromError` — you cannot write error boundaries as function components. `react-error-boundary` wraps this in a clean API with `ErrorBoundary`, `useErrorBoundary`, and `resetKeys`. Author is Brian Vaughn (former React core team). Version 6.1.1 was published February 2026, confirming active maintenance. |
| Redis `PUBLISH`/`SUBSCRIBE` (ioredis) | `ioredis ^5` (already installed) | Cross-process IPC for MCP push notifications from Inngest worker to MCP server | Both processes already have ioredis and a Redis connection. Redis pub/sub is the lowest-friction cross-process channel given this constraint. No new package needed. |

### Supporting Libraries — Hardening Specific

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | Already in repo | Schema for `Output.object()` structured extraction | Use for the merge-conflict resolution JSON schema — defines `confidence`, `files` fields that LLM must emit |
| `react-error-boundary` | `^4.1.2` | `ErrorBoundary` component wrapping `DAGCanvas` and evolution views | Add as a `dependencies` entry in `packages/web/package.json` |

---

## Detailed Findings by Feature Area

### 1. Structured LLM Output (Merge Conflict Resolution)

**Current state:** `merge-queue.ts` calls `this.gateway.generateText(...)` and does ad-hoc string scanning for `"confidence": "low"`. The raw LLM text is written directly to conflict files.

**What AI SDK 6 provides:**

`generateObject` is deprecated in AI SDK 6 (confirmed in the official migration guide and GitHub issue #10025). The replacement is:

```typescript
import { generateText, Output } from 'ai';
import { z } from 'zod';

const ConflictResolutionSchema = z.object({
  confidence: z.enum(['high', 'low']),
  files: z.array(z.object({
    path: z.string(),
    content: z.string(),
  })),
  reason: z.string().optional(),
});

const { output } = await generateText({
  model,
  output: Output.object({ schema: ConflictResolutionSchema }),
  prompt,
});
// output is typed as z.infer<typeof ConflictResolutionSchema>
```

`Output.object()` uses the same provider-native structured output mechanisms as `generateObject` did (JSON schema mode, tool-call mode, or grammar mode depending on the provider). The AI SDK handles provider differences transparently.

**Verdict:** Use `generateText` + `Output.object()` + a Zod schema. No new packages. This replaces the brittle string-scanning in `resolveConflict()`.

**Confidence:** HIGH — verified against official AI SDK 6 migration guide and ai-sdk.dev docs.

---

### 2. Drizzle Migration Patterns for Adding Constraints to Existing Tables

**What Drizzle provides:**

Adding a composite unique constraint to an existing table requires two steps:

1. Add the constraint to the schema definition:

```typescript
// packages/shared/src/db/schema/event.ts
export const events = pgTable('events', {
  // existing columns...
}, (t) => [
  unique('events_project_sequence_unique').on(t.projectId, t.sequence),
]);
```

2. Run `drizzle-kit generate` — it detects the schema diff and emits:

```sql
ALTER TABLE "events"
  ADD CONSTRAINT "events_project_sequence_unique" UNIQUE ("project_id", "sequence");
```

For indexes (not unique constraints), use `index()`:

```typescript
import { index } from 'drizzle-orm/pg-core';

export const events = pgTable('events', { ... }, (t) => [
  index('events_project_sequence_idx').on(t.projectId, t.sequence),
  index('events_project_timestamp_idx').on(t.projectId, t.createdAt),
]);
```

**Key behavior:** `drizzle-kit generate` diffs schema vs existing migrations and emits only the additive SQL. For `ADD CONSTRAINT` on an existing table with existing data, the constraint creation will fail if existing rows violate it — the migration must either clean data first or use `NOT VALID` + `VALIDATE CONSTRAINT` (manual SQL, not generated by Drizzle).

**Verdict:** Pure schema + `drizzle-kit generate` workflow. No new packages. The existing migration infrastructure handles this correctly.

**Confidence:** HIGH — verified against Drizzle ORM official docs and indexes-constraints reference.

---

### 3. Node.js Process Management (Timeout Supervisor Kill)

**Current state:** `TimeoutSupervisor` fires callbacks on timeout thresholds but does not kill anything. It tracks timing; the kill action must be wired in from outside.

**What Node.js provides natively:**

```typescript
import { spawn } from 'node:child_process';

const child = spawn('node', ['agent.js'], { stdio: 'pipe' });
let killed = false;

// Graceful termination first
child.kill('SIGTERM');

// Force kill if still alive after 5s
const forceKillTimer = setTimeout(() => {
  if (!killed) {
    child.kill('SIGKILL');
  }
}, 5_000);

child.on('exit', () => {
  killed = true;
  clearTimeout(forceKillTimer);
});
```

**`AbortSignal.timeout()` alternative:**

```typescript
const child = spawn('node', ['agent.js'], {
  signal: AbortSignal.timeout(30 * 60 * 1000),
  killSignal: 'SIGTERM',
});
```

`AbortSignal.timeout()` sends `killSignal` on expiry and requires the process to be spawned with a `signal` option. Works cleanly for a single-level timeout but does not support the two-phase (SIGTERM → SIGKILL) escalation that handles unresponsive processes.

**Recommendation for Cauldron:** Use the two-phase `.kill()` pattern because:
- The existing `merge-queue.ts` uses `child_process.exec` without `signal:` option, establishing the pattern.
- Agents may run arbitrary user code that catches SIGTERM — SIGKILL is the safety backstop.
- No new packages needed.

**Windows note:** Both SIGTERM and SIGKILL are supported on Windows. POSIX-only signals (SIGUSR1, SIGCHLD, etc.) are not. Cauldron currently targets macOS/Linux for the dev runtime, so this is a non-issue for v1.2.

**Confidence:** HIGH — verified against Node.js v25.8.2 official child_process documentation.

---

### 4. Cross-Process IPC for MCP Push Notifications

**Current state (v1.1 tech debt):** `notifyJobStatusChanged()` in `packages/mcp/src/resources/job-status.ts` calls `server.sendResourceUpdated()` directly. This only works if the Inngest worker and the MCP server are the same Node.js process. In the actual deployment topology (Inngest handler in `cli` package's Hono server on :3001, MCP server as a separate stdio process), they are different processes and the callback is a no-op.

**Transport options in MCP SDK 1.29:**

| Transport | Topology | Push Support |
|-----------|----------|--------------|
| `StdioServerTransport` | MCP server is child process of client | YES — server writes to stdout |
| `StreamableHTTPServerTransport` | MCP server is a standalone HTTP service | YES — via SSE GET endpoint |
| No built-in in-process transport | Same Node.js process | Test helper `InMemoryTransport` only, not for production |

**MCP specification (2025-03-26):** Clients can open a persistent SSE stream via `GET /mcp` to receive server-to-client notifications. The server can send `resources/updated` notifications on this stream independently of any client request.

**Recommended IPC mechanism: Redis Pub/Sub via existing ioredis connection.**

Architecture:
1. Inngest worker (in the Hono server process) publishes a Redis message on `cauldron:mcp:job-status:{projectId}` after job state transitions.
2. The MCP server process (which already has a Redis connection via ioredis) subscribes to this channel on startup.
3. On message receipt, the MCP server calls `server.sendResourceUpdated({ uri: ... })` against its own `McpServer` instance — which this time succeeds because it owns the transport connection to the MCP client.

**Why Redis over alternatives:**

| Option | Verdict | Reason |
|--------|---------|--------|
| Redis PUBLISH/SUBSCRIBE | **Use this** | Already installed (ioredis), no new infrastructure, natural fit for 1:N notification fan-out |
| PostgreSQL LISTEN/NOTIFY | Viable alternative | Also already available; slightly higher latency than Redis pub/sub, but avoids adding a Redis dependency for pure pub/sub semantics. Use if Redis proves unreliable. |
| Unix socket / named pipe | Rejected | Requires managing socket file lifecycle across process restarts; more fragile than a broker |
| HTTP polling from MCP to Inngest | Rejected | Polling adds latency, and MCP server does not know when state changes |
| Shared process (merge into same Node.js process) | Rejected | Inngest handler must be a Hono HTTP server for durable step callbacks; cannot be merged with a stdio MCP process |
| Worker threads | Rejected | Threads share memory within one process; does not span the Hono-to-MCP process boundary |

**Confidence:** HIGH for Redis pub/sub recommendation — verified against ioredis presence in repo, MCP spec transport documentation, and Redis pub/sub official docs.

---

### 5. React Error Boundaries (DAGCanvas)

**Current state:** `packages/web` has React 19 but no error boundary wrapping `DAGCanvas` (`@xyflow/react`). An exception in the DAG layout or rendering crashes the entire page.

**What React 19 provides:** React still does not ship a built-in `ErrorBoundary` function component. `getDerivedStateFromError` can only be defined on class components. React 19 improves error handling in transitions and form actions but does not change this constraint.

**`react-error-boundary` 4.1.2 / 6.1.1:**

The npm package is at **4.1.2** (latest stable, check against npm at implementation time). The GitHub README references version 6.1.1 (published February 2026) — confirm on npm before pinning. API:

```tsx
import { ErrorBoundary } from 'react-error-boundary';

<ErrorBoundary
  fallbackRender={({ error, resetErrorBoundary }) => (
    <div>
      <p>DAG visualization failed: {error.message}</p>
      <button onClick={resetErrorBoundary}>Retry</button>
    </div>
  )}
  onError={(error, info) => logger.error({ error, info }, 'DAGCanvas crashed')}
>
  <DAGCanvas projectId={projectId} />
</ErrorBoundary>
```

`useErrorBoundary()` hook enables triggering the boundary imperatively from event handlers or async callbacks where throw-during-render does not apply.

**Verdict:** Add `react-error-boundary` to `packages/web/package.json`. Pin to `^4.1.2` (or latest stable confirmed at implementation). No other changes needed.

**Confidence:** MEDIUM — version number confirmed from GitHub release (February 2026). Verify exact npm version at implementation time.

---

### 6. Optimistic Concurrency in Drizzle ORM

**Current state:** `beads` table has a `version integer NOT NULL DEFAULT 1` column (noted in schema comments as `DAG-08: optimistic concurrency control`). The actual version-conditioned update is not yet implemented.

**How Drizzle handles it:**

```typescript
// Pattern: version-conditioned UPDATE returning the updated row
const updated = await db
  .update(beads)
  .set({
    status: 'completed',
    version: sql`${beads.version} + 1`,
    completedAt: new Date(),
  })
  .where(and(
    eq(beads.id, beadId),
    eq(beads.version, expectedVersion),
  ))
  .returning({ id: beads.id, version: beads.version });

if (updated.length === 0) {
  throw new OptimisticLockError(`Bead ${beadId} was modified concurrently`);
}
```

`returning()` on PostgreSQL returns the rows actually updated. An empty array means the WHERE condition did not match — either the bead does not exist or another writer incremented `version` first. This is the detection mechanism; no external package required.

**Confidence:** HIGH — verified against Drizzle ORM update docs and PostgreSQL RETURNING clause semantics.

---

## Installation

```bash
# Only one new package is required for v1.2:
pnpm -F @get-cauldron/web add react-error-boundary

# All other hardening features use existing packages:
# - Vercel AI SDK Output.object() — already in packages/engine
# - Drizzle unique()/index() constraints — already in packages/shared
# - Node.js child_process kill() — Node built-in
# - Redis pub/sub — ioredis already in packages/cli and packages/mcp
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `generateText` + `Output.object()` | Keep `generateObject` | Only acceptable if staying on AI SDK 5.x. AI SDK 6 deprecated it; do not use for new code. |
| `generateText` + `Output.object()` | Third-party JSON extraction (e.g., `zod-gpt`, `instructor`) | Use if the gateway abstraction makes it impossible to pass `output:` directly. In Cauldron, the gateway wraps `generateText`, so passing `output:` through is straightforward. |
| Two-phase SIGTERM→SIGKILL | `AbortSignal.timeout()` single-phase | Use `AbortSignal.timeout()` only if spawning new processes with the `signal:` option. For existing `exec()`-based code, two-phase `.kill()` is simpler. |
| Redis pub/sub (existing ioredis) | PostgreSQL LISTEN/NOTIFY | Use LISTEN/NOTIFY if you want to eliminate the Redis dependency entirely. Already available via Drizzle's underlying `postgres` driver with `client.listen()`. Slightly more latency but same reliability profile for this use case. |
| `react-error-boundary` | Hand-written class ErrorBoundary | Acceptable for a single boundary. `react-error-boundary` is worth the dependency for `useErrorBoundary` hook and `resetKeys` prop. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `generateObject` / `streamObject` | Deprecated in AI SDK 6; will be removed | `generateText({ output: Output.object({ schema }) })` |
| Third-party process management libraries (e.g., `execa`, `tasklist`, `tree-kill`) | No new dependency needed for basic SIGTERM/SIGKILL pattern | Node.js built-in `child_process` `.kill()` |
| Unix domain sockets or named pipes for IPC | Fragile lifecycle across process restarts | Redis pub/sub via existing ioredis |
| `node-ipc` package | Known security incident history (protestware), unnecessary | Redis pub/sub or PostgreSQL LISTEN/NOTIFY |
| Hand-writing `getDerivedStateFromError` class component | Verbose boilerplate, no `useErrorBoundary` hook | `react-error-boundary` |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `react-error-boundary ^4.1.2` | React 19 | Confirmed React 19 compatible (February 2026 release). Verify exact npm version at implementation time. |
| `Output.object()` in `ai ^6.0.138` | `@ai-sdk/anthropic ^3.x`, `@ai-sdk/openai ^3.x`, `@ai-sdk/google ^3.x` | All three providers support structured output through the unified Output API. Provider-specific behavior (tool mode vs JSON schema mode) is abstracted by the SDK. |
| Drizzle `unique()` composite constraints | `drizzle-kit ^0.30+` | Modern drizzle-kit versions support full constraint syntax. Existing migration infrastructure is sufficient. |

---

## Sources

- [AI SDK 6 Migration Guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0) — confirmed `generateObject` deprecated, `Output.object()` is replacement
- [AI SDK Core: generateObject reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-object) — confirmed deprecation notice
- [AI SDK Core: Generating Structured Data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) — confirmed `Output.object()`, `Output.array()`, `Output.json()` API
- [Vercel AI SDK 6 announcement](https://vercel.com/blog/ai-sdk-6) — confirmed `generateObject` not immediately removed, transition path documented
- [GitHub issue #10025: deprecate generateObject](https://github.com/vercel/ai/issues/10025) — confirmed deprecation intent
- [Drizzle ORM indexes-constraints docs](https://orm.drizzle.team/docs/indexes-constraints) — confirmed `unique().on(col1, col2)` table-level syntax
- [Drizzle ORM update docs](https://orm.drizzle.team/docs/update) — confirmed `.returning()` for affected-row detection
- [Node.js child_process docs v25.8.2](https://nodejs.org/api/child_process.html) — confirmed `.kill()`, `SIGTERM`/`SIGKILL` hierarchy, `AbortSignal.timeout()`
- [react-error-boundary GitHub](https://github.com/bvaughn/react-error-boundary) — confirmed v6.1.1 (February 2026), API surface
- [MCP specification transports 2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) — confirmed StdioServerTransport and Streamable HTTP push notification mechanisms
- [MCP TypeScript SDK npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — confirmed v1.29.0

---
*Stack research for: Cauldron v1.2 Architectural Hardening*
*Researched: 2026-04-01*
