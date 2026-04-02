# Project Research Summary

**Project:** Cauldron v1.2 — Architectural Hardening
**Domain:** Brownfield correctness hardening of an AI orchestration platform
**Researched:** 2026-04-01
**Confidence:** HIGH

## Executive Summary

Cauldron v1.2 is a pure correctness milestone — 15 documented defects in a working v1.1 system that will cause data corruption, silent failures, or security exposure under real concurrency. There are no new user-facing features. Every item is a production-grade requirement that was deferred during greenfield development and must be closed before the platform handles parallel agent workloads reliably. The research confirms that all 15 fixes are well-understood problems with established solutions; none require novel approaches or external infrastructure beyond what is already in the stack.

The recommended approach groups work into four dependency layers: DB schema migrations first (prerequisite to everything else), then engine-layer logic fixes, web-layer changes, and finally the MCP cross-process IPC refactor as the most complex isolated item. The only new dependency is `react-error-boundary` for the web package — all other fixes use existing packages. The most critical correctness risk items are the event sequence uniqueness constraint, optimistic locking on bead completion, synchronous usage recording, and holdout failure rollback — these four have the highest silent corruption potential and lowest implementation cost.

The primary risks are migration-time: adding UNIQUE constraints to tables that may already have duplicate rows from prior concurrent test runs, accidentally applying CASCADE DELETE to audit tables (`llm_usage`, `events`) that should survive project deletion with SET NULL, and the PostgreSQL NULL-in-UNIQUE footgun that requires a partial index for the seed version constraint. KEK rotation is the highest-complexity item and has a genuine in-flight decryption hazard that requires a two-phase rotation window; it should be implemented last after all other phases are stable.

## Key Findings

### Recommended Stack

The hardening milestone requires only one new package: `react-error-boundary ^4.1.2` for the web layer. All other fixes use packages already present in the monorepo. The AI SDK `generateText` + `Output.object()` API replaces the deprecated `generateObject` for structured LLM output extraction. Node.js built-in `child_process.kill()` handles process termination. The existing `ioredis` connection bridges MCP cross-process IPC via Redis pub/sub. Drizzle's `unique()` and `index()` table-level declarations generate correct constraint migrations via `drizzle-kit generate`.

**Core technologies:**
- `generateText` + `Output.object({ schema })` (ai ^6.0.138, already installed): Structured LLM JSON extraction — `generateObject` is deprecated in AI SDK 6; this is the forward-compatible replacement
- `Drizzle unique()/index()` + `drizzle-kit generate` (drizzle-orm ^0.45, already installed): Schema constraint migrations — declarative syntax with correct `ALTER TABLE ADD CONSTRAINT` generation
- `child_process.kill('SIGTERM')` + `SIGKILL` two-phase (Node.js built-in): Agent process termination on hard timeout — two-phase handles processes that catch or ignore SIGTERM
- `ioredis` Redis pub/sub (already installed): Cross-process MCP push notifications — bridges Inngest CLI process to MCP stdio process with zero new infrastructure
- `react-error-boundary ^4.1.2` (new addition, web package only): React error boundaries around DAGCanvas — React 19 still requires class components for error boundaries; this library wraps the pattern with TypeScript-native API and `useErrorBoundary` hook

### Expected Features

All 15 items are P1. This milestone has no P2/P3 items — every issue is a documented production defect.

**Must have (table stakes — highest silent corruption risk):**
- UNIQUE(project_id, sequence_number) on events — event replay correctness broken under any concurrent appends
- Version-conditioned UPDATE on bead completion — Inngest retries silently double-complete beads without this
- Synchronous usage recording — budget kill switch is inaccurate under parallel LLM calls
- Holdout failure transactional rollback — seeds with no test coverage silently succeed crystallization
- Enforced timeout supervisor kill (SIGTERM + SIGKILL) — hung agents run forever past hard limit
- Structured JSON extraction for merge conflict resolution — LLM prose written directly to source files currently
- isAuthed tRPC middleware enforced on all mutation routes — all operations publicly accessible with no enforcement

**Should have (important but lower silent-failure risk):**
- FK cascade strategy (CASCADE vs. SET NULL per table type) — orphan rows accumulate silently on deletion
- KEK rotation infrastructure — key compromise is permanent without rotation path
- Redis Pub/Sub MCP IPC — push notifications silently dropped across process boundary
- N+1 query elimination in projects list — degrades linearly past 20 projects
- Events composite indexes — full-table scans on all event queries

**Infrastructure prerequisites (schema + index):**
- UNIQUE(parent_id, version) partial index on seeds — parallel evolution workers race on version numbers
- bead_edges reverse-lookup index — DAG traversal reverse direction is unindexed
- React error boundary around DAGCanvas — entire dashboard crashes on any canvas render error

**Defer (out of scope for v1.2):**
- External KMS (AWS KMS, HashiCorp Vault) — local versioned KEK is complete for single-operator v1.2 use; cloud KMS belongs in a future deployment milestone
- DataLoader / request batching — problem solved at SQL level; DataLoader adds dependency for an already-solved problem
- Materialized view for project summary — not a hot enough read path at v1.2 scale to justify cache invalidation complexity

### Architecture Approach

The system is already built; this milestone closes integrity gaps across four layers. The dependency order is strict: DB schema migrations (Layer 0) must apply before engine code changes can rely on the new constraints and indexes (Layer 1). Web-layer changes (Layer 2) are independent of engine changes and can proceed in parallel. MCP cross-process IPC (Layer 3) is the most architecturally isolated item — touches the fewest existing files, no inbound dependencies, but does require adding `ioredis` to the `mcp` package.

**Major components and hardening responsibilities:**
1. `packages/shared/src/db/schema/` + migrations — Two migrations: Migration 1 (additive unique constraints and indexes, low risk, reversible) and Migration 2 (FK cascade rules + KEK rotation table, higher risk, requires full FK graph mapping before writing)
2. `packages/engine/src/execution/` and `packages/engine/src/gateway/gateway.ts` — Four independent engine fixes: structured LLM output (merge-queue.ts), process kill (timeout-supervisor.ts + agent-runner.ts), synchronous usage recording (gateway.ts), optimistic locking (scheduler.ts)
3. `packages/web/src/trpc/routers/` and DAGCanvas render site — Two web fixes: auth middleware wiring (mechanical import swap) and error boundary wrapping
4. `packages/holdout/vault.ts` + interview crystallization call site — Transactional rollback wrapping crystallize + seal into a single DB transaction
5. `packages/engine/src/asset/events.ts` + `packages/mcp/src/bootstrap.ts` — Redis pub/sub cross-process IPC replacing the unreachable callback injection pattern
6. `packages/shared/src/db/schema/kek-version.ts` (new) + rotation utility — KEK rotation infrastructure with two-phase re-encryption and append-only audit trail

### Critical Pitfalls

1. **UNIQUE constraint migration fails on existing duplicate sequence numbers** — Run `SELECT project_id, sequence_number, COUNT(*) FROM events GROUP BY project_id, sequence_number HAVING COUNT(*) > 1` against the dev and test DBs before running the migration. If duplicates exist, add a cleanup migration with a lower file number that runs first. The integration test suite inserts events sequentially and will never surface this race condition.

2. **CASCADE DELETE wipes audit tables (llm_usage, events)** — Map the complete FK graph before writing Migration 2. Use `SET NULL` on `llm_usage.project_id` and `events.project_id` so cost history and event logs survive project deletion. Use `ON DELETE CASCADE` only for structural child rows (beads, bead_edges, holdout_vault, asset_jobs) that have no independent meaning without their parent.

3. **Seed version UNIQUE constraint breaks root seeds (PostgreSQL NULL semantics)** — `UNIQUE(parent_seed_id, version)` does not prevent duplicate root seeds because PostgreSQL treats two NULLs as not equal in UNIQUE constraints. Use a partial unique index: `CREATE UNIQUE INDEX seeds_parent_version_unique ON seeds (parent_seed_id, version) WHERE parent_seed_id IS NOT NULL`. Drizzle does not support partial indexes natively — write this as raw SQL in the migration file.

4. **Index creation locks write-path tables during migration** — `CREATE INDEX` acquires a `ShareLock` blocking all concurrent writes for the duration. Use `CREATE INDEX CONCURRENTLY IF NOT EXISTS` for all new indexes on `events`, `beads`, `bead_edges`, and `llm_usage`. CONCURRENTLY cannot run inside a transaction block — each index must be in its own migration file or the migration runner must not wrap it in a transaction.

5. **KEK rotation breaks in-flight holdout decryption** — Use a two-phase rotation: re-encrypt all DEKs under the new KEK first, verify all decryptions succeed, then retire the old key only after all in-flight evaluations have completed. Log three distinct audit events: rotation started, all DEKs re-encrypted, old key retired. Never remove the old key in the same deployment as adding the new one.

## Implications for Roadmap

Based on research, the dependency graph enforces a bottom-up layer order, but within each layer, items are independent and can be parallelized.

### Phase 1: Schema Migrations — Integrity Indexes
**Rationale:** Pure additive migrations (new constraints and indexes only). Reversible with `DROP INDEX / DROP CONSTRAINT`. No application logic changes. Prerequisite for engine code changes to benefit from DB-level enforcement. Must come before Phase 2 so the events indexes are in place when the N+1 batch query is written.
**Delivers:** UNIQUE constraint on events sequence, UNIQUE partial index on seed versions, two composite indexes on events (sequence and occurred_at), reverse-lookup index on bead_edges
**Addresses:** Issues #2, #3, #5 (schema part), #14
**Avoids:** Pitfall 1 (run duplicate audit query before migration), Pitfall 3 (partial index for NULL semantics), Pitfall 4 (CONCURRENTLY for all new indexes)
**Research flag:** Standard patterns — well-documented Drizzle + PostgreSQL constraint patterns; no deeper research needed

### Phase 2: Concurrency and Performance Fixes
**Rationale:** Logic changes with clear before/after test coverage, no new infrastructure. All three items change only existing code paths with no schema dependencies beyond Phase 1 indexes already in place.
**Delivers:** Optimistic locking on bead completion (version-conditioned WHERE + RETURNING), synchronous usage recording, N+1 query elimination in projects list
**Addresses:** Issues #10, #9, #4
**Avoids:** Pitfall 6 (single atomic UPDATE with version condition — not a two-query select-then-update pattern), Pitfall 7 (pin return type with Zod output schema before changing query shape to avoid null runtime crashes in web components)
**Research flag:** Standard patterns — no deeper research needed

### Phase 3: Reliability — Process Boundaries and Transactions
**Rationale:** These items require reading actual source files before writing implementation tasks. `agent-runner.ts` must be read to understand the spawn mechanism before wiring the timeout kill. The holdout rollback requires reading the crystallize call site to determine whether a shared transaction context already exists. The error boundary is low-risk and can proceed in parallel with the other two.
**Delivers:** Enforced SIGTERM + SIGKILL two-phase kill on hard timeout, transactional holdout failure rollback (seed crystallization rolls back if holdout sealing fails), React error boundary around DAGCanvas with text-list fallback
**Addresses:** Issues #6, #7, #13
**Avoids:** AbortController-only timeout (leaves zombie subprocess alive); using AbortSignal.timeout() without the SIGKILL escalation
**Research flag:** Requires code reading before planning — `execution/agent-runner.ts` and the `interview/` crystallize call site must be read before writing tasks (per `feedback_read_code_before_planning.md`)

### Phase 4: FK Cascade Strategy
**Rationale:** Isolated to schema-only changes, but the cascade vs. soft-delete decision for each table must be made explicitly before writing any SQL. Separated from Phase 1 to avoid conflating additive index migrations with behavior-changing CASCADE rules, which are harder to roll back.
**Delivers:** CASCADE DELETE on structural child tables (beads, bead_edges, holdout_vault, asset_jobs), SET NULL on audit tables (llm_usage, events), consistent soft-delete maintained at project level via existing deleted_at column
**Addresses:** Issue #8
**Avoids:** Pitfall 2 (full FK graph mapping required — llm_usage and events must be SET NULL not CASCADE; failing to map the full graph deletes irreplaceable cost and event history)
**Research flag:** Standard patterns — but requires a pre-task that explicitly maps the FK graph and writes the cascade decision per table before any SQL is written; run integration test asserting llm_usage and events rows survive project deletion

### Phase 5: Auth Middleware
**Rationale:** The `authenticatedProcedure` implementation already exists in `web/src/trpc/init.ts` and is complete. This phase is a mechanical `publicProcedure` → `authenticatedProcedure` import swap across all five router files. Isolating it prevents auth failures from being confused with functional failures in other phases.
**Delivers:** `authenticatedProcedure` enforced on all mutation tRPC routes; a single new test verifying UNAUTHORIZED response on wrong API key
**Addresses:** Issue #12
**Avoids:** Auth middleware breaking all existing tests — verify `CAULDRON_API_KEY` dev-mode bypass is active in the Vitest config before switching any procedure; do not add auth headers to existing tests
**Research flag:** Standard patterns — no deeper research needed

### Phase 6: Structured Conflict Resolution
**Rationale:** Isolated to `merge-queue.ts`. The gateway already has `generateObject` — this is a call-site change to `generateText` + `Output.object()` with a Zod schema. Independent of all other phases once the project compiles cleanly.
**Delivers:** Zod-schema-validated per-file JSON extraction replacing string-scanning confidence heuristic; typed `confidence: z.enum(['high', 'low'])` field; `AI_NoObjectGeneratedError` thrown on malformed LLM response instead of silently writing prose to source files
**Addresses:** Issue #1
**Avoids:** Keeping the `"confidence": "low"` substring search which breaks when LLMs rephrase or include the string in rationale prose
**Research flag:** Standard patterns — `Output.object()` API verified against AI SDK 6 migration guide; no deeper research needed

### Phase 7: KEK Rotation Infrastructure
**Rationale:** Highest-complexity item. Touches encryption, schema, and requires a standalone CLI utility command that performs a one-time-per-rotation admin operation. Must come after all other phases are stable so it does not gate unrelated fixes.
**Delivers:** `kek_versions` table, `kek_version` integer column on `holdout_vault`, rotation re-encryption utility (load old KEK, re-encrypt all DEKs row-by-row in transaction, verify, retire), append-only rotation audit log
**Addresses:** Issue #11
**Avoids:** Pitfall 10 (in-flight decryption failure during rotation — must design the two-phase dual-encrypt window before writing any code; three distinct audit events required; never retire old key in same deployment as new key)
**Research flag:** Needs explicit design before implementation — the two-phase rotation window and in-flight safety must be documented as a design step before writing code; do not start implementation without this

### Phase 8: MCP Cross-Process IPC
**Rationale:** Most architecturally isolated item. Touches the most cross-package surface area (`engine/src/asset/events.ts` and `mcp/src/bootstrap.ts`) but has no inbound dependencies from any other phase. Isolated last to avoid cross-package changes introducing noise during the rest of the milestone.
**Delivers:** Redis pub/sub replacing the unreachable callback injection; Inngest CLI process publishes to `cauldron:mcp:job-status:{jobId}`; MCP stdio process subscribes and calls `notifyJobStatusChanged`; pull-first `check-job-status` verified as reliable fallback independent of IPC
**Addresses:** Issue #15
**Avoids:** Pitfall 5 (IPC silent message drop — design pull-first, push-as-optimization; `check-job-status` DB query is the correctness path; IPC failure is best-effort and logged, not surfaced as an error)
**Research flag:** Standard patterns — Redis pub/sub via ioredis is fully documented; primarily a bootstrap wiring change in two files; no deeper research needed

### Phase Ordering Rationale

- Layer 0 (Phases 1, 4) before Layer 1 (Phases 2, 3, 6) — schema constraints are prerequisites that application code benefits from automatically; engine changes depend on indexes being present
- Phase 1 (additive only) before Phase 4 (CASCADE rules) — separates low-risk additive changes from behavior-changing FK mutations; each can be rolled back independently
- Phase 2 (concurrency + perf) after Phase 1 — the events indexes from Phase 1 make the N+1 batch query efficient; their presence also validates the optimistic locking path
- Phase 3 (process + transactions) requires a code-reading gate before planning; placing it after Phase 2 gives the team time to read `agent-runner.ts` without blocking migration work
- Phases 5, 6, 7, 8 are independent of each other once Phases 1-4 complete; the order above reflects risk (auth breaks tests, structured output is isolated) and complexity (KEK rotation is highest, MCP IPC is most cross-package)
- Phase 7 (KEK rotation) is last because it has the highest implementation complexity and an irreversible rotation window; no other phase should wait on it

### Research Flags

Phases needing additional context or code reading before writing implementation tasks:
- **Phase 3:** `execution/agent-runner.ts` and the `interview/` crystallize call site must be read before writing tasks. Task paths, the spawn mechanism, and whether crystallize already owns a transaction cannot be assumed from schema reading alone (per `feedback_read_code_before_planning.md`).
- **Phase 7:** The two-phase KEK rotation window and in-flight evaluation safety must be designed explicitly as a pre-task before writing any code. The rotation procedure is a one-time admin operation with no recovery path if the dual-encrypt window is implemented incorrectly.

Phases with standard, well-documented patterns (no deeper research needed):
- **Phase 1:** Drizzle unique/index declarations plus `drizzle-kit generate` are fully documented; the only non-obvious step is the data-audit query before running migration
- **Phase 2:** Version-conditioned UPDATE and N+1 elimination are standard patterns; main risk is type stability in the N+1 fix, handled by pinning the Zod output schema
- **Phase 4:** FK graph mapping is the only non-trivial pre-step; the SQL patterns are standard PostgreSQL
- **Phase 5:** `authenticatedProcedure` already exists and is fully implemented; purely a wiring change in five router files
- **Phase 6:** `Output.object()` API is verified against official docs; purely a call-site change in one file
- **Phase 8:** Redis pub/sub pattern via ioredis is fully documented; primarily a bootstrap wiring change in two files

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommendations verified against official docs (AI SDK 6 migration guide, Drizzle ORM docs, Node.js child_process docs, MCP spec, Redis docs); one package version (`react-error-boundary` exact npm version) needs confirmation at implementation time |
| Features | HIGH | All 15 issues verified against direct source file inspection; no inference — each issue confirmed by reading the specific file containing the defect |
| Architecture | HIGH | All architectural recommendations grounded in direct reading of 13 source files across packages; no assumptions about existing code structure |
| Pitfalls | HIGH | Pitfalls identified from actual code inspection plus PostgreSQL official documentation for behavioral edge cases (NULL uniqueness semantics, CONCURRENTLY transaction restriction) |

**Overall confidence:** HIGH

### Gaps to Address

- **react-error-boundary exact version:** STACK.md notes version 6.1.1 from GitHub but states the npm version needs confirmation at implementation time. Pin `^4.1.2` and verify current stable on npm before installing.
- **Holdout rollback transaction scope:** Whether `crystallizeSeed()` already owns a DB transaction or is called within one is not determinable from schema reading alone. The `interview/` crystallize call site must be read during Phase 3 planning before the rollback boundary can be specified.
- **`CAULDRON_API_KEY` test environment state:** Phase 5 relies on the dev-mode bypass (`validateApiKey` returns true when `CAULDRON_API_KEY` is unset). Verify this is unset in the Vitest runner config before switching any procedures.
- **CASCADE DELETE data audit:** Before writing Migration 2, run row counts against dev and test DBs to confirm no orphan rows in `llm_usage` or `events` would conflict with adding the FK constraints.

## Sources

### Primary (HIGH confidence)
- AI SDK 6 migration guide (ai-sdk.dev) — `generateObject` deprecation confirmed, `Output.object()` replacement API verified
- Drizzle ORM official docs (orm.drizzle.team) — `unique()`, `index()`, `.returning()`, update patterns with version conditions
- Node.js v25.8.2 child_process docs (nodejs.org) — `.kill()`, SIGTERM/SIGKILL hierarchy, AbortSignal.timeout() behavior
- MCP specification 2025-03-26 (modelcontextprotocol.io) — StdioServerTransport, Streamable HTTP push notification semantics
- Redis official docs (redis.io) — PUBLISH/SUBSCRIBE semantics, delivery guarantees
- PostgreSQL documentation — NULL semantics in UNIQUE constraints (NULLs are not equal), `CREATE INDEX CONCURRENTLY` transaction restriction
- Direct source file inspection (13 files across packages/shared, engine, web, mcp, cli read as of 2026-04-01)

### Secondary (MEDIUM confidence)
- react-error-boundary GitHub (bvaughn) — v6.1.1 February 2026 release, React 19 compatibility; npm version needs confirmation at implementation time
- Evil Martians soft-deletion guide — partial index pattern for soft-delete with PostgreSQL
- ByteByteGo: Optimistic Locking — version-conditioned UPDATE pattern and stale-version error handling
- SoftwareMill: Event sourcing with PostgreSQL — UNIQUE(stream_id, version) constraint pattern

### Tertiary (LOW confidence — context only)
- None — all findings grounded in official documentation or direct code inspection

---
*Research completed: 2026-04-01*
*Ready for roadmap: yes*
