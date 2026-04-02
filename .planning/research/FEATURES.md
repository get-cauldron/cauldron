# Feature Research

**Domain:** Architectural hardening of an AI dev platform (Cauldron v1.2)
**Researched:** 2026-04-01
**Confidence:** HIGH (patterns verified against official docs and production references)

---

## Context: What This Milestone Is

v1.2 is not adding user-facing features. It is fixing 15 known defects that will cause data corruption, silent failures, or security exposure under concurrency and growth. Every item is a correctness fix. The framing below uses:

- **Table stakes** — required for correctness in any production system at this stage
- **Differentiators** — the specific approach chosen over naive alternatives
- **Anti-features** — patterns that look like solutions but create new problems

Features are grouped by category to clarify implementation ordering and phase boundaries.

---

## Feature Landscape by Category

### Category A: Data Integrity (DB Constraints and Indexes)

**Issues addressed:** #2 event sequence uniqueness, #3 events table indexes, #5 seed version collision, #8 foreign key cascades, #14 bead_edges reverse-lookup index

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| UNIQUE(project_id, sequence_number) on events | Any event-sourced system with per-aggregate ordering guarantees requires uniqueness enforcement at DB level. Application-level checks have a TOCTOU race window. | LOW | Single Drizzle migration: `unique().on(events.projectId, events.sequenceNumber)`. The column exists; the constraint does not. |
| Composite indexes on events (project_id + sequence_number; project_id + occurred_at) | Every event query is a full-table scan without indexes. Two query patterns exist: replay by sequence, dashboard by timestamp. | LOW | `index('events_proj_seq').on(events.projectId, events.sequenceNumber)` and `index('events_proj_ts').on(events.projectId, events.occurredAt)`. Both in one migration. |
| UNIQUE(parent_id, version) on seeds | Parallel evolution workers race to INSERT the same version number under the same parent seed. Only a DB constraint prevents duplicate versions. | LOW | NULL parent_id must be permitted (root seeds). Use `ON CONFLICT (parent_id, version) DO NOTHING` with RETURNING to detect collisions cleanly. PostgreSQL 15+ `NULLS NOT DISTINCT` is available but not required — application guard for root seeds is simpler. |
| Index on bead_edges.to_bead_id | DAG traversal queries both directions: forward (from_bead_id) and reverse (to_bead_id). Drizzle does not auto-index FK columns. The reverse direction is unindexed. | LOW | `index('bead_edges_to_idx').on(beadEdges.toBeadId)`. Fan-in synchronization and topological sort both use this path. |
| Cascade strategy for foreign keys | `ON DELETE NO ACTION` with no application-level cleanup silently accumulates orphan rows on any parent deletion. Production systems choose one explicit strategy and enforce it. | MEDIUM | Hybrid: `ON DELETE CASCADE` for structural child rows with no independent meaning (bead_edges, holdout_vault, events). Soft-delete (deleted_at column already exists on projects) for business objects where audit trails matter (seeds, beads, interviews). Events table: tombstone event rather than physical cascade delete — event log is the source of truth. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| INSERT ... ON CONFLICT for seed version | Atomic conflict detection at DB level. No separate SELECT + INSERT race. Workers detect collision and retry with a new version number without separate roundtrips. | LOW | `INSERT INTO seeds (...) ON CONFLICT (parent_id, version) DO NOTHING RETURNING id` — if RETURNING is empty, conflict occurred. |
| Soft-delete with partial index on seeds and beads | Seeds are immutable by design; hard deletion destroys lineage. Partial index `WHERE deleted_at IS NULL` keeps query performance equivalent to hard-delete while retaining audit trail. | MEDIUM | Evil Martians pattern for PostgreSQL soft-delete. The project already has deleted_at on projects; extend the pattern to seeds and beads. |
| FK index alongside CASCADE | CASCADE DELETE without an index on the FK column causes a sequential scan on every parent deletion. Add the index before enabling cascade or performance degrades proportionally to child row count. | LOW | Critical: index bead_edges.from_bead_id and bead_edges.to_bead_id, events.project_id, holdout_vault.seed_id before adding cascade constraints. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Application-level uniqueness check before insert | Feels safer | Classic TOCTOU race: check and insert are non-atomic; another process inserts between them | DB-level UNIQUE constraint + ON CONFLICT handling |
| ON DELETE CASCADE everywhere | Feels simple | Silently destroys audit data on accidental project deletion; cascade is 33x slower than soft-delete at high concurrency | Hard cascade only for structural rows; soft-delete for business objects |
| Global sequence number across all projects | Single ordering guarantee | Contention bottleneck — every project blocks on the same sequence counter | Per-project UNIQUE(project_id, sequence_number) is sufficient for replay ordering within a project |

---

### Category B: Concurrency Safety (Locking and Sequencing)

**Issues addressed:** #10 optimistic locking on bead completion, #5 seed version collision (also Category A)

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Version-conditioned UPDATE on bead completion | The beads.version column exists (DAG-08) but the completion path does not enforce `WHERE version = $expected`. Two Inngest workers racing on the same bead can both write completed status. | LOW | `UPDATE beads SET status = 'completed', version = version + 1, completed_at = now() WHERE id = $id AND version = $expected AND status = 'active'`. Check rows_affected; 0 = conflict. |
| Conflict detection with explicit error return | Version-conditioned updates alone are insufficient. The caller must handle 0-rows-affected as an explicit conflict signal and either retry or escalate. Silent success on 0 rows is the same bug in a different place. | LOW | Return a typed `{ conflict: true }` result from the update function. Do not throw — callers need to distinguish conflict from failure. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Optimistic locking over SELECT FOR UPDATE | No lock contention in the common case (no conflict). Scales horizontally. SELECT FOR UPDATE serializes all writers on the same row and creates deadlock risk under parallel bead execution. | LOW | The existing bead claiming path correctly uses pessimistic locking for claiming (competing workers). Completion is different — only one worker should reach completion, so optimistic locking is appropriate. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| SELECT FOR UPDATE on bead completion | "Obvious" solution to races | Holds a lock across Inngest step boundaries; serializes all bead completions; deadlock risk under fan-in | Version-conditioned UPDATE; pessimistic lock only for initial claiming |
| Retry loop on conflict without backoff | Simple to implement | Under high contention, spinlocks starve other workers | Exponential backoff with jitter; or Inngest retry with backoff built in |

---

### Category C: Reliability (Timeout Enforcement and Error Handling)

**Issues addressed:** #6 timeout supervisor kills nothing, #7 holdout failure silently swallowed, #9 fire-and-forget usage recording, #1 structured LLM output for merge conflicts

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Enforced agent process termination on hard timeout | `TimeoutSupervisor` sets status flags and fires callbacks but holds no process reference. `onHardTimeout` fires into a void — nothing is killed. Hung agents run forever. | MEDIUM | TimeoutSupervisor needs a kill target: `setKillTarget(proc: ChildProcess)`. `onHardTimeout`: `proc.kill('SIGTERM')` then after 5s grace period `proc.kill('SIGKILL')`. SIGKILL is kernel-enforced and cannot be caught, blocked, or ignored. Must read `agent-runner.ts` before implementing — supervisor must receive the spawned ChildProcess reference. |
| Holdout failure propagated as transactional rollback | Crystallization that succeeds but whose holdout sealing fails leaves a seed with no test coverage. The pipeline treats this as success. Silent data corruption. | MEDIUM | Wrap `crystallizeSeed()` + `sealHoldout()` in a single Drizzle transaction: `db.transaction(async (tx) => { await crystallizeSeed(tx, ...); await sealHoldout(tx, ...); })`. If holdout fails, seed crystallization rolls back. Both share the same tx connection. Alternatively: compensating delete of the vault entry in a catch block before re-throwing. |
| Synchronous usage recording before response return | Fire-and-forget usage recording allows a request to exceed the project budget before the record is committed, breaking the kill switch. | LOW | `await recordUsage(...)` before `return result` in the gateway. LLM response latency dwarfs a DB write — the added latency is not measurable. Remove the `void` / unawaited call pattern. |
| Structured JSON extraction for merge conflict resolution | `resolveConflict()` writes the entire LLM response text as the resolved file content. LLM responses contain explanation prose, markdown fences, and multi-file delimiters mixed with code. Files become unparseable. | MEDIUM | Replace `gateway.generateText()` with `generateObject()` (Vercel AI SDK 6 `Output.object()`) using a Zod schema: `z.object({ confidence: z.enum(['high', 'low']), files: z.array(z.object({ path: z.string(), content: z.string() })) })`. Parse result to get per-file content; write each `file.content` to `file.path`. The SDK validates against the schema — no manual prose-stripping or regex needed. `confidence` field replaces string-scanning heuristics. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Process group termination (kill -pgid) on timeout | A single SIGKILL to the root PID leaves orphaned subprocesses if the agent spawned children. Killing the process group terminates the entire tree. | LOW | Requires spawning with `detached: true`. Then: `process.kill(-child.pid, 'SIGKILL')` — negative PID kills the process group. |
| Zod schema as conflict resolution contract | The schema doubles as documentation and a type-safe interface. If the LLM fails to produce a valid response, `AI_NoObjectGeneratedError` is thrown explicitly — no silent bad data. | LOW | `Output.object({ schema: z.object({...}) })` pattern verified in Vercel AI SDK 6 docs. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| AbortController-only timeout | Cleaner API | Cancels the HTTP request but leaves a spawned subprocess consuming CPU/memory; supervisor needs both | AbortController for the API call + SIGTERM/SIGKILL for the process |
| Async usage recording queue | "More scalable" | Introduces ordering complexity and a failure mode where queued records are lost before commit; budget accuracy degrades | Synchronous await; batch-insert at request end only if latency becomes a measured problem |
| Regex-based confidence detection in LLM text | Already implemented | String-scanning for `"confidence": "low"` in prose is fragile; LLMs rephrase; false positives escalate valid resolutions | Zod schema with `confidence: z.enum(['high', 'low'])` — exact value, type-validated |

---

### Category D: Security (Auth and Crypto)

**Issues addressed:** #11 KEK as env var with no rotation, #12 all tRPC routes are publicProcedure

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| isAuthed middleware creating protectedProcedure | Every route is `publicProcedure`. Any caller with network access can invoke project deletion, seed crystallization, holdout operations. Auth at the context level alone has no enforcement point. | MEDIUM | Standard tRPC pattern: `const isAuthed = t.middleware(async ({ ctx, next }) => { if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' }); return next({ ctx: { user: ctx.user } }); })`. Export `protectedProcedure = t.procedure.use(isAuthed)`. Apply to all mutation routes and sensitive query routes. For v1.2 single-operator local use: API key in env var, checked in `createContext`. |
| KEK version tracking in holdout_vault schema | Key rotation without version tracking means DEKs encrypted under rotated-out keys cannot be decrypted. The schema must store which KEK version encrypted each DEK. | LOW | Add `kek_version` integer column to `holdout_vault`. This is the schema prerequisite for rotation — not rotation itself. One migration. |
| KEK rotation procedure with atomic re-encryption | Current KEK lives in an env var with no rotation path. A single key compromise exposes all holdout tests permanently. Rotation re-encrypts all DEKs under the new KEK. | HIGH | Load old KEK, load new KEK. For each vault entry in a transaction: decrypt DEK with old KEK, re-encrypt with new KEK, update row with new ciphertext and kek_version. Wrap each row update in the same transaction. Log rotation event (operator, from_version, to_version, timestamp). NIST recommends annual rotation minimum; quarterly for sensitive data. |
| Rotation audit log table | Cryptographic operations require a verifiable audit trail of who rotated what and when. | LOW | Append-only table: `(id, kek_version_from, kek_version_to, operator_id, occurred_at)`. Never delete rows. No sensitive data stored — only metadata. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Envelope encryption rotation (DEK re-encrypt only) | Rotation re-encrypts only the DEK (small). Ciphertext (potentially large) is never touched. This is the AWS KMS and Google Cloud KMS pattern — zero-downtime rotation at any scale. | MEDIUM | DEK is already in the schema (encrypted_dek column). Adding kek_version unlocks full rotation. No schema change to ciphertext column. |
| Zero-downtime rotation via parallel KEK window | Load both old and new KEK during rotation. After all rows updated, retire old KEK. No request fails during the rotation window. | MEDIUM | Standard envelope encryption rotation. The re-encryption script is a one-time admin utility, not a hot path. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Rotating the env var and redeploying | Feels like rotation | Requests in-flight during redeploy fail to decrypt; hard cutover window; no audit trail | Versioned KEK in DB with atomic re-encryption procedure |
| External KMS (AWS KMS, HashiCorp Vault) as immediate fix | Correct long-term solution | Adds external infrastructure dependency for a local-first single-developer platform at v1.2 | Local versioned KEK rotation is correct and complete for v1.2; external KMS belongs in v2 when cloud deployment is in scope |
| Auth only in tRPC context (no middleware) | "Already partially done" | Context-only auth has no enforcement point — a caller bypassing context setup can invoke any procedure | Explicit `isAuthed` middleware applied as base procedure |

---

### Category E: Performance (Query Optimization)

**Issues addressed:** #4 N+1 query pattern in projects list

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Single-query projects list with lateral joins | `projects.list` fires N+2 queries (1 for projects + 1 per project for latest event + 1 per project for cost). At 20 projects = 41 queries. Any list view that degrades linearly with row count will be visibly slow by 50+ projects. | MEDIUM | Replace the `Promise.all(rows.map(...))` loop with a single query: `SELECT p.*, last_event.type, last_event.occurred_at, costs.total FROM projects p LEFT JOIN LATERAL (SELECT type, occurred_at FROM events WHERE project_id = p.id ORDER BY occurred_at DESC LIMIT 1) last_event ON true LEFT JOIN (SELECT project_id, COALESCE(SUM(cost_cents), 0) as total FROM llm_usage GROUP BY project_id) costs ON costs.project_id = p.id`. Drizzle's `sql` tag supports this. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Lateral join over subquery per row | LATERAL is evaluated once per project row, not as a correlated subquery per column. Correct execution plan, consistent semantics, readable SQL. | LOW | PostgreSQL has supported LATERAL since 9.3. Drizzle supports it via the `sql` tag for raw fragments. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| DataLoader / request-level batching | Popularized by GraphQL | Adds a dependency and async coordination for a problem a single JOIN already solves in SQL | Single query with lateral join; DataLoader is appropriate when N+1 crosses service or process boundaries |
| Materialized view for project summary | Correct for very high read volume | Adds cache invalidation complexity; the projects list is not a hot enough path at v1.2 scale to justify it | Lateral join query; optimize further if profiling shows a need |

---

### Category F: Architecture (IPC and Error Boundaries)

**Issues addressed:** #13 React error boundaries around DAGCanvas, #15 MCP push notifications unreachable across processes

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| React error boundary wrapping DAGCanvas | `@xyflow/react` canvas rendering throws on malformed edge data or layout failures. Without a boundary, the entire dashboard unmounts. DAG visualization is the highest-risk rendering surface — complex data, third-party WebGL canvas. | LOW | Wrap `<DAGCanvas />` in `react-error-boundary`'s `<ErrorBoundary fallbackRender={...}>`. Show a fallback that lists beads as text with a retry button. `react-error-boundary` (bvaughn) is the standard library — avoids class component boilerplate, TypeScript-native, React 19 compatible. |
| Redis Pub/Sub for cross-process MCP push notifications | `notifyJobStatusChanged()` calls `server.sendResourceUpdated()` which only works if the Inngest handler and MCP server share the same process. They don't. The MCP server is a stdio process; Inngest handlers run in the Hono server (port 3001). Notifications are silently dropped. | MEDIUM | Redis Pub/Sub via ioredis (already in the stack). Pattern: Inngest handler publishes to `mcp:job:{jobId}:status`. MCP bootstrap subscribes on startup and calls `notifyJobStatusChanged(server, jobId)` when a message arrives. Channel naming by jobId enables selective subscription. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Granular error boundary placement (not app-root only) | A root boundary catches everything but degrades the entire app on any component failure. Wrapping only DAGCanvas isolates failures to the visualization panel — the rest of the dashboard stays functional. | LOW | Three-level boundary strategy: root (catastrophic failures), route-level (keeps navigation alive), component-level (high-risk surfaces like DAGCanvas). |
| Redis channel namespaced by jobId | Subscribers filter to only their job's events without deserializing all messages. As job volume grows, each MCP subscriber subscribes only to its active jobs. | LOW | Pattern: `mcp:job:{jobId}:status` — one channel per job. MCP server subscribes when a job is created, unsubscribes when it reaches a terminal state. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Shared process for MCP and web server | Eliminates IPC problem entirely | Breaks architectural boundary between tool surface (MCP) and operator UI (web). They have different uptime, scaling, and process lifecycles. | Redis Pub/Sub keeps processes separate |
| WebSockets for MCP↔web notifications | "Real-time native" | Project deliberately chose SSE over WebSockets (AI SDK useChat compatibility, no bidirectional need). Introducing WebSockets for IPC contradicts this decision. | Redis Pub/Sub fan-out into the existing SSE infrastructure |
| Polling from MCP for job updates | "Simpler than pub/sub" | Defeats the purpose of push notifications. Increases DB load. Makes delivery non-deterministic. | Redis Pub/Sub — ioredis is already in the stack, zero new dependencies |

---

## Feature Dependencies

```
[KEK version tracking in holdout_vault schema]
    └──required-by──> [KEK rotation procedure with re-encryption]
                          └──required-by──> [Rotation audit log table]

[UNIQUE(project_id, sequence_number) on events]
    └──enables──> [Event replay correctness under concurrent appends]

[UNIQUE(parent_id, version) on seeds]
    └──enables──> [Parallel evolution worker safety]

[Version-conditioned UPDATE on bead completion]
    └──requires──> [beads.version column — already present (DAG-08)]
                       no schema change needed

[Redis Pub/Sub IPC for MCP push notifications]
    └──requires──> [ioredis — already in stack]
    └──requires──> [MCP bootstrap receives a Redis subscriber client]

[isAuthed tRPC middleware]
    └──requires──> [ctx.user or ctx.apiKey populated in createContext]
    └──enables──> [protectedProcedure applied to all mutation routes]

[Holdout failure transactional rollback]
    └──requires──> [crystallize + sealHoldout share a Drizzle transaction scope]
    └──requires──> [reading crystallize call site in holdout/ before planning]

[Structured conflict resolution (generateObject)]
    └──requires──> [gateway exposes generateObject or Output.object()]
    └──breaks──> [string-scanning confidence heuristic (to be removed)]

[Enforced timeout supervisor]
    └──requires──> [AgentRunner passes ChildProcess reference to TimeoutSupervisor]
    └──requires──> [reading agent-runner.ts before planning — process lifecycle unknown]
```

### Dependency Notes

- **Timeout supervisor requires reading agent-runner.ts first.** The process lifecycle and spawn mechanism are unknown from the schema alone. Per `feedback_read_code_before_planning.md`, this file must be read before writing the implementation plan.
- **Holdout rollback requires reading the crystallize call site.** The transaction boundary depends on whether crystallize currently owns a transaction or is called within one. Do not assume.
- **KEK version tracking is a hard prerequisite for rotation.** The rotation procedure cannot be written until the schema records kek_version per vault row.
- **Redis Pub/Sub for MCP IPC reuses existing infrastructure.** ioredis is already in the stack. The MCP bootstrap is the only integration point.
- **Optimistic locking on bead completion is enforcement-only.** The version column exists. No schema migration. Read and write path change only.

---

## Phase Grouping for Roadmap

Group by risk profile and test surface, not just category.

### Phase 1 — Schema Migrations (Low Risk, No Logic Changes)

- Event sequence UNIQUE constraint
- Events composite indexes
- Seed version UNIQUE constraint
- bead_edges reverse-lookup index

Rationale: Pure migrations. Reversible. Verified with `pnpm db:migrate` + integration tests. No application logic changes.

### Phase 2 — Concurrency and Performance (Logic Changes, Clear Test Coverage)

- Optimistic locking on bead completion
- Synchronous usage recording
- N+1 query elimination in projects list

Rationale: Logic changes with clear before/after test coverage. No new infrastructure.

### Phase 3 — Reliability (Process Boundaries and Transactions)

- Enforced timeout supervisor with SIGTERM + SIGKILL
- Holdout failure transactional rollback
- React error boundary around DAGCanvas

Rationale: Requires reading agent-runner.ts and crystallize call site first. Transaction wrapping needs failure-path test coverage.

### Phase 4 — FK Cascade Strategy

- Cascading deletes / soft-delete enforcement for foreign keys

Rationale: Events table tombstone event decision must be made before this phase. Separate from Phase 1 to avoid conflating schema additions with cascade behavior changes.

### Phase 5 — Auth Middleware

- protectedProcedure on all tRPC routes

Rationale: Requires deciding what "auth" means for local-first single-operator use. Risk of breaking CLI ↔ web integration if context threading is wrong. Isolate to a single phase.

### Phase 6 — Structured Conflict Resolution

- Replace string-scanning with generateObject per-file JSON extraction

Rationale: Isolated to merge-queue.ts and the gateway interface. Can be done independently once the gateway's generateObject path is confirmed.

### Phase 7 — KEK Rotation Infrastructure

- kek_versions schema, holdout_vault FK, audit log, re-encryption utility

Rationale: Highest complexity. Touches encryption, schema, and requires a standalone CLI utility command. Do after all other phases are stable so this does not gate unrelated fixes.

### Phase 8 — MCP IPC Architecture

- Redis Pub/Sub for cross-process push notifications

Rationale: Architectural change to MCP bootstrap. Requires changes in two processes (Inngest handler and MCP server). Isolated last because it has the most cross-package surface area.

---

## Feature Prioritization Matrix

All 15 items are P1. This milestone has no P2/P3 items — every issue is a documented production defect.

| Feature | Correctness Risk If Missing | Implementation Cost | Phase |
|---------|-----------------------------|---------------------|-------|
| Version-conditioned bead completion | HIGH — silent lost updates under parallel execution | LOW | 2 |
| UNIQUE constraint on events sequence | HIGH — event replay correctness broken under concurrency | LOW | 1 |
| Holdout failure transactional rollback | HIGH — seeds with no test coverage silently succeed | MEDIUM | 3 |
| Enforced timeout supervisor | HIGH — hung agents never terminated | MEDIUM | 3 |
| Synchronous usage recording | HIGH — budget kill switch accuracy broken | LOW | 2 |
| Structured conflict resolution JSON extraction | HIGH — LLM prose written to source files | MEDIUM | 6 |
| UNIQUE constraint on seed versions | HIGH — parallel evolution produces duplicate versions | LOW | 1 |
| isAuthed tRPC middleware | HIGH — all operations publicly accessible | MEDIUM | 5 |
| Cascade / soft-delete FK strategy | MEDIUM — orphan rows accumulate silently | MEDIUM | 4 |
| KEK rotation infrastructure | MEDIUM — key compromise is permanent without rotation | HIGH | 7 |
| Redis Pub/Sub MCP IPC | MEDIUM — push notifications silently dropped | MEDIUM | 8 |
| N+1 query elimination | MEDIUM — degrades at 20+ projects | LOW | 2 |
| Events composite indexes | MEDIUM — query performance degrades with volume | LOW | 1 |
| React error boundary (DAGCanvas) | MEDIUM — dashboard crash on render error | LOW | 3 |
| bead_edges reverse-lookup index | LOW — DAG traversal slows at scale | LOW | 1 |

---

## Sources

- [Vercel AI SDK — Generating Structured Data (generateObject / Output.object)](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)
- [tRPC Authorization — isAuthed middleware pattern](https://trpc.io/docs/server/authorization)
- [SoftwareMill: Event Sourcing with PostgreSQL — UNIQUE(stream_id, version)](https://softwaremill.com/implementing-event-sourcing-using-a-relational-database/)
- [Drizzle ORM — Indexes and Constraints](https://orm.drizzle.team/docs/indexes-constraints)
- [ByteByteGo: Optimistic Locking — WHERE version=N UPDATE](https://blog.bytebytego.com/p/optimistic-locking)
- [Node.js child_process — kill, SIGTERM, SIGKILL](https://nodejs.org/api/child_process.html)
- [Evil Martians: Soft deletion with PostgreSQL](https://evilmartians.com/chronicles/soft-deletion-with-postgresql-but-with-logic-on-the-database)
- [Yellow Duck: Why FK indexing matters for CASCADE DELETE](https://www.yellowduck.be/posts/why-indexing-foreign-key-columns-matters-for-cascade-deletes-in-postgresql)
- [Foreign Keys vs Performance — CASCADE DELETE story (2026)](https://medium.com/@thyagodoliveiraperez/foreign-keys-vs-performance-part-3-the-cascade-delete-story-aac5cabd843b)
- [Redis Pub/Sub — official docs](https://redis.io/docs/latest/develop/pubsub/)
- [LogRocket: Using Redis Pub/Sub with Node.js](https://blog.logrocket.com/using-redis-pub-sub-node-js/)
- [react-error-boundary (bvaughn)](https://github.com/bvaughn/react-error-boundary)
- [OWASP Node.js Cryptography Practices](https://www.nodejs-security.com/blog/owasp-nodejs-authentication-authorization-cryptography-practices)
- [Drizzle ORM — Joins](https://orm.drizzle.team/docs/joins)

---

*Feature research for: Cauldron v1.2 architectural hardening*
*Researched: 2026-04-01*
