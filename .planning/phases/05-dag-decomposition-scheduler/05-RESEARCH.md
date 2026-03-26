# Phase 5: DAG Decomposition & Scheduler - Research

**Researched:** 2026-03-26
**Domain:** DAG construction, Inngest v4 fan-in, Drizzle optimistic concurrency, LLM task decomposition
**Confidence:** HIGH (core Inngest semantics verified against official docs; Drizzle patterns verified against live codebase)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Decomposition Strategy**
- D-01: Two-pass hierarchical decomposition. Pass 1: LLM reads seed + ontology entity map, produces molecule tree. Pass 2: LLM decomposes each molecule into atomic beads with dependency edges.
- D-02: New `decomposition` stage added to `cauldron.config.ts` model assignments. Follows existing per-stage routing pattern.
- D-03: LLM infers dependency edges during Pass 2 (bead creation). Validated post-hoc by cycle detection.
- D-04: Auto-retry on invalid DAG — cycle detection + size validation runs after decomposition. Max 3 retries, surface to user on exhaustion.

**Token Size Estimation**
- D-05: LLM estimates token size during decomposition. `estimatedTokens` column already exists on beads table.
- D-06: Proportional budget allocation — LLM assigns splits of ~200k target based on bead complexity.
- D-07: Oversized beads auto-split — retry loop asks decomposition LLM to split them into sub-beads.
- D-08: No human review gate on decomposition output if validation passes.
- D-09: Acceptance criteria coverage mapping — each bead references which AC it covers. Coverage check ensures every AC has at least one bead. Gaps flagged for retry.

**Inngest Dispatch Model**
- D-10: One Inngest function per bead. Granular retry/timeout per bead.
- D-11: Fan-in via `step.waitForEvent()` — downstream bead awaits each upstream bead completion event. Research verified this works via `Promise.all()` with multiple `waitForEvent()` calls.
- D-12: All ready beads dispatched immediately after decomposition. Completion events trigger re-query.
- D-13: Inngest auto-retries bead function (configurable, e.g., 3). Failed bead marks downstream as blocked.
- D-14: `conditional-blocks` binary semantics: skip (not fail) if upstream failed.
- D-15: Configurable per-project concurrency limit (default 5). Enforced via Inngest concurrency controls.

**Atomic Claiming**
- D-16: Optimistic concurrency with version column for atomic bead claims.
- D-17: Ready-bead query uses SQL subquery pattern from CLAUDE.md.

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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DAG-01 | Seed acceptance criteria decomposed into molecules (non-atomic parent tasks) and beads (atomic leaf tasks) | Two-pass LLM decomposition with `generateObject` + Zod schema; `moleculeId` FK already exists on beads table |
| DAG-02 | Each bead sized to fit in one fresh context window (~200k tokens target) | LLM-assigned `estimatedTokens`; ~200k ≈ 150k words; rule of thumb: 1 LoC ≈ 10–20 tokens for code generation |
| DAG-03 | Bead size validated at decomposition time (not assumed) | Post-decomp validation step checks `estimatedTokens > 200_000`; triggers auto-split retry (D-07) |
| DAG-04 | Four dependency types supported: blocks/blocked-by, parent-child, conditional-blocks, waits-for | `bead_edge_type` enum and `bead_edges` table already exist with all 4 types; Inngest fan-in handles waits-for |
| DAG-05 | Parallel-by-default: beads execute concurrently unless explicit dependency edges exist | Ready-bead query returns all beads with no blocking incomplete upstreams; all dispatched at once via Inngest |
| DAG-06 | Synchronization gates (waits-for) fire when all upstream beads complete | `Promise.all([step.waitForEvent(...), step.waitForEvent(...)])` — verified pattern for Inngest v4 |
| DAG-07 | Cycle detection runs at DAG construction time and rejects cyclic graphs with clear error | Kahn's algorithm: if topological sort processes fewer nodes than total, cycle exists; error message names cycle |
| DAG-08 | Atomic bead claiming prevents race conditions when multiple agents request work | Optimistic concurrency: integer `version` column; `UPDATE beads SET status='claimed', version=version+1 WHERE id=? AND version=?`; 0 rows updated = conflict |
| DAG-09 | DAG state persisted: bead status, dependency edges, agent assignments | Already in schema: `beads` table (status, agentAssignment, claimedAt, completedAt) + `bead_edges` table |
</phase_requirements>

---

## Summary

Phase 5 builds the decomposition agent and DAG scheduler that sits between Phase 3's crystallized seed and Phase 6's execution engine. The schema foundation is already in place: `beads`, `bead_edges`, all four edge type enums, all five bead status values. This phase adds: (1) a decomposition service that calls the LLM twice to produce the molecule/bead hierarchy, (2) Kahn's cycle detection to validate the resulting graph, (3) an Inngest-based scheduler that dispatches ready beads and uses `step.waitForEvent()` fan-in for synchronization gates, and (4) optimistic concurrency claiming via a `version` integer column.

The critical research question — whether Inngest v4 `step.waitForEvent()` supports fan-in — is confirmed: `Promise.all()` with multiple `step.waitForEvent()` calls is the official pattern. There is NO native multi-event parameter. The important caveat is a known race condition where events sent before `waitForEvent()` registers will be missed; the mitigation is to emit completion events only after the downstream bead's Inngest function has already registered its listeners (which is guaranteed by Inngest's sequential function start).

**Primary recommendation:** Build the decomposition agent as a standalone service class (like Phase 4's vault module pattern), extract the core handler from the Inngest wrapper for testability, and write the concurrent-claim stress test against real PostgreSQL — no mocks.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `inngest` | 4.1.0 | Durable bead dispatch, fan-in waitForEvent, concurrency | Project constraint; established in Phase 4 |
| `drizzle-orm` | 0.45.1 | All DB operations including optimistic update | Project constraint |
| `zod` | 4.3.6 | Decomposition structured output schema | Already used throughout codebase |
| `ai` (Vercel AI SDK) | 6.0.138 | `generateObject` for structured LLM output | Project constraint; `generateObject` already used in Phase 3/4 |

### No New Dependencies Needed
This phase reuses all existing libraries. The schema needs one migration (add `version` integer to `beads`). No new npm packages required.

**Installation:** None required — all dependencies already present.

---

## Architecture Patterns

### Recommended Module Structure
```
packages/engine/src/decomposition/
├── decomposer.ts           # Two-pass LLM decomposition logic (extracted, testable)
├── validator.ts            # Kahn's cycle detection + token size validation
├── scheduler.ts            # Ready-bead query, dispatch, claiming logic
├── events.ts               # Inngest function wrappers (thin shell around extracted handlers)
├── types.ts                # DecompositionResult, MoleculeSpec, BeadSpec, etc.
├── index.ts                # Public exports
└── __tests__/
    ├── decomposer.test.ts
    ├── validator.test.ts
    ├── scheduler.test.ts
    ├── events.test.ts
    └── concurrent-claim.integration.test.ts  # Real PostgreSQL stress test
```

### Pattern 1: Extracted Handler (Phase 4 Established)
**What:** Core logic lives in a plain function; Inngest wrapper is thin.
**When to use:** Always for testable Inngest handlers.
```typescript
// Source: Phase 4 holdout/events.ts pattern
export async function beadDispatchHandler({ event, step }: { event: ...; step: ... }) {
  // All real logic here — no Inngest types required to test
}

export const handleBeadDispatched: InngestFunction<any, any, any, any> = inngest.createFunction(
  { id: 'dag/dispatch-bead', triggers: [{ event: 'bead.dispatch_requested' }] },
  (ctx) => beadDispatchHandler(ctx as any)
);
```

### Pattern 2: Inngest Fan-In via Promise.all
**What:** Downstream bead function calls multiple `step.waitForEvent()` in parallel.
**When to use:** Any bead with 2+ upstream `waits_for` edges.
**Confirmed working pattern** (verified against Inngest docs and GitHub issue #1046):
```typescript
// Source: Inngest documentation + GitHub issue #1046 (confirmed pattern)
// Wait for all N upstream bead completions before proceeding
const upstreamCompletions = await Promise.all(
  upstreamBeadIds.map(upstreamId =>
    step.waitForEvent(`wait-for-bead-${upstreamId}`, {
      event: 'bead.completed',
      match: 'data.beadId',   // CEL expression matching upstreamId
      timeout: '2h',
    })
  )
);
// null means timeout — handle as upstream failure
const timedOut = upstreamCompletions.some(result => result === null);
```

**CRITICAL CAVEAT — Race Condition:** If a completion event fires before `waitForEvent()` registers, it will be missed and `waitForEvent()` will timeout. Mitigation: Inngest functions are invoked sequentially per trigger; the downstream bead function registers listeners at function start before any upstream can complete (if dispatched in the same atomic batch). For long-running upstream beads this is not a risk.

**The race condition IS a real issue** (confirmed: GitHub issue #1433 is open, "lookback" feature not yet shipped). Mitigation strategy: dispatch downstream bead's Inngest function at decomposition time (so it registers listeners immediately), not at upstream-completion time.

### Pattern 3: Optimistic Concurrency for Bead Claiming
**What:** Integer version column + `UPDATE WHERE version = expected` pattern.
**When to use:** Atomic bead claiming by concurrent agents.

Schema migration required: add `version integer NOT NULL DEFAULT 1` to `beads`.

```typescript
// Source: Standard OCC pattern; Drizzle API verified via codebase inspection
// Returns 0-length array if version conflict (no row updated)
const updated = await db
  .update(beads)
  .set({ status: 'claimed', version: sql`${beads.version} + 1`, claimedAt: new Date(), agentAssignment: agentId })
  .where(and(eq(beads.id, beadId), eq(beads.version, currentVersion), eq(beads.status, 'pending')))
  .returning({ id: beads.id });

if (updated.length === 0) {
  // Version conflict — another agent claimed this bead first
  throw new ClaimConflictError(beadId);
}
```

Note: With `postgres` driver, `.returning()` is the reliable way to check affected rows. An empty `.returning()` result means 0 rows updated. The `rowCount` approach is driver-dependent and less reliable with Drizzle's postgres-js adapter.

### Pattern 4: Kahn's Algorithm for Cycle Detection
**What:** BFS-based topological sort that detects cycles as a byproduct.
**When to use:** After every DAG mutation, before any dispatch.
```typescript
// Source: Standard algorithm, language-agnostic
function detectCycle(beadIds: string[], edges: Array<{fromBeadId: string; toBeadId: string}>): string[] | null {
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const id of beadIds) {
    indegree.set(id, 0);
    adjacency.set(id, []);
  }
  for (const edge of edges) {
    // Only blocking edges enforce execution order for cycle detection
    adjacency.get(edge.fromBeadId)?.push(edge.toBeadId);
    indegree.set(edge.toBeadId, (indegree.get(edge.toBeadId) ?? 0) + 1);
  }

  const queue = [...beadIds].filter(id => (indegree.get(id) ?? 0) === 0);
  let processed = 0;

  while (queue.length > 0) {
    const node = queue.shift()!;
    processed++;
    for (const neighbor of adjacency.get(node) ?? []) {
      const newDegree = (indegree.get(neighbor) ?? 1) - 1;
      indegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  // If processed < total nodes, a cycle exists
  // Return cycle participants (nodes with remaining indegree > 0)
  if (processed < beadIds.length) {
    return beadIds.filter(id => (indegree.get(id) ?? 0) > 0);
  }
  return null;
}
```

**Edge type scoping for cycle detection:** The `parent_child` and `blocks` edges impose execution ordering and MUST be included. The `waits_for` edge also imposes ordering and should be included. The `conditional_blocks` edge is conditional; include it for cycle detection to be conservative (a cycle involving optional paths is still a cycle).

### Pattern 5: Ready-Bead Query (from CLAUDE.md)
```sql
-- Source: CLAUDE.md §Stack Patterns
SELECT * FROM beads
WHERE status = 'pending'
AND NOT EXISTS (
  SELECT 1 FROM bead_edges
  WHERE bead_edges.to_bead_id = beads.id
  AND bead_edges.edge_type IN ('blocks', 'waits_for')
  AND bead_edges.from_bead_id IN (
    SELECT id FROM beads WHERE status != 'completed'
  )
)
```

In Drizzle:
```typescript
// Source: CLAUDE.md pattern, adapted to Drizzle sql`` template
const readyBeads = await db
  .select()
  .from(beads)
  .where(
    and(
      eq(beads.status, 'pending'),
      not(exists(
        db.select({ one: sql`1` })
          .from(beadEdges)
          .innerJoin(beads as blockers, eq(beadEdges.fromBeadId, blockers.id))
          .where(
            and(
              eq(beadEdges.toBeadId, beads.id),
              inArray(beadEdges.edgeType, ['blocks', 'waits_for']),
              not(eq(blockers.status, 'completed'))
            )
          )
      ))
    )
  );
```

### Pattern 6: Inngest Concurrency Per-Project
```typescript
// Source: Inngest concurrency docs
inngest.createFunction(
  {
    id: 'dag/execute-bead',
    concurrency: {
      limit: 5,           // configurable default from project settings
      scope: 'fn',        // per-function limit
      key: 'event.data.projectId',  // virtual queue per project
    },
    retries: 3,
    timeouts: { finish: '30m' },
  },
  triggers: [{ event: 'bead.dispatch_requested' }],
  handler
);
```

### Anti-Patterns to Avoid
- **Dispatching downstream bead only after upstream completes:** Creates the `step.waitForEvent()` race condition. All Inngest functions should be created at decomposition time; downstream functions register listeners immediately.
- **Using `inngest.send()` inside Inngest steps:** Use `step.sendEvent()` inside handlers to guarantee exactly-once delivery.
- **Checking `rowCount` for OCC result:** Use `.returning()` on the update and check array length — more reliable with the `postgres` driver.
- **Mocking PostgreSQL in concurrent-claim tests:** The stress test MUST use real PostgreSQL (per MEMORY.md feedback and Phase 4 pattern). Mocks cannot simulate MVCC behavior.
- **Including ALL edge types in the ready-bead query:** Only `blocks` and `waits_for` gate execution. `parent_child` tracks hierarchy, not ordering. `conditional_blocks` only gates if upstream failed (special handling).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Durable job scheduling | Custom job queue with retry logic | Inngest v4 with `step.run()` | Re-invocation, memoization, retry state — Inngest handles all of this durably |
| Fan-in synchronization | Custom event counter/semaphore | `Promise.all([step.waitForEvent(...)])` | Inngest checkpoints state across re-invocations; a custom counter would be lost on crash |
| Structured LLM output parsing | Manual JSON parsing | `generateObject` with Zod schema | Automatic schema validation, retry on invalid output, TypeScript inference |
| Token counting | tiktoken integration | LLM self-estimate during decomposition | LLMs estimate context usage well for task descriptions; tiktoken adds a dependency for pre-implementation estimation that's inherently imprecise anyway |

**Key insight:** Inngest's durability story is precisely why raw BullMQ was rejected. The fan-in problem is the hardest part of this phase — `Promise.all(waitForEvent)` being the documented pattern means no custom aggregation infrastructure is needed.

---

## Common Pitfalls

### Pitfall 1: waitForEvent Race Condition (CRITICAL)
**What goes wrong:** If a `bead.completed` event fires before the downstream bead's Inngest function has called `step.waitForEvent()`, the event is missed. The wait times out, blocking the downstream bead indefinitely.
**Why it happens:** Inngest does not have a "lookback" — `waitForEvent()` only catches events fired AFTER registration. This is confirmed open issue #1433.
**How to avoid:** Dispatch the downstream bead's Inngest function at decomposition time (when it registers listeners), NOT at upstream completion time. Since Inngest serially processes triggers and the downstream function starts first, by the time upstream bead execution begins, listeners are already registered.
**Warning signs:** Diamond DAG test hangs; fan-in gate never fires even though both upstream beads completed.

### Pitfall 2: Cycle Detection Edge Scoping
**What goes wrong:** Excluding `waits_for` edges from cycle detection allows cycles involving synchronization gates (A waits for B waits for A).
**Why it happens:** Developer treats `waits_for` as "soft" ordering rather than "hard" dependency.
**How to avoid:** Include `blocks`, `waits_for`, and `conditional_blocks` edges in cycle detection. Only `parent_child` is a hierarchy label, not a scheduling constraint.
**Warning signs:** Inngest functions deadlock waiting for each other; scheduler never dispatches any beads.

### Pitfall 3: OCC False Conflict on updatedAt Comparison
**What goes wrong:** Using `updatedAt` timestamp instead of an integer version column for optimistic concurrency — two transactions completing within the same millisecond appear to have the same version and one claim silently overwrites the other.
**Why it happens:** Timestamp resolution is finite; integer version increments are atomic.
**How to avoid:** Use an integer `version` column (D-16). `UPDATE WHERE version = N` + `SET version = N+1` is unambiguous.
**Warning signs:** Concurrent claim stress test shows 2 successful claims for the same bead.

### Pitfall 4: Missing Coverage Check Retry Causing Silent Gaps
**What goes wrong:** Decomposition produces beads that cover 8 of 10 acceptance criteria. The remaining 2 criteria have no coverage. No retry is triggered. Phase 6 builds software that doesn't satisfy 2 of the seed's ACs.
**Why it happens:** Coverage check is skipped or only logs a warning instead of triggering a retry.
**How to avoid:** Coverage check is a hard gate (D-09). If `coveredCriteria.length < acceptanceCriteria.length`, treat as a validation failure equal to a cycle — increment retry counter.
**Warning signs:** After decomposition, some AC IDs appear in no bead's `coversCriteria` array.

### Pitfall 5: Decomposition Stage Missing from GatewayConfig Type
**What goes wrong:** Adding `decomposition` to `cauldron.config.ts` breaks TypeScript because `PipelineStage` type in `gateway/types.ts` doesn't include it.
**Why it happens:** `PipelineStage` is a string union; extending it requires updating the type AND the `STAGE_PREAMBLES` map in `gateway.ts`.
**How to avoid:** Update `PipelineStage` union, add entry to `STAGE_PREAMBLES`, add `decomposition` key to `cauldron.config.ts`, and add `GatewayConfig.models` — all in one commit.
**Warning signs:** TypeScript error on `stage: 'decomposition'` in gateway calls.

### Pitfall 6: Missing `bead_dispatched` Event Type
**What goes wrong:** Trying to emit a `bead_dispatched` event fails because the `event_type` enum doesn't include it. `ALTER TYPE ADD VALUE` cannot run inside a transaction (same issue as migration 0003/0004).
**Why it happens:** The migration for new event types requires the same `-- statement-breakpoint` pattern used in migration 0004.
**How to avoid:** Plan the migration for new event types at the start. Add `decomposition_started`, `bead_dispatched`, `decomposition_failed` to the enum in the migration file, outside any transaction block.
**Warning signs:** Runtime error: "invalid input value for enum event_type".

---

## Code Examples

### Two-Pass Decomposition Zod Schema
```typescript
// Source: Pattern based on Phase 3/4 generateObject usage in codebase
import { z } from 'zod';

const MoleculeSchema = z.object({
  id: z.string().describe('Unique slug for this molecule (e.g., "auth-layer")'),
  title: z.string(),
  description: z.string(),
  coversCriteria: z.array(z.string()).describe('Acceptance criterion IDs this molecule addresses'),
});

const BeadSpec = z.object({
  id: z.string().describe('Unique slug for this bead (e.g., "auth-layer/jwt-middleware")'),
  moleculeId: z.string().describe('Parent molecule slug'),
  title: z.string(),
  spec: z.string().describe('Precise implementation specification'),
  estimatedTokens: z.number().int().describe('Estimated total context window usage in tokens: spec + seed excerpt + expected code + dependency context'),
  coversCriteria: z.array(z.string()).describe('Acceptance criterion IDs this bead directly implements'),
  dependsOn: z.array(z.string()).describe('Bead IDs that must complete before this bead can start (blocks edges)'),
  waitsFori: z.array(z.string()).describe('Bead IDs whose outputs this bead requires (waits_for edges)'),
  conditionalOn: z.string().optional().describe('Bead ID this bead only runs if that bead succeeded (conditional_blocks edge)'),
});

const DecompositionOutputSchema = z.object({
  molecules: z.array(MoleculeSchema),
  beads: z.array(BeadSpec),
});
```

### Integration Test Concurrent Claim Pattern
```typescript
// Source: Phase 4 integration test pattern (real PostgreSQL, no mocks)
// Run in packages/shared or packages/engine integration test suite
it('concurrent claim: exactly one agent wins', async () => {
  const [bead] = await db.insert(beads).values({
    seedId, title: 'Test', spec: 'Test', status: 'pending', version: 1
  }).returning();

  // Fire 10 concurrent claim attempts
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) =>
      claimBead(db, bead!.id, `agent-${i}`)
    )
  );

  const successes = results.filter(r => r.status === 'fulfilled' && r.value !== null);
  expect(successes).toHaveLength(1); // Exactly one winner
});
```

### Inngest Function with Per-Project Concurrency
```typescript
// Source: Inngest concurrency docs + established createFunction pattern from Phase 4
export const handleBeadDispatchRequested: InngestFunction<any, any, any, any> = inngest.createFunction(
  {
    id: 'dag/execute-bead',
    triggers: [{ event: 'bead.dispatch_requested' }],
    concurrency: {
      limit: 5,
      scope: 'fn',
      key: 'event.data.projectId',
    },
    retries: 3,
  },
  (ctx) => beadExecutionHandler(ctx as any)
);
```

---

## Schema Changes Required

### Migration 0005: beads version column + event types + indexes
The beads table needs a `version` column for optimistic concurrency (D-16). The event_type enum needs new values for decomposition lifecycle events. PostgreSQL `ALTER TYPE ADD VALUE` cannot run in a transaction — same pattern as migration 0004.

```sql
-- Migration 0005: DAG decomposition support
-- ALTER TYPE ADD VALUE must run outside transaction (use Drizzle breakpoint format)

ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'decomposition_started' AFTER 'seed_crystallized';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'decomposition_completed' AFTER 'decomposition_started';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'decomposition_failed' AFTER 'decomposition_completed';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'bead_dispatched' AFTER 'decomposition_failed';--> statement-breakpoint

-- Add version column for optimistic concurrency (D-16)
ALTER TABLE "beads" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;--> statement-breakpoint

-- Add criteria coverage column: JSONB array of AC IDs this bead covers (D-09)
ALTER TABLE "beads" ADD COLUMN IF NOT EXISTS "covers_criteria" jsonb NOT NULL DEFAULT '[]';--> statement-breakpoint

-- Index: ready-bead query needs index on (status, seed_id) for the NOT EXISTS subquery
CREATE INDEX IF NOT EXISTS "beads_status_seed_idx" ON "beads" ("status", "seed_id");--> statement-breakpoint

-- Index: bead_edges lookup by to_bead_id for ready-bead query inner join
CREATE INDEX IF NOT EXISTS "bead_edges_to_bead_idx" ON "bead_edges" ("to_bead_id", "edge_type");
```

### Drizzle Schema Updates Required
- `bead.ts`: add `version: integer('version').notNull().default(1)` and `coversCriteria: jsonb('covers_criteria').notNull().default([])` columns
- `gateway/types.ts`: add `'decomposition'` to `PipelineStage` union
- `gateway/gateway.ts`: add `decomposition` entry to `STAGE_PREAMBLES`
- `cauldron.config.ts`: add `decomposition: ['claude-sonnet-4-6', 'gpt-4.1']` to models

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| BullMQ FlowProducer for parent-child | Inngest `step.sendEvent()` fan-out + `step.waitForEvent()` fan-in | Decision recorded in STATE.md | FlowProducer concept replaced by Inngest's event-driven coordination |
| Native multi-event waitForEvent | `Promise.all([waitForEvent, waitForEvent])` | Feature request closed as "not planned" (GH #1046) | No change to approach; this IS the pattern |

**Deprecated/outdated:**
- FlowProducer (BullMQ): The STATE.md note "BullMQ FlowProducer accessible via Inngest internals" is misleading. Inngest does NOT expose BullMQ FlowProducer as a first-class API. The correct pattern is `step.sendEvent()` for fan-out and `Promise.all(step.waitForEvent())` for fan-in — no BullMQ FlowProducer needed or accessible.

---

## Open Questions

1. **Inngest waitForEvent race condition — full mitigation**
   - What we know: If a downstream bead's Inngest function hasn't registered its `waitForEvent()` listeners before an upstream completion event fires, the event is missed. This is a confirmed open bug (#1433).
   - What's unclear: Does dispatching all bead Inngest functions at decomposition time (not at upstream-completion time) fully mitigate this? The Inngest model is: function starts, immediately executes code up to the first `step.*` call, registers the listener, then suspends. If all downstream functions are dispatched first, they will have registered listeners before any upstream work begins.
   - Recommendation: Implement the "dispatch all at decomposition time" model (D-12 already says "all ready beads dispatched immediately"). For fan-in beads (those with `waits_for` edges), dispatch them at decomposition time even though they will immediately block on `waitForEvent()`. This is the safe pattern.

2. **`conditional_blocks` edge — Inngest handling**
   - What we know: D-14 defines binary semantics: if upstream succeeded, run the conditional bead; if upstream failed, skip it.
   - What's unclear: Inngest doesn't have native "skip on upstream failure" — the downstream function must check the `waitForEvent()` result payload to determine if upstream passed or failed, then return early.
   - Recommendation: In the bead execution handler, after `step.waitForEvent()` for a `conditional_blocks` upstream, check the event payload's `status` field. If `status === 'failed'`, emit a `bead_skipped` (or mark status = 'skipped') and return without executing. This requires a `'skipped'` value added to `bead_status` enum, OR reuse the existing `completed` status with a `skipReason` field. Recommend adding `'skipped'` to the enum.

3. **Token estimation accuracy**
   - What we know: LLMs estimate tokens based on task descriptions. Rule of thumb: ~10–20 tokens per line of code; 1 word ≈ 1.3 tokens.
   - What's unclear: How accurate are LLM self-estimates for code generation tasks? The risk is systematic underestimation.
   - Recommendation: Instruct the decomposition LLM to include a generous buffer (e.g., "estimate as if the implementation will be verbose, tests included"). The 200k limit is for the implementation agent's context, not the spec — so `estimatedTokens` should cover: spec text + seed excerpt (~10k) + expected code size + test code size + dependency context.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL (dev, port 5432) | All DB operations | Already configured (Phase 1) | — | — |
| PostgreSQL (test, port 5433) | Integration tests | Already configured (Phase 1) | — | — |
| Inngest dev server | Local function dispatch | Already configured (Phase 1) | — | — |
| Node.js | Runtime | v22.22.1 | v22.22.1 | — |

All dependencies are available from prior phases. No new environment setup required.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `packages/engine/vitest.config.ts` (exists; `include: ['src/**/*.test.ts']`) |
| Quick run command | `pnpm --filter @cauldron/engine test` |
| Full suite command | `pnpm --filter @cauldron/engine test && pnpm --filter @cauldron/shared test:integration` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DAG-01 | Two-pass decomposition produces molecules and beads | unit | `pnpm --filter @cauldron/engine test src/decomposition/__tests__/decomposer.test.ts` | ❌ Wave 0 |
| DAG-02 | estimatedTokens is set on every bead | unit | above | ❌ Wave 0 |
| DAG-03 | Beads over 200k tokens are flagged and rejected | unit | `pnpm --filter @cauldron/engine test src/decomposition/__tests__/validator.test.ts` | ❌ Wave 0 |
| DAG-04 | All 4 edge types persisted and retrievable | integration | `pnpm --filter @cauldron/shared test:integration` (schema-invariants.integration.test.ts already covers this — ✅ exists) | ✅ |
| DAG-05 | Ready-bead query returns all unblocked pending beads | integration | `pnpm --filter @cauldron/shared test:integration src/db/__tests__/scheduler.integration.test.ts` | ❌ Wave 0 |
| DAG-06 | Diamond DAG fan-in: downstream fires only after both upstreams complete | integration | `pnpm --filter @cauldron/engine test src/decomposition/__tests__/scheduler.test.ts` (fake step) | ❌ Wave 0 |
| DAG-07 | Cyclic DAG rejected with human-readable error | unit | `pnpm --filter @cauldron/engine test src/decomposition/__tests__/validator.test.ts` | ❌ Wave 0 |
| DAG-08 | Concurrent claim: exactly one agent wins (stress test) | integration | `pnpm --filter @cauldron/engine test src/decomposition/__tests__/concurrent-claim.integration.test.ts` | ❌ Wave 0 |
| DAG-09 | Bead status + edges persisted correctly | integration | existing schema-invariants test covers edges ✅; new test for status transitions | ❌ Wave 0 (status transitions) |

### Sampling Rate
- **Per task commit:** `pnpm --filter @cauldron/engine test`
- **Per wave merge:** `pnpm --filter @cauldron/engine test && pnpm --filter @cauldron/shared test:integration && pnpm build`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/engine/src/decomposition/__tests__/decomposer.test.ts` — covers DAG-01, DAG-02 (unit tests with mocked LLM gateway)
- [ ] `packages/engine/src/decomposition/__tests__/validator.test.ts` — covers DAG-03, DAG-07 (pure functions, no DB)
- [ ] `packages/engine/src/decomposition/__tests__/scheduler.test.ts` — covers DAG-05, DAG-06 (fake step object pattern from Phase 4)
- [ ] `packages/engine/src/decomposition/__tests__/concurrent-claim.integration.test.ts` — covers DAG-08 (real PostgreSQL, no mocks)
- [ ] `packages/shared/src/db/__tests__/scheduler.integration.test.ts` — covers DAG-05 ready-bead SQL query correctness

---

## Sources

### Primary (HIGH confidence)
- Inngest `step.waitForEvent()` reference docs — `https://www.inngest.com/docs/reference/functions/step-wait-for-event` — API signature, timeout behavior, match semantics
- Inngest concurrency docs — `https://www.inngest.com/docs/functions/concurrency` — limit, scope, key syntax
- Inngest `createFunction` reference — `https://www.inngest.com/docs/reference/typescript/functions/create` — full config options including retries, timeouts, concurrency
- Inngest `step.invoke()` reference — `https://www.inngest.com/docs/reference/functions/step-invoke` — synchronous cross-function invocation
- Cauldron codebase: `packages/shared/src/db/schema/bead.ts` — confirmed exact column names and types
- Cauldron codebase: `packages/engine/src/holdout/events.ts` — confirmed Inngest v4 createFunction API, extracted handler pattern
- Cauldron codebase: `packages/engine/src/gateway/types.ts` — confirmed PipelineStage union to extend

### Secondary (MEDIUM confidence)
- Inngest step parallelism docs — `https://www.inngest.com/docs/guides/step-parallelism` — Promise.all step execution model
- Inngest fan-out docs — `https://www.inngest.com/docs/guides/fan-out-jobs` — event-driven fan-out mechanics
- Drizzle ORM update docs — `https://orm.drizzle.team/docs/update` — `.returning()` pattern for update confirmation

### Tertiary (LOW confidence — flag for validation)
- GitHub issue #1046 (closed "not planned") — `Promise.all(waitForEvent)` workaround confirmed by issue comments, not official docs
- GitHub issue #1433 (open) — waitForEvent race condition with quick succession events; mitigation strategy is planner's recommendation, not officially documented

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries established from prior phases; no new dependencies
- Inngest fan-in semantics: HIGH — verified against official docs + GitHub issues; `Promise.all(waitForEvent)` is confirmed pattern
- Inngest race condition: HIGH — confirmed open issue with exact reproduction; mitigation strategy is architectural (dispatch-at-decomposition-time) and logically sound
- Drizzle OCC: HIGH — `.returning()` pattern observed throughout codebase; integer version column is standard practice
- Kahn's algorithm: HIGH — well-established algorithm; TypeScript adaptation is straightforward
- Token estimation: MEDIUM — LLM self-estimation approach is reasonable but empirically unvalidated for this specific use case
- Decomposition prompt patterns: MEDIUM — based on general LLM structured output practices, not domain-specific validation

**Research date:** 2026-03-26
**Valid until:** 2026-04-25 (Inngest v4 SDK is stable; fast-moving area is `waitForEvent` race condition fix — check GH #1433 before implementation)
