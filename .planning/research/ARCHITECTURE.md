# Architecture Research

**Domain:** Architectural hardening of existing AI dev platform (Cauldron v1.2)
**Researched:** 2026-04-01
**Confidence:** HIGH — based on direct reading of all integration-point source files

---

## System Overview

This is a brownfield hardening milestone. The architecture is already built. The task is
to close integrity gaps, plug race conditions, and fix cross-process communication. Every
recommendation below is grounded in the actual source files, not assumptions.

```
┌──────────────────────────────────────────────────────────────────────┐
│  User Entry Points                                                    │
│  ┌──────────────┐  ┌──────────────────────────────────────────────┐  │
│  │  CLI (Hono   │  │  Web Dashboard (Next.js :3000)               │  │
│  │  :3001)      │  │  tRPC routers -> publicProcedure (no auth    │  │
│  │              │  │  guard yet on most routes)                   │  │
│  └──────┬───────┘  └───────────────────┬──────────────────────────┘  │
└─────────┼─────────────────────────────┼─────────────────────────────┘
          │                             │
┌─────────▼─────────────────────────────▼──────────────────────────────┐
│  Engine (packages/engine)                                             │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ interview/ │  │ holdout/   │  │decomposition/│  │ execution/  │  │
│  │ FSM + amb  │  │ crypto.ts  │  │ scheduler.ts │  │ agent-runner│  │
│  │ scoring    │  │ vault.ts   │  │ completeBead │  │ merge-queue │  │
│  └────────────┘  └────────────┘  └──────────────┘  │ timeout-sup │  │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐  └─────────────┘  │
│  │ evolution/ │  │ gateway/   │  │ asset/       │                    │
│  │ evaluator  │  │ gateway.ts │  │ events.ts    │                    │
│  │ mutator    │  │ recordUsage│  │ job-store    │                    │
│  └────────────┘  └────────────┘  └──────────────┘                    │
└──────────────────────────────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────────────────┐
│  Shared (packages/shared) — PostgreSQL + Drizzle                    │
│  schema/: project, seed, bead, bead_edges, event, holdout,          │
│           llm_usage, asset_job, snapshot                             │
│  14 migrations (no unique constraint on sequence_number or seed     │
│  version; no cascade rules on FK deletions; no index on             │
│  bead_edges.to_bead_id or events.occurred_at)                       │
└─────────────────────────────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────────────────┐
│  Inngest (durable job runner, :8288)                                 │
│  Served by CLI Hono server (:3001) — separate from Next.js           │
│  Asset handlers: submit -> poll -> collect (3 retries)               │
│  onJobStatusChanged callback fires inside Inngest step               │
└─────────────────────────────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────────────────┐
│  MCP (packages/mcp) — separate stdio process                         │
│  Receives job status via: callback injection (configureAssetDeps)    │
│  PROBLEM: Inngest runs in CLI process; MCP runs in separate stdio    │
│  process. onJobStatusChanged cannot reach across the process gap.    │
│  notifyJobStatusChanged() -> server.server?.sendResourceUpdated()    │
│  is unreachable from the Inngest step context at runtime.            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

| Component | File(s) | Current State | Hardening Required |
|-----------|---------|---------------|-------------------|
| `events` table | `schema/event.ts` | No unique constraint on `(project_id, sequence_number)` | Add UNIQUE + two indexes |
| `seeds` table | `schema/seed.ts` | No unique constraint on `(project_id, parent_id, version)` | Add UNIQUE for parallel evolution safety |
| `beads` / `bead_edges` | `schema/bead.ts` | No FK cascade rules; no index on `bead_edges.to_bead_id` | Add cascade rules + reverse-lookup index |
| `holdout_vault` | `schema/holdout.ts` | No cascade rule from `seeds`; no KEK rotation infrastructure | Add cascade + rotation table |
| `MergeQueue` | `execution/merge-queue.ts` | Confidence detection is substring search; resolved content is full LLM response blob written to disk | Replace with `generateObject` + Zod schema for per-file resolution |
| `TimeoutSupervisor` | `execution/timeout-supervisor.ts` | Fires callbacks but never kills the child process | Add `kill(pid, 'SIGTERM')` in hard-timeout callback |
| `AgentRunner` | `execution/agent-runner.ts` | Creates TimeoutSupervisor but hard-timeout path does not terminate the agent process | Wire process kill via `killFn` parameter |
| `LLMGateway` | `gateway/gateway.ts` | `recordUsageAsync` is fire-and-forget (`void` + `.catch`); budget check reads stale totals under concurrency | Await usage write before returning from `generateText`/`generateObject` |
| `completeBead` | `decomposition/scheduler.ts` | `UPDATE beads SET status=...` without version condition on completion path | Add `AND version = expectedVersion` to WHERE clause |
| `projects.list` | `web/src/trpc/routers/projects.ts` | N+1: 2 extra queries per project row (latest event + cost total) | Replace with batch queries using `inArray()` |
| `tRPC init` | `web/src/trpc/init.ts` | `authenticatedProcedure` exists but all routers use `publicProcedure` | Switch mutation procedures to `authenticatedProcedure` |
| DAGCanvas | `packages/web/` | No React error boundary — uncaught render errors crash the entire dashboard | Wrap in `<ErrorBoundary>` |
| `crypto.ts` | `holdout/crypto.ts` | Single `HOLDOUT_ENCRYPTION_KEY` env var; no rotation, no audit trail | Add `kek_versions` table, version tagging on sealed payloads |
| MCP push notifications | `mcp/src/server.ts`, `engine/src/asset/events.ts` | `onJobStatusChanged` callback cannot reach across process boundary to separate MCP stdio process | Redis pub/sub bridges the gap |

---

## Build Order: Dependency-Driven Sequencing

The 15 items group into four layers. DB schema changes are a prerequisite to several
code changes. Within a layer, items are independent and can be parallelized.

### Layer 0 — DB Schema (prerequisite to everything else)

All schema changes ship as Drizzle migrations in `packages/shared/src/db/migrations/`.

**Batching recommendation: two migrations, not one monolith.**

Split rationale:
- Migration 1 (additive-only, low risk): new unique constraints and indexes. These only
  add objects; reverting is `DROP INDEX / DROP CONSTRAINT` with no data loss.
- Migration 2 (FK behavior change, higher risk): cascade delete rules and the new KEK
  rotation table. Cascade rules change what happens when a parent row is deleted —
  potentially destructive if orphan rows exist. Isolating this makes it safe to roll back
  without touching indexes.

**Migration 1 — Integrity Indexes (additive only):**

```sql
-- events: race condition on append-only sequence
ALTER TABLE events
  ADD CONSTRAINT events_project_sequence_unique UNIQUE (project_id, sequence_number);
CREATE INDEX idx_events_project_sequence ON events (project_id, sequence_number);
CREATE INDEX idx_events_project_occurred_at ON events (project_id, occurred_at);

-- seeds: parallel evolution safety
ALTER TABLE seeds
  ADD CONSTRAINT seeds_project_parent_version_unique
  UNIQUE (project_id, parent_id, version);

-- bead_edges: reverse-lookup for ready-bead query
CREATE INDEX idx_bead_edges_to_bead_id ON bead_edges (to_bead_id);
```

**Migration 2 — FK Cascades + KEK Rotation Table:**

```sql
-- Cascade deletes from seeds downward (not from projects — projects use soft-delete)
ALTER TABLE beads
  DROP CONSTRAINT beads_seed_id_fkey,
  ADD CONSTRAINT beads_seed_id_fkey
    FOREIGN KEY (seed_id) REFERENCES seeds(id) ON DELETE CASCADE;

ALTER TABLE bead_edges
  DROP CONSTRAINT bead_edges_from_bead_id_fkey,
  ADD CONSTRAINT bead_edges_from_bead_id_fkey
    FOREIGN KEY (from_bead_id) REFERENCES beads(id) ON DELETE CASCADE,
  DROP CONSTRAINT bead_edges_to_bead_id_fkey,
  ADD CONSTRAINT bead_edges_to_bead_id_fkey
    FOREIGN KEY (to_bead_id) REFERENCES beads(id) ON DELETE CASCADE;

ALTER TABLE holdout_vault
  DROP CONSTRAINT holdout_vault_seed_id_fkey,
  ADD CONSTRAINT holdout_vault_seed_id_fkey
    FOREIGN KEY (seed_id) REFERENCES seeds(id) ON DELETE CASCADE;

-- events and llm_usage cascade from project_id
ALTER TABLE events
  ADD CONSTRAINT events_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE llm_usage
  ADD CONSTRAINT llm_usage_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- KEK rotation audit table (new)
CREATE TABLE kek_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_label TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at TIMESTAMPTZ,
  audit_note TEXT
);
```

**Cascade vs. soft-delete design note:**
`projects` already uses soft-delete (`deleted_at` column). Cascading hard-deletes from
`projects` would be inconsistent with that model. Recommended pattern: keep soft-delete
at the `projects` level; add `ON DELETE CASCADE` on `seeds -> beads/edges/holdout/events`
so *seed deletion* cleans up cleanly, but project deletion remains soft-delete. This
preserves the existing UX while eliminating orphan rows from seed deletion paths.

---

### Layer 1 — Engine Code (no DB schema deps, independent of each other)

These changes read/write only existing columns and are safe to implement after Layer 0
migrations are applied (or in parallel by different developers).

**1a. MergeQueue — Structured JSON extraction**

File: `execution/merge-queue.ts`

Current problem: `resolveConflict()` sends a free-text prompt, detects confidence via
substring search (`responseText.includes('"confidence": "low"')`), and writes the entire
LLM response blob to disk as file content.

Fix: Replace `gateway.generateText()` with `gateway.generateObject()` using a Zod
schema:

```typescript
const ConflictResolutionSchema = z.object({
  confidence: z.enum(['high', 'low']),
  resolvedFiles: z.array(z.object({
    filePath: z.string(),
    content: z.string(),
  })),
  rationale: z.string().optional(),
});
```

The `resolveConflict` method then writes `result.object.resolvedFiles[i].content` to
`result.object.resolvedFiles[i].filePath` — not the full response blob. Confidence is
read from `result.object.confidence` directly.

Integration point: `gateway.ts` already has `generateObject<T>` — this is a call-site
change only, no gateway modification needed.

**1b. TimeoutSupervisor — Process kill on hard timeout**

Files: `execution/timeout-supervisor.ts`, `execution/agent-runner.ts`

Current problem: `onHardTimeout` callback fires but the supervisor has no reference to
the agent child process. The agent keeps running silently past the hard limit.

Fix: Add `killFn?: () => void` to `TimeoutCallbacks`. When `AgentRunner` starts a child
process via `childProcess.exec` or `childProcess.spawn`, the returned `ChildProcess`
object has a `.pid`. Pass `() => { if (pid) process.kill(pid, 'SIGTERM'); }` as the
kill function. The supervisor calls it from the hard-timeout timer.

**1c. LLMGateway — Synchronous usage recording**

File: `gateway/gateway.ts`

Current problem: `recordUsageAsync` is `void this.writeUsage(...).catch(...)`. Budget
check at the top of each call reads from the DB, but the current call's usage does not
land in the DB until after return. Under parallelism, two concurrent calls can both pass
the budget check before either has recorded usage, allowing budget overshoot.

Fix: In `generateText` and `generateObject` (the two blocking call paths), await
`this.writeUsage()` before returning. For `streamText` and `streamObject`, the `onFinish`
callback should be made `async` and await the usage write.

Note: This adds ~5ms latency per LLM call (two DB inserts). Acceptable versus LLM
response times of 100ms–10s.

**1d. completeBead — Optimistic locking on completion**

File: `decomposition/scheduler.ts`

Current problem: `completeBead()` updates `beads.status` without a version condition.
Inngest retries can race: two retries completing the same bead both succeed, the version
counter increments twice, and two `bead_completed` events are emitted.

Fix: Add `AND version = expectedVersion` to the WHERE clause in the completion UPDATE.
Add `expectedVersion: number` as a parameter to `completeBead()`. If 0 rows are updated,
return early without emitting the event.

**1e. Holdout failure rollback**

Files: `holdout/vault.ts` + crystallization call site in `interview/`

Current problem: If holdout generation or sealing fails after crystallization begins,
the seed may be left in `crystallized` status with no valid holdouts.

Fix: Wrap the `crystallize -> generate holdouts -> seal` sequence so that if
`sealHoldouts` fails, the seed status is rolled back to `draft`. Options: a DB
transaction covering the entire sequence, or explicit status rollback on catch. The
transaction option is cleaner but requires that all three operations share the same
DB connection/transaction scope.

---

### Layer 2 — Web Layer (independent of engine changes)

**2a. N+1 elimination in projects list**

File: `web/src/trpc/routers/projects.ts`

Current problem: `projects.list` fetches N projects then runs 2 extra queries per row
(latest event + cost total). For 20 projects that is 41 queries.

Fix: Replace the `Promise.all(rows.map(...))` loop with two batch queries:

```typescript
// Batch 1: latest event per project
const latestEvents = await ctx.db
  .select({ projectId: events.projectId, type: events.type, occurredAt: events.occurredAt })
  .from(events)
  .where(inArray(events.projectId, ids))
  // Use DISTINCT ON via raw sql or a subquery approach
  ...

// Batch 2: cost totals per project
const costTotals = await ctx.db
  .select({ projectId: llmUsage.projectId, total: sql<number>`SUM(${llmUsage.costCents})` })
  .from(llmUsage)
  .where(inArray(llmUsage.projectId, ids))
  .groupBy(llmUsage.projectId);
```

Merge both results into the project rows in JS. Total: 3 queries regardless of project
count. The `idx_events_project_occurred_at` index from Migration 1 makes both the per-
project latest-event lookup and batch query efficient.

**2b. Auth middleware on tRPC routes**

Files: `web/src/trpc/init.ts` + all 5 router files

Current state: `authenticatedProcedure` is implemented and enforces the
`CAULDRON_API_KEY` bearer token. All five routers use `publicProcedure` exclusively.
The auth system exists but is not wired to any route.

Fix: Swap `publicProcedure -> authenticatedProcedure` on mutation procedures (create,
archive, delete, updateSettings, start interview, crystallize, etc.). Query procedures
(list, byId) can remain public or be switched based on desired access model — recommend
switching all procedures to `authenticatedProcedure` for consistent protection.

This is a mechanical substitution — no new code beyond the import change in each router
file.

**2c. React error boundary around DAGCanvas**

File: `packages/web/` (DAGCanvas render site — identify exact path in execution phase)

Fix: Wrap the DAGCanvas component with a class-based `ErrorBoundary`. React 19 does not
yet have a hook-based boundary API. The boundary should render a degraded fallback (a
plain list of beads with status badges) when `@xyflow/react` throws during render or
layout. This prevents a canvas crash from taking down the entire dashboard route.

---

### Layer 3 — MCP Cross-Process IPC (most complex item, independent of Layers 1-2)

**Root cause analysis:**

```
CLI Process (Hono :3001)
  --> bootstrap() -> configureAssetDeps({ onJobStatusChanged: notifier })
       --> Inngest step fires -> onJobStatusChanged(jobId) -> [DEAD END]
                                                              MCP is a separate
                                                              stdio process —
                                                              the closure cannot
                                                              cross the process gap
```

The v1.1 design wired `onJobStatusChanged` as a module-level closure injected at
startup. This works only when MCP and Inngest run in the same process. The MCP package
runs as a separate `stdio` process (JSON-RPC over stdin/stdout), making the callback
injection physically unreachable at runtime.

**Candidate approaches:**

| Approach | How | Pros | Cons |
|----------|-----|------|------|
| **Redis pub/sub** | Inngest publishes to `cauldron:job-status`; MCP subscribes and calls `notifyJobStatusChanged` | Redis is already in docker-compose; ioredis is already in engine package | Adds ioredis dep to mcp package |
| **Shared-process (merge MCP into CLI)** | MCP server runs as a transport mode inside the CLI Hono process | Callback injection works in-process | Breaks stdio contract for Claude Desktop and other MCP clients; MCP spec recommends stdio isolation |
| **Polling (MCP client polls resource)** | Remove push notification; clients poll `cauldron://jobs/{jobId}/status` | Zero infra change; already implemented | Not a real fix for push; defeats the purpose |
| **Unix domain socket** | CLI creates UDS at `$TMPDIR/cauldron-mcp-notify.sock`; MCP connects and reads JSON lines | No new infra; no Redis dep in mcp | Must manage socket lifecycle (cleanup on exit, reconnect on disconnect) |

**Recommendation: Redis pub/sub.**

Redis is already a first-class dependency (ioredis for Inngest broker). The pattern:

```
Inngest step (CLI process)
  --> after job state transition
        --> redis.publish('cauldron:job-status',
              JSON.stringify({ jobId, status }))

MCP server (stdio process, at startup)
  --> redis.subscribe('cauldron:job-status')
        --> on message -> notifyJobStatusChanged(server, jobId)
```

Implementation scope:

- `packages/engine/src/asset/events.ts`: add optional `redis` subscriber to `AssetDeps`;
  publish to channel at each `onJobStatusChanged?.(jobId)` call site. Or replace the
  callback pattern entirely with direct Redis publish — both work, direct publish is
  simpler.
- `packages/mcp/src/bootstrap.ts`: create ioredis subscriber client, subscribe to
  `cauldron:job-status`, call `notifyJobStatusChanged(server, jobId)` on each message.
  Store subscriber in module scope so it is not GC'd.

Channel payload: `{ jobId: string, status: string }` — keep minimal. The MCP resource
handler already reads full job state from the DB on each read; the notification just
triggers the push, not the full payload.

Unix domain socket is the fallback if adding ioredis to the mcp package introduces
unacceptable complexity. The UDS approach requires a reconnect loop and socket file
cleanup but has zero new package dependencies.

---

## New vs. Modified: Explicit Accounting

| Item | File(s) Touched | New or Modified | Schema Change? |
|------|----------------|-----------------|----------------|
| Event sequence uniqueness | `schema/event.ts` + Migration 1 | Modified | Yes — Migration 1 |
| Events table indexes | `schema/event.ts` + Migration 1 | Modified | Yes — Migration 1 |
| Seed version uniqueness | `schema/seed.ts` + Migration 1 | Modified | Yes — Migration 1 |
| Reverse-lookup index on bead_edges | `schema/bead.ts` + Migration 1 | Modified | Yes — Migration 1 |
| FK cascade rules | `schema/bead.ts`, `seed.ts`, `holdout.ts`, `event.ts`, `llm-usage.ts` + Migration 2 | Modified | Yes — Migration 2 |
| KEK rotation table | New `schema/kek-version.ts` + Migration 2 | New | Yes — Migration 2 |
| Structured merge resolution | `execution/merge-queue.ts` | Modified | No |
| Timeout process kill | `execution/timeout-supervisor.ts`, `agent-runner.ts` | Modified | No |
| Synchronous usage recording | `gateway/gateway.ts` | Modified | No |
| Optimistic locking on completion | `decomposition/scheduler.ts` | Modified | No |
| Holdout failure rollback | `holdout/vault.ts` + interview crystallization call site | Modified | No |
| N+1 elimination | `web/trpc/routers/projects.ts` | Modified | No (uses existing indexes after Migration 1) |
| Auth middleware wiring | `web/trpc/routers/*.ts` | Modified | No |
| React error boundary | `web/src/app/` (DAGCanvas render site) | New (wrapper component) | No |
| MCP push via Redis | `engine/src/asset/events.ts`, `mcp/src/bootstrap.ts` | Modified | No (Redis already in compose) |

---

## Data Flow: Hardened Paths

### Bead completion (after hardening)

```
Inngest step signals bead done
  -> completeBead(db, beadId, status, projectId, seedId, expectedVersion)
       -> UPDATE beads SET status=X, version=version+1
          WHERE id=$id AND version=$expectedVersion AND status IN ('claimed','active')
       -> if 0 rows: concurrent completion already won -> return early, skip event
       -> if 1 row: emit bead_completed event
```

### Budget enforcement (after hardening)

```
gateway.generateText() called
  -> checkBudget(db, projectId, limit)     [reads current total]
  -> executeWithFailover(...)              [calls LLM]
  -> await writeUsage(...)                 [NOW synchronous — blocks before return]
  -> return result
```

### MCP push notification (after hardening)

```
Inngest step (CLI process)
  -> job state transition (pending->active, active->completed, etc.)
  -> redis.publish('cauldron:job-status', { jobId, status })

MCP process (stdio, running concurrently)
  -> redis subscriber receives message
  -> notifyJobStatusChanged(server, jobId)
  -> server.server?.sendResourceUpdated({ uri: 'cauldron://jobs/${jobId}/status' })
  -> connected MCP clients receive resource_updated notification
  -> clients re-read cauldron://jobs/${jobId}/status resource to get new state
```

### Event append (after Migration 1)

```
appendEvent(db, { projectId, ... })
  -> SELECT MAX(sequence_number) WHERE project_id = $id
  -> INSERT events (sequence_number = max + 1)
  -> DB enforces UNIQUE(project_id, sequence_number) at write time
  -> concurrent appends: one succeeds, one gets unique violation -> retry with new MAX
```

---

## Integration Points: Cross-Package Boundaries

| Boundary | Current Communication | Post-Hardening Change |
|----------|----------------------|----------------------|
| `engine` -> `shared` | Direct Drizzle schema imports, `appendEvent`, `llmUsage` | No change; Migration 1+2 add constraints the code benefits from automatically |
| `cli` -> `engine` | `bootstrap()` calls `configureAssetDeps` | Add `redis` publisher to `AssetDeps`; publish on job transitions |
| `mcp` -> `engine` | `getAssetJob` import for resource reads | Add Redis subscriber in `bootstrapMcp`; listen for push events |
| `cli` -> `mcp` | None (separate processes) | Redis channel bridges the gap |
| `web` -> `shared` | Drizzle queries via tRPC context | N+1 fix changes query shape; adds `inArray` import — no new package deps |
| `web` tRPC init -> routers | `publicProcedure` exported from `init.ts` | Routers switch to `authenticatedProcedure` — import change only |

---

## Scaling Considerations

| Scale | Architecture Note |
|-------|-------------------|
| Current (single-user dev) | All 15 items are correctness fixes, not throughput bottlenecks. Unique constraints and indexes are pure wins with no write-path penalty at this scale. |
| Multi-project concurrent use | Optimistic locking on bead completion and event sequence uniqueness become load-bearing under any parallel execution. Without them, Inngest retries cause double-events silently. |
| High bead throughput (10+ concurrent) | Making `recordUsageAsync` synchronous adds ~5ms per LLM call. Negligible versus LLM response latency of 100ms–10s. |
| Large projects list (100+ projects) | N+1 fix reduces 201 queries to 3. This matters even at 20 projects on a slow connection. |
| KEK rotation | No performance impact — rotation is an infrequent admin operation, not on the hot path. |

---

## Anti-Patterns Identified in Existing Code

### Anti-Pattern 1: Substring confidence detection in structured output

**What exists:** `responseText.includes('"confidence": "low"')` in `merge-queue.ts`
**Why wrong:** LLM responses are unpredictable. A high-confidence response could contain
an example of the low-confidence string in its rationale. Fragile across providers that
format JSON differently.
**Fix:** `generateObject` with Zod schema — `result.object.confidence` is typed and
guaranteed.

### Anti-Pattern 2: Fire-and-forget usage recording with pre-call budget check

**What exists:** `void this.writeUsage(...).catch(...)` — usage is recorded async,
budget check reads DB total at the top of each call before the current usage lands.
**Why wrong:** Under concurrency, two calls read the same "under budget" total and both
proceed, collectively exceeding the limit before either records usage.
**Fix:** Await usage write before returning from `generateText`/`generateObject`.

### Anti-Pattern 3: Completion update without version guard

**What exists:** `completeBead()` updates status with `WHERE id = $beadId` only.
**Why wrong:** Inngest retries can race. Two retries completing the same bead both
succeed and both emit `bead_completed`. Fan-in logic can miscount completed beads.
**Fix:** Add `AND version = expectedVersion` to the WHERE clause.

### Anti-Pattern 4: Monotonic counter without uniqueness constraint

**What exists:** `events.sequence_number` is `integer NOT NULL` with no UNIQUE constraint.
**Why wrong:** `appendEvent` computes `MAX(sequence_number) + 1` then inserts. Two
concurrent appends can read the same MAX and insert with the same sequence number,
silently breaking ordering guarantees.
**Fix:** `UNIQUE (project_id, sequence_number)` constraint + index.

### Anti-Pattern 5: Cross-process callback injection

**What exists:** `onJobStatusChanged` callback injected via `configureAssetDeps` assumes
caller and handler share the same process memory.
**Why wrong:** MCP server is a separate stdio process; the closure cannot cross the OS
process boundary. Notifications silently never fire in production.
**Fix:** Redis pub/sub as the cross-process message bus.

---

## Sources

- Direct reading of source files (confidence: HIGH — no inference):
  - `/packages/shared/src/db/schema/*.ts` — all 10 schema files
  - `/packages/engine/src/execution/merge-queue.ts`
  - `/packages/engine/src/execution/timeout-supervisor.ts`
  - `/packages/engine/src/execution/agent-runner.ts`
  - `/packages/engine/src/gateway/gateway.ts`
  - `/packages/engine/src/decomposition/scheduler.ts`
  - `/packages/engine/src/asset/events.ts`
  - `/packages/engine/src/holdout/crypto.ts`
  - `/packages/mcp/src/server.ts`
  - `/packages/mcp/src/bootstrap.ts`
  - `/packages/mcp/src/resources/job-status.ts`
  - `/packages/web/src/trpc/routers/projects.ts`
  - `/packages/web/src/trpc/init.ts`
  - `/packages/cli/src/engine-server.ts`
- `.planning/PROJECT.md` — v1.2 milestone requirements and existing architecture decisions

---
*Architecture research for: Cauldron v1.2 Architectural Hardening*
*Researched: 2026-04-01*
