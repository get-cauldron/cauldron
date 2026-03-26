# Phase 5: DAG Decomposition & Scheduler - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

A seed's acceptance criteria decompose into a valid, acyclic bead DAG (molecules + beads) with all four dependency types enforced, Kahn's cycle detection at construction time, atomic bead claiming, durable Inngest job dispatch, and fan-in synchronization gates — so parallel execution is safe before the first agent runs. This phase does NOT include agent execution itself (Phase 6) or evolution (Phase 7).

</domain>

<decisions>
## Implementation Decisions

### Decomposition Strategy
- **D-01:** Two-pass hierarchical decomposition. Pass 1: LLM reads seed + ontology entity map (from Phase 3 D-24), produces molecule tree (high-level task groupings). Pass 2: LLM decomposes each molecule into atomic beads with dependency edges between them.
- **D-02:** New `decomposition` stage added to `cauldron.config.ts` model assignments. Defaults to a strong reasoning model. Follows existing per-stage routing pattern from Phase 2.
- **D-03:** LLM infers dependency edges during Pass 2 (bead creation). The decomposition call outputs beads AND their inter-bead edges together. Validated post-hoc by cycle detection.
- **D-04:** Auto-retry on invalid DAG — cycle detection + size validation runs after decomposition. If invalid, retry the decomposition LLM call with specific error context (e.g., "bead X exceeds 200k", "cycle between A->B->C->A"). Max 3 retries, then surface to user.

### Token Size Estimation
- **D-05:** LLM estimates token size during decomposition. Each bead annotated with `estimatedTokens` covering: bead spec + seed excerpt + expected code output + dependency context. Uses existing `estimatedTokens` column on beads table.
- **D-06:** Proportional budget allocation based on bead complexity. The LLM assigns proportional splits of the ~200k token target based on each bead's nature — a pure-logic bead gets more implementation room; a heavy-dependency bead gets more context room. More adaptive than fixed bands.
- **D-07:** Oversized beads auto-split — validation pass detects beads exceeding 200k target, asks the decomposition LLM to split them into smaller sub-beads as part of the retry loop. New sub-beads get parent-child edges to original molecule.
- **D-08:** No human review gate on decomposition output. If decomposition passes cycle detection + sizing validation, dispatch immediately. Faster pipeline.
- **D-09:** Acceptance criteria coverage mapping — each bead references which seed acceptance criteria it covers. After decomposition, a coverage check ensures every criterion has at least one bead. Gaps flagged for retry. Enables traceability from seed -> bead -> implementation.

### Inngest Dispatch Model
- **D-10:** One Inngest function per bead. Each bead becomes a single Inngest function invocation. Granular retry/timeout per bead. Parent-child relationships via FlowProducer tree dispatch.
- **D-11:** Fan-in via `step.waitForEvent()` — downstream bead's Inngest function calls `step.waitForEvent()` for each upstream bead completion event. Only proceeds when all awaited events have fired. Native Inngest pattern. **Research must verify this against Inngest v4 SDK** (STATE.md blocker).
- **D-12:** All ready beads dispatched immediately. After decomposition, query for all beads with no unmet dependencies. Dispatch all as Inngest functions simultaneously. As beads complete, newly-ready beads auto-dispatch via completion events.
- **D-13:** Bead failure handling: Inngest auto-retries the bead function (configurable retries, e.g. 3). If all retries exhaust, mark bead as failed. Downstream beads that depend on it are marked blocked. Molecule is failed only if a required bead fails.
- **D-14:** `conditional-blocks` has simple binary semantics: "this bead is optional and only runs if the upstream bead succeeded." If upstream fails, the conditional bead is skipped (not failed). No arbitrary expression evaluation.
- **D-15:** Configurable per-project concurrency limit on simultaneous bead execution (default e.g. 5). Stored in project settings. Inngest concurrency controls enforce this natively. Prevents overwhelming API rate limits.

### Atomic Claiming & Scheduling
- **D-16:** Optimistic concurrency with version column for atomic bead claims. Add a version/etag column to beads table. Claim requires matching current version. On conflict, re-read and retry.
- **D-17:** Ready-bead query uses the SQL subquery pattern from CLAUDE.md: `SELECT beads WHERE status='pending' AND NOT EXISTS (blocking deps with incomplete sources)`. Runs on every bead completion event to find newly-ready beads.

### Claude's Discretion
- Exact decomposition prompt content and system messages
- Zod schemas for decomposition structured output
- Kahn's algorithm implementation details
- Inngest function naming and configuration patterns
- Version column data type and naming (integer version vs UUID etag)
- Retry backoff strategy for bead failures
- Event naming conventions for bead completion events
- Coverage check algorithm details
- Ready-bead query optimization (indexes, etc.)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema & Data Layer
- `packages/shared/src/db/schema/bead.ts` — Existing beads + beadEdges tables with all 4 edge types and status enum
- `packages/shared/src/db/schema/seed.ts` — Seed table with acceptance criteria, ontology schema (D-24 entity map)
- `packages/shared/src/types/index.ts` — Exported Bead, NewBead, BeadEdge, NewBeadEdge types

### LLM Gateway
- `packages/engine/src/gateway/gateway.ts` — LLM gateway with stage-based routing, failover, diversity enforcement
- `packages/engine/src/gateway/types.ts` — Gateway types including stage configuration

### Infrastructure
- `packages/engine/src/holdout/` — Inngest function patterns (Phase 4 established the pattern for Inngest v4 createFunction)

### Project Configuration
- `CLAUDE.md` §Stack Patterns — Ready-bead SQL query pattern, adjacency row storage, Inngest dispatch patterns

### Requirements
- `.planning/REQUIREMENTS.md` §DAG-01 through DAG-09 — All 9 requirements for this phase

### Prior Phase Context
- `.planning/phases/03-interview-seed-pipeline/03-CONTEXT.md` — D-24: Ontology entity map structure (used as decomposition input)
- `.planning/phases/04-holdout-vault/04-CONTEXT.md` — D-11: Inngest step-level env scoping pattern, D-13: Event-driven convergence pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `beads` table: Already has `moleculeId`, `estimatedTokens`, `status` (pending/claimed/active/completed/failed), `agentAssignment`, `claimedAt`, `completedAt`
- `beadEdges` table: Already has all 4 edge types enum (blocks, parent_child, conditional_blocks, waits_for) with fromBeadId/toBeadId
- `Bead`, `NewBead`, `BeadEdge`, `NewBeadEdge` types exported from shared package
- LLM Gateway with `generateObject` for structured output (used in Phase 3 scoring + Phase 4 holdout generation)
- Inngest v4 `createFunction` pattern established in Phase 4 holdout vault
- Event store for emitting pipeline events

### Established Patterns
- Stage-based model routing via `cauldron.config.ts` (add `decomposition` stage)
- Inngest `createFunction({ id, triggers: [{ event }] }, handler)` pattern (Phase 4 D-04 decision)
- `generateObject` with Zod schemas for structured LLM output
- Drizzle ORM for all database operations
- Integration tests against real PostgreSQL (no mocks)

### Integration Points
- Seed crystallization (Phase 3) -> decomposition input (this phase)
- Decomposition output -> bead dispatch -> Phase 6 execution engine
- Bead completion events -> ready-bead query -> next bead dispatch
- Holdout vault convergence event pattern (Phase 4) -> reusable for bead completion events

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-dag-decomposition-scheduler*
*Context gathered: 2026-03-26*
