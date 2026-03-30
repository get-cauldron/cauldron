# Codebase Concerns

**Analysis Date:** 2026-03-29

## Technical Debt

| Area | Description | Severity | Impact |
|------|-------------|----------|--------|
| `as any` casts (138 occurrences, 26 files) | Heavy use of `as any` across production and test code to work around AI SDK v6 and Inngest v4 type boundaries | med | Type safety erosion; bugs may slip past the compiler. Production files like `packages/engine/src/gateway/gateway.ts`, `packages/engine/src/decomposition/events.ts`, `packages/engine/src/evolution/events.ts` each have 3-7 `as any` casts |
| eslint-disable comments (40+ instances) | Blanket `@typescript-eslint/no-explicit-any` suppressions throughout gateway, decomposition, evolution, and holdout event handlers | med | Lint rules intended to catch issues are systematically bypassed. Most are in `packages/engine/src/decomposition/events.ts` and `packages/engine/src/gateway/gateway.ts` |
| Module-level mutable state | `let schedulerDeps` in `packages/engine/src/decomposition/events.ts`, `let evolutionDeps` in `packages/engine/src/evolution/events.ts`, `let vaultDeps` in `packages/engine/src/holdout/events.ts`, `let _gateway/_config/_logger` in `packages/web/src/trpc/engine-deps.ts` | med | Module singletons are difficult to test in isolation, create hidden coupling, and risk stale state across hot-reloads |
| Conflict resolution writes raw LLM text | `packages/engine/src/execution/merge-queue.ts:220` writes `responseText` as-is to ALL conflicted files | high | The same LLM response body is written to every conflicted file verbatim, destroying file contents. Comment on line 219 acknowledges this: "In production, a more structured extraction would parse per-file blocks" |
| SSE polling instead of LISTEN/NOTIFY | `packages/web/src/app/api/events/[projectId]/route.ts:82` polls every 2 seconds | low | Adds 2s latency to live event delivery and creates unnecessary DB load under many concurrent viewers. Comment on line 79 documents this as a v1 pragmatic choice |
| `react-hooks/exhaustive-deps` suppressions | `packages/web/src/app/projects/[id]/interview/page.tsx:97`, `packages/web/src/app/projects/[id]/ProjectShellClient.tsx:40`, `packages/web/src/app/projects/[id]/settings/page.tsx:68` | low | Missing deps can cause stale closures and subtle UI bugs |

## Known Issues

**No TODO/FIXME comments in source code:**
- Zero `TODO`, `FIXME`, `HACK`, or `XXX` markers found in any `.ts` or `.tsx` source files (excluding `.next` build artifacts and `node_modules`). This is unusual for a project of this size and suggests issues are tracked externally or not annotated.

**Merge queue conflict resolution is broken for multi-file conflicts:**
- Files: `packages/engine/src/execution/merge-queue.ts:215-231`
- The `resolveConflict` method writes the entire LLM response body to every conflicted file, which means if two files conflict, both get the same content. This guarantees data corruption for multi-file merge conflicts.
- Fix approach: Parse per-file blocks from the LLM response (use generateObject with a structured schema instead of raw text parsing).

**Module-level dep injection pattern has no thread safety:**
- Files: `packages/engine/src/decomposition/events.ts:27`, `packages/engine/src/evolution/events.ts:24`, `packages/engine/src/holdout/events.ts:27`
- `configureSchedulerDeps()` sets a module-level variable that all Inngest handlers share. If two projects run concurrently in the same process, they would share `schedulerDeps`.
- Current mitigation: Single-project-per-instance assumption (documented in code). This is a scaling blocker.

## Security Considerations

**Authentication:**
- API key auth via `CAULDRON_API_KEY` env var checked in `packages/web/src/trpc/init.ts:15-30` and `packages/web/src/app/api/events/[projectId]/route.ts:20-28`
- Risk: When `CAULDRON_API_KEY` is not set, ALL requests are allowed (line 19: "Dev mode: no key configured, allow all requests"). There is no warning at startup and no enforcement to set a key in production.
- Recommendation: Add a startup warning or fail-safe when `NODE_ENV=production` and no key is set.

**No user-level authorization:**
- Files: `packages/web/src/trpc/init.ts`
- Auth is binary (key present or not). No user identity, no project-level access control. Any valid API key grants access to all projects.
- Current mitigation: Single-tenant design. This blocks multi-user deployment.

**SSE token passed as query parameter:**
- Files: `packages/web/src/app/api/events/[projectId]/route.ts:25`, `packages/web/src/hooks/useSSE.ts:29`
- The API key can be passed as `?token=` query parameter for browser EventSource compatibility. Query params appear in server logs and browser history.
- Risk: Low for single-tenant, high if multi-tenant.

**Holdout encryption is sound:**
- Files: `packages/engine/src/holdout/crypto.ts`
- AES-256-GCM with proper envelope encryption (DEK/KEK), fresh IVs per operation, key never logged or exported. This is well-implemented.

**Path traversal protection:**
- Files: `packages/engine/src/execution/agent-runner.ts:224`
- Agent output write validates paths stay within worktree scope (EXEC-08). This is correctly implemented.

**Shell injection mitigation in knowledge graph:**
- Files: `packages/engine/src/intelligence/adapter.ts:54-64`
- Writes args to temp file instead of interpolating into shell command. This is correctly implemented.

## Performance Risks

**Missing indexes on `events` table:**
- Files: `packages/shared/src/db/schema/event.ts`, `packages/shared/src/db/migrations/0000_mixed_blue_shield.sql`
- The `events` table has no indexes defined in the schema or initial migration. SSE polling queries `WHERE project_id = ? AND sequence_number > ?` every 2 seconds per connected client.
- Impact: Query performance degrades linearly with event table growth. A project with 10,000 events and 5 SSE viewers = 5 unindexed scans every 2 seconds.
- Fix approach: Add composite index `(project_id, sequence_number)` via migration.

**Knowledge graph re-indexing on every bead completion:**
- Files: `packages/engine/src/decomposition/events.ts:317-320`, `packages/engine/src/execution/merge-queue.ts:308`
- `knowledgeGraph.indexRepository()` is called after every bead completion AND after every merge. For a DAG with 50 beads, this means 100+ full repository index operations.
- Impact: Each indexing call spawns a child process (`codebase-memory-mcp`). Heavy CPU/IO cost.
- Fix approach: Debounce or batch re-indexing; skip if no new merges since last index.

**SSE polling creates unbounded DB connections:**
- Files: `packages/web/src/app/api/events/[projectId]/route.ts:82-114`
- Each SSE connection creates a 2-second polling loop calling `getDb()`. With 10 browser tabs open, that is 5 DB queries/second indefinitely.
- Fix approach: Share a single poll loop per project, or implement LISTEN/NOTIFY.

**Token estimation is approximate:**
- Files: `packages/engine/src/execution/context-assembler.ts:9-13`
- Token estimate uses `words * 1.3` heuristic. This can over/undercount by 30%+ for code-heavy content (identifiers, symbols).
- Impact: Context budget may be wasted or overrun, affecting LLM output quality.

**costCents stored as integer:**
- Files: `packages/shared/src/db/schema/llm-usage.ts:18`
- LLM cost tracking uses `integer` for `costCents`. Sub-cent costs (common with cheap models) round to 0, losing cost tracking precision.
- Fix approach: Use `real` or store as micro-cents (integer * 100).

## Dependency Risks

**External binary dependency (codebase-memory-mcp):**
- Files: `packages/engine/src/intelligence/adapter.ts:45`
- The knowledge graph adapter depends on an external binary (`codebase-memory-mcp`) that must be installed separately. No installation check, no version pinning, no fallback.
- Impact: Execution pipeline fails completely if binary is not on PATH.
- Fix approach: Add startup validation, document installation requirement, or provide graceful degradation.

**Circuit breaker is in-memory only:**
- Files: `packages/engine/src/gateway/circuit-breaker.ts`
- Circuit state lives in a `Map` on the singleton `LLMGateway`. If the process restarts (common with Inngest durable steps), circuit state is lost.
- Impact: A provider experiencing sustained outage will be retried on every process restart, burning budget.
- Fix approach: Persist circuit state to Redis or DB.

**Inngest v4 type complexity:**
- The majority of `as any` casts and `eslint-disable` comments exist because of Inngest v4's deeply-nested generic chain (TS2883, TS4053). Comments are thorough (good), but this creates a fragile integration surface.
- Files: `packages/engine/src/decomposition/events.ts`, `packages/engine/src/evolution/events.ts`, `packages/engine/src/holdout/events.ts`
- Impact: Upgrades to Inngest or TypeScript may break these boundaries silently.

## Architecture Risks

**Single-project-per-process assumption:**
- Files: `packages/engine/src/decomposition/events.ts:24` (`projectRoot?: string`), `packages/engine/src/decomposition/events.ts:315` (single `projRoot`)
- The scheduler deps store a single `projectRoot`. All Inngest handlers in a process share it.
- Impact: Cannot serve multiple projects from one engine instance. Horizontal scaling requires one process per project.
- Fix approach: Store `projectRoot` per project in DB, pass through event data.

**Tight coupling between decomposition events and execution:**
- Files: `packages/engine/src/decomposition/events.ts`
- The `beadDispatchHandler` function is 280 lines and orchestrates: fan-in waits, conditional checks, bead claiming, worktree creation, knowledge graph indexing, context assembly, TDD loop execution, merge queueing, and completion events.
- Impact: Any change to the execution pipeline requires modifying this monolithic handler. Hard to test individual steps in isolation.
- Fix approach: Extract execution lifecycle into a separate module; the Inngest handler should only orchestrate step calls.

**No graceful shutdown for SSE connections:**
- Files: `packages/web/src/app/api/events/[projectId]/route.ts:126-134`
- Cleanup only happens on client-initiated `abort`. If the server process crashes, poll intervals and DB connections leak.
- Current mitigation: Node.js GC will eventually clean up. Not a concern for dev, but problematic for production.

**Console logging in web production code:**
- Files: `packages/web/src/trpc/engine-deps.ts:34-44`
- The web layer uses `console.log/warn/error` wrapped in a `makeConsoleLogger()` to avoid depending on pino. This means no structured logging, no log levels, and no correlation IDs in the web process.
- Fix approach: Accept pino as a peer dependency, or use a proper structured logger.

## Gaps

**No rate limiting on tRPC endpoints:**
- Files: `packages/web/src/trpc/init.ts`
- tRPC procedures have auth but no rate limiting. A valid API key can make unlimited requests.
- Impact: Low for single-tenant; high if exposed to the internet.

**No health check endpoint:**
- The CLI has `packages/cli/src/health.ts` for service checks, but the web app (`packages/web/`) has no `/health` or `/readiness` endpoint for container orchestration.

**Test coverage gaps:**
- No tests for `packages/web/src/app/api/events/[projectId]/route.ts` SSE streaming behavior (only auth tests in `packages/web/src/app/api/events/__tests__/route.test.ts`)
- No integration tests for the full merge queue lifecycle (only unit tests with mocked git in `packages/engine/src/execution/__tests__/merge-queue.test.ts`)
- No tests for `packages/engine/src/execution/context-assembler.ts` token budget trimming paths (unit tests exist but don't verify budget enforcement)
- Evolution module has extensive unit tests but no wiring tests against a real database (unlike interview which has `packages/engine/src/__tests__/interview-fsm.wiring.test.ts`)

**Missing input validation on SSE projectId:**
- Files: `packages/web/src/app/api/events/[projectId]/route.ts:14`
- The `projectId` from the URL path is used directly in DB queries without UUID format validation. A malformed ID would cause a DB error rather than a 400 response.

**Snapshot system appears unused:**
- Files: `packages/shared/src/db/schema/snapshot.ts`
- The `project_snapshots` table is defined in the schema but no code writes to or reads from it.
- Impact: Dead schema adds confusion. Either implement snapshot-based event replay or remove the table.

---

*Concerns audit: 2026-03-29*
