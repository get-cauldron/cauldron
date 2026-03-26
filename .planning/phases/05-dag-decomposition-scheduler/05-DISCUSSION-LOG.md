# Phase 5: DAG Decomposition & Scheduler - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 05-dag-decomposition-scheduler
**Areas discussed:** Decomposition strategy, Token size estimation, Inngest dispatch model, Atomic claiming & scheduling

---

## Decomposition Strategy

### Q1: How should the LLM decompose a seed into molecules and beads?

| Option | Description | Selected |
|--------|-------------|----------|
| Two-pass hierarchical | Pass 1: molecule tree from seed + ontology. Pass 2: atomic beads with edges per molecule. | ✓ |
| Single structured call | One LLM call produces full hierarchy + edges. Simpler but risks quality. | |
| Iterative refinement | Initial decomposition + validation + refinement. Three+ calls, highest quality. | |
| You decide | Claude's discretion | |

**User's choice:** Two-pass hierarchical
**Notes:** None

### Q2: How should dependency edges between beads be determined?

| Option | Description | Selected |
|--------|-------------|----------|
| LLM infers edges during decomposition | Edges output as part of Pass 2. Validated by cycle detection. | ✓ |
| Separate dependency analysis pass | Third LLM call determines edges after beads created. | |
| You decide | Claude's discretion | |

**User's choice:** LLM infers edges during decomposition
**Notes:** None

### Q3: Model routing for decomposition?

| Option | Description | Selected |
|--------|-------------|----------|
| New 'decomposition' stage | Add to cauldron.config.ts. Strong reasoning model default. | ✓ |
| Reuse interview stage model | Same model as interview. Simpler but may not be optimal. | |
| You decide | Claude's discretion | |

**User's choice:** New 'decomposition' stage
**Notes:** None

### Q4: Invalid DAG handling?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-retry with error context | Retry with specific errors, max 3 retries, then surface to user. | ✓ |
| Fail and surface immediately | No retry, show errors to user. | |
| You decide | Claude's discretion | |

**User's choice:** Auto-retry with error context
**Notes:** None

---

## Token Size Estimation

### Q1: How to estimate token size at decomposition time?

| Option | Description | Selected |
|--------|-------------|----------|
| LLM estimates during decomposition | Annotates each bead with estimated tokens. Rough but immediate. | ✓ |
| Heuristic-based post-processing | Rule-based: spec length x multiplier + overhead. Predictable. | |
| Dedicated sizing LLM call | Separate LLM call per bead. Most accurate but N extra calls. | |
| You decide | Claude's discretion | |

**User's choice:** LLM estimates during decomposition
**Notes:** None

### Q2: Token budget breakdown for ~200k target?

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed allocation bands | ~30k spec, ~40k deps, ~80k implementation, ~50k reserved. | |
| Proportional to complexity | LLM assigns splits based on bead nature. More adaptive. | ✓ |
| You decide | Claude's discretion | |

**User's choice:** Proportional to complexity
**Notes:** User preferred adaptive allocation over fixed bands.

### Q3: Oversized bead handling?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-split via LLM | Validation detects, LLM splits into sub-beads in retry loop. | ✓ |
| Flag for human review | Flagged but user decides how to split. | |
| You decide | Claude's discretion | |

**User's choice:** Auto-split via LLM
**Notes:** None

### Q4: Human review of decomposition output?

| Option | Description | Selected |
|--------|-------------|----------|
| Visual preview with approve/edit | Show tree + graph + coverage. User approves before dispatch. | |
| Auto-dispatch after validation | If passes validation, dispatch immediately. No human gate. | ✓ |
| You decide | Claude's discretion | |

**User's choice:** Auto-dispatch after validation
**Notes:** No human gate on decomposition — faster pipeline. Notable departure from holdout vault (which has human review).

### Q5: Acceptance criteria coverage tracking?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, mapped at decomposition | Each bead references criteria. Coverage check post-decomposition. | ✓ |
| No explicit mapping | Coverage implicit via molecule hierarchy. | |
| You decide | Claude's discretion | |

**User's choice:** Yes, mapped at decomposition
**Notes:** None

---

## Inngest Dispatch Model

### Q1: How should beads map to Inngest jobs?

| Option | Description | Selected |
|--------|-------------|----------|
| One Inngest function per bead | Granular retry/timeout per bead. FlowProducer for parent-child. | ✓ |
| One function per molecule | Molecule orchestrates child beads as steps. Less parallelism. | |
| Hybrid | Molecule functions with step.run() per bead inside. | |
| You decide | Claude's discretion | |

**User's choice:** One Inngest function per bead
**Notes:** None

### Q2: Fan-in synchronization for waits-for?

| Option | Description | Selected |
|--------|-------------|----------|
| step.waitForEvent() per upstream | Native Inngest pattern. Needs v4 SDK verification. | ✓ |
| Polling-based readiness check | Scheduler polls DB for completion status. Less elegant. | |
| You decide | Claude's discretion | |

**User's choice:** step.waitForEvent() per upstream
**Notes:** STATE.md blocker flagged — research must verify against Inngest v4 SDK.

### Q3: Initial DAG dispatch approach?

| Option | Description | Selected |
|--------|-------------|----------|
| All ready beads dispatched immediately | Ready-bead query, dispatch all, event-driven cascade. | ✓ |
| Wave-based dispatch | Topological sort into waves. Simpler but less parallel. | |
| You decide | Claude's discretion | |

**User's choice:** All ready beads dispatched immediately
**Notes:** None

### Q4: Bead failure handling?

| Option | Description | Selected |
|--------|-------------|----------|
| Retry bead, then fail molecule | Inngest retries (e.g. 3x). Exhaust -> fail bead, block downstream. | ✓ |
| Immediate molecule failure | Any bead failure -> fail molecule. Fast-fail. | |
| You decide | Claude's discretion | |

**User's choice:** Retry bead, then fail molecule
**Notes:** None

### Q5: conditional-blocks semantics?

| Option | Description | Selected |
|--------|-------------|----------|
| Simple: skip if upstream fails | Binary: optional bead runs only if upstream succeeded. | ✓ |
| Configurable conditions | Arbitrary expressions. More powerful but complex. | |
| You decide | Claude's discretion | |

**User's choice:** Simple: skip if upstream fails
**Notes:** None

---

## Atomic Claiming & Scheduling

### Q1: Atomic bead claiming mechanism?

| Option | Description | Selected |
|--------|-------------|----------|
| PostgreSQL UPDATE ... WHERE | Row-level locking. Simple, proven. | |
| Optimistic concurrency with version column | Version/etag column. Claim requires matching version. | ✓ |
| Redis distributed lock | Redis lock keyed by bead ID. Belt-and-suspenders. | |
| You decide | Claude's discretion | |

**User's choice:** Optimistic concurrency with version column
**Notes:** User chose optimistic concurrency over simpler row locking — adds a version column to beads table.

### Q2: Ready-bead query approach?

| Option | Description | Selected |
|--------|-------------|----------|
| SQL subquery pattern from CLAUDE.md | SELECT pending beads with no incomplete blocking deps. | ✓ |
| Materialized readiness state | Maintain 'ready' status directly on beads. Faster reads. | |
| You decide | Claude's discretion | |

**User's choice:** SQL subquery from CLAUDE.md
**Notes:** None

### Q3: Concurrency limit?

| Option | Description | Selected |
|--------|-------------|----------|
| Configurable per-project limit | Default max concurrent beads (e.g. 5). In project settings. | ✓ |
| No limit | Let Inngest handle it. Maximum parallelism. | |
| You decide | Claude's discretion | |

**User's choice:** Configurable per-project limit
**Notes:** None

---

## Claude's Discretion

- Exact decomposition prompt content and system messages
- Zod schemas for decomposition structured output
- Kahn's algorithm implementation details
- Inngest function naming and configuration patterns
- Version column data type and naming
- Retry backoff strategy for bead failures
- Event naming conventions for bead completion events
- Coverage check algorithm details
- Ready-bead query optimization (indexes)

## Deferred Ideas

None — discussion stayed within phase scope.
