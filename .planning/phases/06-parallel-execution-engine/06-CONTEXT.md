# Phase 6: Parallel Execution Engine - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Multiple agents execute independent beads concurrently in isolated git worktrees, assembling surgical context from the code knowledge graph, self-healing on errors, and merging back to main through a sequential queue — while generating unit, integration, and E2E tests as a first-class part of every bead. This phase does NOT include evolutionary evaluation (Phase 7), dashboard UI (Phase 8), or CLI (Phase 9).

</domain>

<decisions>
## Implementation Decisions

### Code Intelligence
- **D-01:** Hybrid approach — use codebase-memory-mcp as the knowledge graph engine, wrapped with a thin TypeScript adapter in `packages/engine` that formats query results for agent context assembly. No custom graph build needed.
- **D-02:** Internal TypeScript API (not MCP passthrough). The adapter is a library module called by the execution engine during context assembly. Agents never interact with MCP directly.
- **D-03:** Index both the target project's code AND Cauldron's own engine code. Enables the dogfood inflection point where Cauldron builds itself.
- **D-04:** Initial full index happens during the brownfield interview (Phase 3), not at execution start. This means the knowledge graph is available to inform decomposition (Phase 5) as well as execution (Phase 6). The adapter must be usable by both phases.
- **D-05:** Incremental re-indexing triggers on bead completion, before dispatching newly-ready beads. Downstream beads always see updated code from upstream beads.
- **D-06:** Knowledge graph scope per agent: main branch state + current bead's worktree changes only. No cross-worktree visibility. Agents in parallel beads are fully isolated.

### Agent Context Assembly
- **D-07:** Two-step relevant code selection: (1) deterministic keyword extraction from bead spec queries the knowledge graph for symbols + 1-hop dependencies, then (2) a lightweight LLM pass reviews the candidate code set and prunes/adds non-obvious dependencies. Traceable primary step with adaptive augmentation.
- **D-08:** Dependency outputs include actual code artifacts (files/diffs) produced by completed upstream beads, pulled from the merged main branch or knowledge graph. Agents see real interfaces and types, not just descriptions.
- **D-09:** Seed excerpt scoped per bead: goal statement + all constraints (cross-cutting) + only the acceptance criteria referenced by the bead's `coversCriteria` field. Balances context and focus.
- **D-10:** Hard token budget with priority-based trimming. Set a cap (200k minus implementation room). If assembled context exceeds it, trim in priority order: distant dependencies first, then code examples, then full files reduced to signatures. Prevents context window overflow.
- **D-11:** Agents receive a dedicated system prompt defining role (implementer), constraints (EXEC-08 least-privilege), output format expectations (code + tests), and error handling behavior. Assembled context goes in user/assistant messages.
- **D-12:** Process-level capability scoping: agents can only write files within their worktree. No git push, no deletion outside scope, no network calls except LLM API. Filesystem access scoped to worktree root.

### Git Worktree & Merge Queue
- **D-13:** Branch naming: `cauldron/bead-{short-uuid}`. Flat namespace under `cauldron/`. One branch per bead. Cleaned up after merge.
- **D-14:** Merge conflict resolution: LLM agent attempts resolution first using both sides' bead specs as context. If LLM can't resolve confidently, escalate to human via event/notification. Keeps pipeline moving for simple conflicts.
- **D-15:** Merge queue processes in DAG topological order, not FIFO. Upstream beads merge before downstream ones regardless of completion time. A bead that completes first but depends on another waits in queue.
- **D-16:** Post-merge test re-run: after successful merge, the bead's test suite runs against the updated main. If tests fail post-merge, the merge is reverted and flagged. Catches cross-bead integration regressions.
- **D-17:** Worktree location: `.cauldron/worktrees/{bead-id}/` in the target project root. Gitignored.
- **D-18:** Immediate cleanup after merge: delete worktree directory and prune branch after successful merge + post-merge test pass. Failed merges retain worktree for debugging.

### Test Generation Strategy
- **D-19:** TDD approach — agents write tests from the bead spec first, then implement until tests pass. Aligns with the self-healing error loop since the agent has a clear target to iterate toward.
- **D-20:** Anti-mocking heuristic: real dependencies by default (real database, real file I/O, real internal APIs). Only external services (third-party APIs, payment providers) get mocked. Consistent with Cauldron's own test philosophy.
- **D-21:** Test runner selection: use the target project's existing test infrastructure. If the project has Jest, use Jest. If no existing runners, default to Vitest (unit/integration) + Playwright (E2E). Agents must detect existing test setup.
- **D-22:** Self-healing error loop: agent reads test failure output, modifies code, reruns tests. Max 5 iterations. If still failing after 5, mark bead as failed and surface the error context. Each iteration gets the full error output.
- **D-23:** E2E tests generated only for beads that touch user-facing surfaces (UI, API endpoints, CLI commands). Internal/infrastructure beads get unit + integration only.
- **D-24:** Graduated timeout supervision: (1) idle detection — no file writes for N minutes triggers a warning; (2) soft timeout at 80% of time limit — tell agent to wrap up; (3) hard timeout — kill bead and mark failed. Configurable per-project.

### Claude's Discretion
- codebase-memory-mcp adapter API design and query patterns
- System prompt content and structure for implementation agents
- Token budget allocation between context sections (seed excerpt vs code vs deps)
- Priority trimming algorithm details
- Worktree creation and git branch management implementation
- Merge queue data structure and processing loop
- LLM conflict resolution prompt design
- Test detection heuristics for existing project runners
- Idle detection thresholds and soft timeout percentages
- Event naming conventions for bead lifecycle (extending Phase 5 patterns)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema & Data Layer
- `packages/shared/src/db/schema/bead.ts` — Bead + BeadEdge tables with status enum, version column for optimistic concurrency, coversCriteria JSONB
- `packages/shared/src/db/schema/seed.ts` — Seed table with acceptance criteria, ontology schema
- `packages/shared/src/db/schema/event.ts` — Event sourcing table for lifecycle events

### Decomposition & Scheduling (Phase 5 — upstream)
- `packages/engine/src/decomposition/scheduler.ts` — `findReadyBeads()`, `claimBead()`, `completeBead()`, `persistDecomposition()` — these are the integration points Phase 6 builds on
- `packages/engine/src/decomposition/pipeline.ts` — `runDecomposition()` dispatches `bead.dispatch_requested` events via Inngest — Phase 6 handles this event
- `packages/engine/src/decomposition/types.ts` — `BeadDispatchPayload`, `DecompositionResult`, `ClaimResult` types

### LLM Gateway
- `packages/engine/src/gateway/gateway.ts` — LLM gateway with stage-based routing, failover, diversity enforcement
- `packages/engine/src/gateway/types.ts` — Gateway types including stage configuration

### Inngest Patterns
- `packages/engine/src/holdout/` — Inngest v4 `createFunction` pattern (Phase 4 established the pattern)

### Project Configuration
- `CLAUDE.md` §Stack Patterns — Ready-bead SQL query, adjacency row storage, Inngest dispatch patterns, worktree isolation pattern

### Requirements
- `.planning/REQUIREMENTS.md` §EXEC-01 through EXEC-09 — Parallel execution requirements
- `.planning/REQUIREMENTS.md` §CODE-01 through CODE-04 — Code intelligence requirements
- `.planning/REQUIREMENTS.md` §TEST-01 through TEST-06 — Testing cube requirements

### Prior Phase Context
- `.planning/phases/05-dag-decomposition-scheduler/05-CONTEXT.md` — DAG decomposition decisions, Inngest dispatch model, bead claiming, fan-in patterns
- `.planning/phases/04-holdout-vault/04-CONTEXT.md` — Inngest step-level env scoping, event-driven convergence pattern
- `.planning/phases/02-llm-gateway/02-CONTEXT.md` — Gateway stage routing, model family mapping

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `findReadyBeads()` in `scheduler.ts`: Ready-bead SQL query already implemented — use after bead completion to dispatch next wave
- `claimBead()` in `scheduler.ts`: Optimistic concurrency bead claiming — use at start of bead execution
- `completeBead()` in `scheduler.ts`: Marks bead complete/failed, emits events, handles conditional-blocks cascade
- `runDecomposition()` in `pipeline.ts`: Already sends `bead.dispatch_requested` Inngest events — Phase 6 builds the handler
- `LLMGateway` with `generateObject`/`streamText`: Available for context assembly LLM check, conflict resolution LLM, and agent implementation calls
- Event store (`appendEvent`): For bead lifecycle events
- `BeadDispatchPayload` type: Already defines the event shape (`beadId`, `seedId`, `projectId`, `moleculeId`)

### Established Patterns
- Inngest v4 `createFunction({ id, triggers: [{ event }] }, handler)` (Phase 4)
- Stage-based model routing via `cauldron.config.ts` — add `execution`, `context_assembly`, `conflict_resolution` stages
- `generateObject` with Zod schemas for structured LLM output
- Drizzle ORM for all database operations
- Integration tests against real PostgreSQL (no mocks)

### Integration Points
- `bead.dispatch_requested` event → Phase 6 Inngest handler (the main entry point)
- Bead completion → `completeBead()` → `findReadyBeads()` → dispatch next wave
- Knowledge graph adapter → context assembly → agent invocation
- Agent output → worktree commits → merge queue → main branch
- Post-merge → re-index → next bead dispatch

</code_context>

<specifics>
## Specific Ideas

- Knowledge graph indexes Cauldron's own code in addition to target projects, enabling the dogfood inflection point after Phase 6
- Initial full index happens during brownfield interview (Phase 3), not at execution start — adapter must be usable by both Phase 3 and Phase 6
- TDD approach for agents: write tests from bead spec first, then implement until tests pass — the self-healing loop iterates against a clear target

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-parallel-execution-engine*
*Context gathered: 2026-03-26*
