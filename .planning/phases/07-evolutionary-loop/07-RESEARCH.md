# Phase 7: Evolutionary Loop - Research

**Researched:** 2026-03-26
**Domain:** Autonomous evolution FSM, LLM-judge scoring, convergence detection, embedding similarity, lateral thinking personas, Inngest durable orchestration
**Confidence:** HIGH

## Summary

Phase 7 completes the full Cauldron autonomous loop. The pipeline already supports `evolution_started` (emitted by `convergenceHandler` in holdout/events.ts when holdout tests fail) and `evolution_converged` events in the DB enum. Phase 7 must implement the entire evaluation-to-re-execution cycle that these events bracket.

The core new modules are: (1) a **goal attainment evaluator** — an LLM judge with a weighted rubric derived from seed's `evaluationPrinciples`, producing a 0.0–1.0 score per dimension; (2) an **evolution FSM** as an Inngest durable function orchestrating the 8-state machine; (3) **five convergence signal detectors** (ontology stability, stagnation, oscillation, repetitive feedback, hard cap); (4) **lateral thinking persona engine** (5 parallel personas + meta-judge); (5) **lineage-level budget enforcement** extending the existing `checkBudget` pattern; and (6) **DB migrations** adding `generation` and `evolution_context` JSONB to the `seeds` table plus new event types to `event_type` enum.

The architecture is a single Inngest function (`evolution/run-cycle`) listening on `evolution_started`, with `step.run` for each durable sub-step. Seed mutation follows the existing `crystallizeSeed` pattern (INSERT only, never UPDATE). Embedding computation uses OpenAI `text-embedding-3-large` via direct Vercel AI SDK `embed()` call — the AI SDK v6 supports `embed` natively with `@ai-sdk/openai`.

**Primary recommendation:** Implement the evolution cycle as one Inngest function (`evolution/run-cycle`) with ~12 `step.run` steps matching the 8-state FSM. All sub-services (GoalEvaluator, ConvergenceDetector, LateralThinkingEngine, SeedMutator) are plain TypeScript classes following the module-level deps pattern already established in holdout/events.ts and decomposition/events.ts.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Goal vs Spec Evaluation (EVOL-01, EVOL-02)**
- D-01: LLM judge with rubric for goal attainment — separate from holdout pass/fail (spec compliance)
- D-02: Score >= 0.95 = success, below triggers evolution
- D-03: Cross-model diversity enforced for evaluator (different family than implementer)
- D-04: evaluation_principles from seed map to weighted rubric dimensions. LLM scores each dimension, weighted sum produces final score
- D-05: Gap analysis is per-dimension: each rubric dimension gets a gap statement with score and description

**Evolution Trigger & Seed Mutation (EVOL-03, EVOL-04)**
- D-06: Tiered evolution based on score:
  - Score < 0.4 → full seed regeneration (re-run crystallizer with gap analysis as context) + re-run all beads
  - Score >= 0.4 → LLM rewrites acceptance criteria only, goal/constraints unchanged + keep completed beads, add new ones
- D-07: Evolved seeds track generation counter + evolution_context JSONB (gap analysis, score, tier used)
- D-08: Bead reuse follows same tiered approach: < 0.4 = clean slate, >= 0.4 = keep completed, add new

**Convergence Signals (EVOL-05 through EVOL-09)**
- D-09: Any-of, independent — first signal to fire halts the loop. evolution_context records which signal fired
- D-10: Ontology stability: AC set Jaccard similarity + embedding cosine similarity, both must be >= 0.95 across 2 consecutive generations
- D-11: Embeddings via OpenAI text-embedding-3-large (3072 dims). 0.95 threshold calibrated for this model
- D-12: Oscillation detection checks periods 2-4 (similarity to grandparent, great-grandparent, great-great-grandparent)
- D-13: Repetitive feedback: structured gap IDs first (hash of dimension + description), embedding similarity fallback (>= 0.70 cosine = repetitive)

**Lateral Thinking & Escalation (EVOL-10, EVOL-11)**
- D-14: All 5 personas (contrarian, hacker, simplifier, researcher, architect) run in parallel on stagnation, each producing an alternative seed proposal
- D-15: LLM meta-judge (cross-model from personas) selects the most promising proposal or merges complementary ideas
- D-16: Human escalation fires only AFTER lateral thinking fails (stagnation → personas → still stagnant → escalate)
- D-17: Notification: always emit 'evolution_escalated' event + optionally fire webhook if configured in project settings

**Token Budget Circuit Breaker (EVOL-12)**
- D-18: Cumulative cost tracked per seed lineage (not per generation). Uses existing llm_usage table with evolution_cycle column. BudgetExceededError fires when lineage total exceeds configurable threshold

**Holdout Unsealing**
- D-19: Unseal holdout tests on ANY terminal state (convergence, hard cap, budget exceeded, human-approved stop). Results are always valuable feedback

**v1 Test Case Strategy**
- D-20: Sabotage holdouts to guarantee at least one evolutionary cycle. Write holdout tests targeting edge cases the first seed doesn't mention

**Evolution FSM**
- D-21: 8-state granular FSM for maximum observability:
  - idle → evaluating → scoring → evolving → decomposing → executing → merging → (back to evaluating)
  - lateral_thinking (sub-state of evolving, activated on stagnation)
  - converged (terminal, positive)
  - halted (terminal: hard cap, budget, or escalation)

### Claude's Discretion
- Specific rubric dimension names and default weights (can be overridden by seed evaluation_principles)
- Internal prompt design for the LLM judge and lateral thinking personas
- Embedding model integration details (AI SDK vs direct API call)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EVOL-01 | Post-execution evaluation assesses goal attainment (not just spec compliance) | GoalEvaluator class, `evaluation` PipelineStage exists, gateway.generateObject pattern established |
| EVOL-02 | Evaluation uses weighted principles from the seed's evaluation_principles field | Seed schema has `evaluationPrinciples: jsonb` — maps directly to weighted rubric dimensions |
| EVOL-03 | If goal not met, system generates a new immutable evolved seed with parent reference | crystallizeSeed() pattern established; parentSeedId param already supported |
| EVOL-04 | Evolution decomposes new/changed acceptance criteria into new beads | beadDispatchHandler pattern established; tiered bead reuse (D-08) needs coordinator logic |
| EVOL-05 | Convergence: ontology stability (Jaccard + embedding cosine >= 0.95 across 2 generations) | Jaccard is local computation; embeddings via AI SDK embed(); getSeedLineage for history |
| EVOL-06 | Convergence: stagnation (score unchanged for 3 consecutive generations) | evolution_context JSONB stores score history; getSeedLineage traversal |
| EVOL-07 | Convergence: oscillation (period-2 through period-4 cycling detected) | Same lineage traversal; cosine similarity between generation N and N-2/3/4 |
| EVOL-08 | Convergence: repetitive feedback (gap IDs repeat >= 70%) | Hash-based gap ID comparison; embedding fallback for semantic similarity |
| EVOL-09 | Hard cap: maximum 30 evolution generations | generation counter on seed; simple integer check before each cycle |
| EVOL-10 | Lateral thinking personas activate on stagnation (5 personas in parallel) | Inngest step.run() parallel pattern; gateway.generateObject per persona |
| EVOL-11 | Human escalation mechanism triggers when convergence looks unlikely | appendEvent('evolution_escalated'); webhook via project settings |
| EVOL-12 | Token budget circuit breaker halts when cumulative lineage cost exceeds threshold | checkBudget() needs lineage-scoped aggregate query using getSeedLineage IDs |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `inngest` | 4.1.0 (project standard) | Durable evolution FSM orchestration | step.run for each FSM step, retries, timeout; established pattern from holdout/events.ts and decomposition/events.ts |
| `ai` (Vercel AI SDK) | 6.0.138 (project standard) | LLM judge calls, embedding generation | `generateObject` for rubric scoring, `embed` for text-embedding-3-large; same gateway.generateObject wrapper |
| `@ai-sdk/openai` | 3.0.48 (project standard) | OpenAI embeddings (text-embedding-3-large) | The embed() function uses the provider directly for embeddings |
| `zod` | 4.3.6 (project standard) | Runtime schema validation for LLM output | LLM-compatible schemas: no min/max/int/uuid per Phase 6.2 finding |
| `drizzle-orm` | 0.45.1 (project standard) | DB access for lineage queries, seed mutations | sql`` for recursive CTEs (getSeedLineage pattern); eq/and for filtering |
| `node:crypto` | built-in | SHA-256 hashing for gap ID fingerprints | hash(dimension + description) for repetitive feedback detection (D-13) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@ai-sdk/openai` embed API | via `ai` pkg | Compute 3072-dim embeddings | Ontology stability (D-10), oscillation (D-12), repetitive feedback fallback (D-13) |
| `pino` | 10.3.1 | Structured logging in FSM steps | Same pattern as gateway.ts logger param |

### No New Dependencies Needed
Phase 7 reuses all existing packages. The AI SDK's `embed()` function (for text-embedding-3-large) is already available via `ai` + `@ai-sdk/openai`.

**Installation:**
No new packages. All required libraries are already in the project.

## Architecture Patterns

### Recommended Project Structure
```
packages/engine/src/
├── evolution/
│   ├── types.ts              # EvolutionState, RubricDimension, ConvergenceSignal, GapAnalysis
│   ├── evaluator.ts          # GoalEvaluator — LLM judge with weighted rubric
│   ├── mutator.ts            # SeedMutator — tiered crystallizeSeed calls
│   ├── convergence.ts        # ConvergenceDetector — all 5 signals
│   ├── embeddings.ts         # computeEmbedding(), cosineSimilarity(), jaccard()
│   ├── lateral-thinking.ts   # LateralThinkingEngine — 5 personas + meta-judge
│   ├── budget.ts             # checkLineageBudget() — wraps checkBudget with lineage scope
│   ├── events.ts             # Inngest function: handleEvolutionStarted, evolutionCycleHandler
│   ├── index.ts              # barrel exports
│   └── __tests__/
│       ├── evaluator.test.ts
│       ├── convergence.test.ts
│       ├── embeddings.test.ts
│       └── lateral-thinking.test.ts
packages/shared/src/db/
├── schema/seed.ts            # ADD: generation integer, evolution_context jsonb
└── migrations/0009_evolutionary_loop.sql
```

### Pattern 1: Evolution FSM as Inngest Durable Function

**What:** A single `inngest.createFunction` listening on `evolution_started`, with named `step.run()` calls matching FSM states. Each step is retryable and idempotent.

**When to use:** FSM states that involve DB writes, LLM calls, or external I/O. Pure computation (Jaccard, cosine) runs inline.

```typescript
// packages/engine/src/evolution/events.ts
export async function evolutionCycleHandler({ event, step }) {
  const { seedId, projectId, failureReport } = event.data;

  // FSM: evaluating
  const goalScore = await step.run('evaluate-goal-attainment', async () => {
    return goalEvaluator.evaluate({ seedId, projectId, failureReport });
  });

  if (goalScore.score >= SUCCESS_THRESHOLD) {
    // FSM: converged
    await step.run('emit-converged', async () => {
      await unsealOnTerminal(db, { seedId, projectId, signal: 'goal_met' });
      await appendEvent(db, { projectId, seedId, type: 'evolution_converged', payload: { ... } });
    });
    return { status: 'converged' };
  }

  // FSM: scoring — check all 5 convergence signals
  const convergence = await step.run('check-convergence', async () => {
    return convergenceDetector.check({ seedId, projectId, currentScore: goalScore });
  });

  if (convergence.halt) {
    // FSM: halted
    await step.run('emit-halted', ...);
    return { status: 'halted', signal: convergence.signal };
  }

  // FSM: evolving — check for stagnation → lateral thinking
  const isStagnant = await step.run('check-stagnation', async () => {
    return convergenceDetector.checkStagnation({ seedId });
  });

  let newSeedSummary;
  if (isStagnant) {
    // FSM: lateral_thinking
    newSeedSummary = await step.run('lateral-thinking', async () => {
      return lateralThinkingEngine.run({ seed, gapAnalysis: goalScore.gapAnalysis, projectId });
    });
    if (!newSeedSummary) {
      // lateral thinking failed — escalate
      await step.run('escalate', async () => {
        await appendEvent(db, { type: 'evolution_escalated', ... });
        await fireWebhookIfConfigured(projectId, ...);
        await unsealOnTerminal(db, { seedId, projectId, signal: 'escalated' });
      });
      return { status: 'halted', signal: 'escalated' };
    }
  } else {
    // Normal evolution
    newSeedSummary = await step.run('generate-evolved-seed', async () => {
      return seedMutator.mutate({ seed, goalScore, tier: goalScore.score < 0.4 ? 'full' : 'ac_only' });
    });
  }

  // FSM: decomposing → executing (dispatch via existing bead machinery)
  await step.run('dispatch-decomposition', async () => {
    await step.sendEvent('trigger-decomposition', {
      name: 'decomposition.requested',
      data: { seedId: newSeed.id, projectId }
    });
  });

  return { status: 'cycle_complete', nextSeedId: newSeed.id };
}
```

### Pattern 2: Lineage-Scoped Budget Check

**What:** `checkLineageBudget` uses `getSeedLineage` to collect all ancestor seed IDs, then aggregates `llm_usage` cost across the full lineage — not just the current generation.

```typescript
// packages/engine/src/evolution/budget.ts
export async function checkLineageBudget(
  db: DbClient,
  seedId: string,
  limitCents: number,
): Promise<void> {
  const lineage = await getSeedLineage(db, seedId);
  const lineageIds = lineage.map(s => s.id);

  const [result] = await db
    .select({ total: sql<number>`COALESCE(SUM(${llmUsage.costCents}), 0)` })
    .from(llmUsage)
    .where(inArray(llmUsage.seedId, lineageIds));  // NOTE: llm_usage needs seedId column

  const current = result?.total ?? 0;
  if (current >= limitCents) {
    throw new BudgetExceededError(seedId, limitCents, current);
  }
}
```

**IMPORTANT:** The existing `llm_usage` table does NOT have a `seed_id` column. The migration must add it. Evolution-cycle usage is currently tracked via `evolution_cycle` integer, but lineage-level aggregation needs the seed ID directly to correlate across cycles.

### Pattern 3: Embedding-Based Similarity

**What:** Use Vercel AI SDK `embed()` for text-embedding-3-large to compute similarity between seed AC sets. Cosine similarity is computed locally.

```typescript
// packages/engine/src/evolution/embeddings.ts
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function computeEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-large'),
    value: text,
  });
  return embedding;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i]!, 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dot / (magA * magB);
}

export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}
```

### Pattern 4: Goal Attainment Evaluator (LLM Judge)

**What:** `GoalEvaluator.evaluate()` uses `gateway.generateObject` at `stage: 'evaluation'` to score each rubric dimension. Cross-model diversity enforcement already happens at the gateway level for `evaluation` stage (D-03 via enforceDiversity pattern).

```typescript
// packages/engine/src/evolution/evaluator.ts
const RubricScoreSchema = z.object({
  dimensions: z.array(z.object({
    name: z.string(),
    score: z.number(),
    reasoning: z.string(),
    gapStatement: z.string(),
  })),
  overallScore: z.number(),
});

export async function evaluateGoalAttainment(params: {
  gateway: LLMGateway;
  seed: Seed;
  codeSummary: string;
  projectId: string;
  evolutionCycle: number;
}): Promise<GoalAttainmentResult> {
  // Build rubric from seed.evaluationPrinciples
  const rubric = buildRubric(seed.evaluationPrinciples as EvaluationPrinciple[]);
  // Call LLM judge via gateway
  const result = await params.gateway.generateObject({
    projectId: params.projectId,
    stage: 'evaluation',
    schema: RubricScoreSchema,
    schemaName: 'GoalAttainmentScore',
    prompt: buildEvalPrompt(seed, codeSummary, rubric),
    evolutionCycle: params.evolutionCycle,
  });
  // Weighted sum for final score
  return computeWeightedScore(result.object, rubric);
}
```

### Pattern 5: Lateral Thinking — Parallel Personas

**What:** All 5 personas run as parallel `step.run` calls within the same Inngest step. Each calls `gateway.generateObject` producing a full seed proposal. A meta-judge (cross-model from personas, e.g., Anthropic if personas used OpenAI) selects the winner.

```typescript
// packages/engine/src/evolution/lateral-thinking.ts
const PERSONAS = ['contrarian', 'hacker', 'simplifier', 'researcher', 'architect'] as const;

export async function runLateralThinking(params: {
  step: InngestStep;
  gateway: LLMGateway;
  seed: Seed;
  gapAnalysis: GapAnalysis[];
  projectId: string;
}): Promise<SeedSummary | null> {
  // Run all 5 personas in parallel
  const proposals = await Promise.all(
    PERSONAS.map(persona =>
      params.step.run(`lateral-thinking-${persona}`, async () => {
        return generatePersonaProposal({
          gateway: params.gateway,
          persona,
          seed: params.seed,
          gapAnalysis: params.gapAnalysis,
          projectId: params.projectId,
        });
      })
    )
  );

  // Meta-judge selects best proposal
  return params.step.run('lateral-thinking-meta-judge', async () => {
    return metaJudgeSelect({
      gateway: params.gateway,
      proposals,
      originalSeed: params.seed,
      projectId: params.projectId,
    });
  });
}
```

### Anti-Patterns to Avoid

- **Storing embedding vectors in PostgreSQL:** 3072-float embeddings serialized as JSONB are large. Store only the text hashes and recompute embeddings on demand during convergence checks. The convergence check runs once per generation — the recompute cost is acceptable.
- **Checking all 5 convergence signals every time:** Check in priority order: (1) hard cap first (O(1)), (2) stagnation (O(history)), (3) ontology stability (O(embedding)), (4) oscillation (O(embedding)), (5) repetitive feedback (O(hash)). Short-circuit on first match.
- **Assuming llm_usage has seed_id:** It does NOT currently. The migration must add `seed_id uuid references seeds(id)` to `llm_usage`. Without this, lineage-level budget aggregation requires joining through `evolution_cycle` which is unreliable (cycles reset across seeds).
- **Using z.number().min(0).max(1) in LLM schemas:** Phase 6.2 established that LLM providers reject `minimum`/`maximum` constraints. Use plain `z.number()` and validate at application level.
- **Embedding computation inside `step.run`:** Embedding API calls are external I/O — they must be inside `step.run` for idempotency. Don't compute embeddings outside a step.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Durable FSM orchestration | Custom state machine with Redis locks | Inngest `step.run` per state | Inngest handles retries, timeouts, and durable execution natively |
| Text embedding similarity | Vector DB (pgvector, Pinecone) | `embed()` + local cosine | 3072-dim comparison for 2-4 seeds per generation is trivially local; no vector DB needed for this scale |
| Multi-provider LLM calls | Direct OpenAI/Anthropic SDK | `gateway.generateObject` | Cross-model diversity, failover, token tracking already wired |
| SHA-256 hashing | Third-party hash library | `node:crypto` `createHash('sha256')` | Built-in, no dependency surface |
| Recursive lineage query | Application-level tree traversal | `getSeedLineage()` recursive CTE | Already implemented and tested |

**Key insight:** Phase 7 is almost entirely orchestration glue between components that already exist. The new code is thin coordination logic, not infrastructure.

## Common Pitfalls

### Pitfall 1: llm_usage Missing seed_id Column
**What goes wrong:** `checkLineageBudget` cannot aggregate cost by lineage without a `seed_id` on `llm_usage`. Attempting to join through `evolution_cycle` fails because cycle numbers can collide across different projects.
**Why it happens:** The `llm_usage` table was designed in Phase 2 before lineage-level budget tracking was specified. The `evolution_cycle` integer alone is insufficient.
**How to avoid:** Migration 0009 must add `seed_id uuid references seeds(id)` to `llm_usage`. Gateway's `writeUsage()` method must be updated to populate it from `GatewayCallOptions.seedId` (a new optional field to add).
**Warning signs:** Budget check passes even when lineage cost is high because it's querying by project (not lineage).

### Pitfall 2: Seeds Table Missing generation and evolution_context
**What goes wrong:** Cannot implement generation counter (EVOL-09 hard cap) or convergence signal recording without these columns.
**Why it happens:** The `seeds` table was crystallized in Phase 3 without Phase 7 fields.
**How to avoid:** Migration 0009 adds `generation integer NOT NULL DEFAULT 0` and `evolution_context jsonb` to `seeds`. The Drizzle schema must be updated to match.
**Warning signs:** TypeScript errors when trying to access `seed.generation` or `seed.evolutionContext`.

### Pitfall 3: Triggering Holdout Unseal Multiple Times
**What goes wrong:** `handleEvolutionConverged` (Phase 4) already unseals the vault on `evolution_converged`. If the evolution FSM also unseals on terminal states, you get a double-unseal attempt which fails the `assertValidTransition('unsealed' → 'unsealed')` check.
**Why it happens:** D-19 says "unseal on ANY terminal state" — but the holdout unseal machinery is already triggered by `evolution_converged`. The evolution FSM must delegate unsealing to the existing `handleEvolutionConverged` by emitting the right events, not by calling `unsealVault` directly.
**How to avoid:** Only emit `evolution_converged` or a new `evolution_halted` event on terminal states. The `handleEvolutionConverged` function already handles unsealing for `evolution_converged`. Add a parallel `handleEvolutionHalted` for the other terminal states (hard cap, budget, escalation).
**Warning signs:** `Invalid vault status transition: unsealed -> unsealed` errors in tests.

### Pitfall 4: Evolution Loop Re-Entering the Wrong Inngest Function
**What goes wrong:** After a new evolved seed is decomposed and executed, the `evolution_started` event fires again (from holdout failure or goal attainment failure), creating a new execution of `handleEvolutionStarted`. This is correct behavior — but the FSM must carry enough context in the event payload (`seedId`, `evolutionCycle`, `lineageSeedId`) so each cycle knows its position in the lineage.
**Why it happens:** Inngest functions are stateless between invocations. State must travel through event payloads or be reconstituted from DB.
**How to avoid:** The `evolution_started` event payload must include `lineageRootId` (original first seed in the lineage) so `checkLineageBudget` can always query the full lineage cost.
**Warning signs:** Budget check appears to reset each cycle because it's scoping to the current seed instead of the lineage root.

### Pitfall 5: Parallel Persona Steps Exceeding Inngest Function Step Limit
**What goes wrong:** Inngest has a default step count limit per function run. Running 5 persona steps + meta-judge + all the main FSM steps in one function can approach this limit in long evolution cycles.
**Why it happens:** Each `step.run` call counts toward Inngest's step limit (~1000 steps per function run in Inngest Cloud, lower in dev).
**How to avoid:** Lateral thinking personas are sub-steps of a single larger step. Use `Promise.all` with individual `step.run` calls but keep total step count reasonable. The main FSM has ~12 steps; lateral thinking adds 6 (5 personas + 1 meta-judge). Total ~18 per cycle, well within limits.
**Warning signs:** Inngest functions silently halt mid-cycle with no error.

### Pitfall 6: Embedding API Calls Outside step.run
**What goes wrong:** If embedding computation is done outside `step.run`, the call is not retried on transient failures and is re-executed on function replay, potentially causing duplicate API charges.
**Why it happens:** Embeddings look like pure computation but they're external API calls.
**How to avoid:** Always wrap `computeEmbedding()` calls in `step.run('compute-embedding-*', ...)`.
**Warning signs:** Duplicate charges in OpenAI usage logs; race conditions on function replay.

### Pitfall 7: event_type Enum Not Updated
**What goes wrong:** `appendEvent` calls with new types (`evolution_lateral_thinking`, `evolution_escalated`, `evolution_halted`) throw a Postgres enum constraint error.
**Why it happens:** `event_type` is a PostgreSQL ENUM — adding values requires an `ALTER TYPE ... ADD VALUE` migration, not just a schema file update.
**How to avoid:** Migration 0009 must include `ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'evolution_lateral_thinking';` etc. for each new event type. Drizzle Kit generates `ALTER TYPE` for enum additions.
**Warning signs:** Runtime Postgres error `invalid input value for enum event_type`.

## Code Examples

### Inngest Function Registration Pattern (from holdout/events.ts)
```typescript
// Source: packages/engine/src/holdout/events.ts
export const handleEvolutionConverged: InngestFunction<any, any, any, any> = inngest.createFunction(
  { id: 'holdout-vault/unseal-on-convergence', triggers: [{ event: 'evolution_converged' }] },
  (ctx) => convergenceHandler(ctx as any)
);
```
Apply same pattern for `handleEvolutionStarted` listening on `evolution_started`.

### crystallizeSeed with parentSeedId (from interview/crystallizer.ts)
```typescript
// Source: packages/engine/src/interview/crystallizer.ts
const [seed] = await db.insert(seeds).values({
  projectId,
  interviewId,
  parentId: parentSeedId ?? null,  // lineage tracking
  version,
  status: 'crystallized',
  goal: summary.goal,
  // ... other fields
}).returning();
```
The evolution mutator calls this same function with the new seed's parent ID.

### getSeedLineage recursive CTE (from interview/crystallizer.ts)
```typescript
// Source: packages/engine/src/interview/crystallizer.ts
const result = await db.execute(sql`
  WITH RECURSIVE lineage AS (
    SELECT * FROM seeds WHERE id = ${seedId}::uuid
    UNION ALL
    SELECT s.* FROM seeds s INNER JOIN lineage l ON s.id = l.parent_id
  )
  SELECT * FROM lineage ORDER BY version ASC
`);
```
`lineage.length` gives the current generation count. `lineage[lineage.length - 2]` is the previous generation for stagnation comparison.

### Zod Schema for LLM Output (LLM-safe — no min/max)
```typescript
// Based on Phase 6.2 finding: no minimum/maximum/minItems constraints
const GoalScoreSchema = z.object({
  dimensions: z.array(z.object({
    name: z.string(),
    score: z.number(),        // NOT z.number().min(0).max(1)
    reasoning: z.string(),
    gapStatement: z.string(),
    weight: z.number(),       // NOT z.number().positive()
  })),
  overallScore: z.number(),   // NOT z.number().min(0).max(1)
});
```

### Module-Level Deps Pattern (from decomposition/events.ts)
```typescript
// Source: packages/engine/src/decomposition/events.ts
interface EvolutionDeps {
  db: DbClient;
  gateway: LLMGateway;
}

let evolutionDeps: EvolutionDeps | null = null;

export function configureEvolutionDeps(deps: EvolutionDeps): void {
  evolutionDeps = deps;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `pipeline` key in turbo.json | `tasks` key | Phase 1 | Turborepo 2.x API; use `tasks` |
| `maxTokens` in AI SDK | `maxOutputTokens` | Phase 2 (AI SDK v6) | Rename all token limit params |
| `z.string().uuid()` in LLM schemas | plain `z.string()` | Phase 6.2 | Providers reject `format:"uuid"` |
| `z.number().min(0).max(1)` in schemas | plain `z.number()` | Phase 6.2 | Providers reject `minimum`/`maximum` |
| `z.string().optional()` for conditionalOn | `z.string().nullable()` | Phase 6.2 | OpenAI structured output requires all properties in `required` array |
| Postgres `@cauldron/shared` throws at import | `vi.mock('@cauldron/shared')` in tests | Phase 3 | Unit test pattern for engine package |

## Open Questions

1. **codeSummary source for GoalEvaluator**
   - What we know: `convergenceHandler` in holdout/events.ts receives `codeSummary` in the `evolution_converged` event payload
   - What's unclear: When `evolution_started` fires from goal attainment failure (not holdout failure), where does the code summary come from? It needs to represent the built project's current state.
   - Recommendation: The `evolution_started` event payload should always include a `codeSummary` field. When the evolution FSM triggers the holdout check (via `evolution_converged`), the holdout evaluator generates the code summary. The goal evaluator can use the same summary. The evaluation step in the FSM must receive or generate the code summary before calling `evaluateGoalAttainment`.

2. **`llm_usage.seed_id` backfill for existing records**
   - What we know: Adding `seed_id` column to `llm_usage` as nullable is safe. Historical records will have `seed_id = NULL`.
   - What's unclear: Whether `checkLineageBudget` should treat NULL seed_id records as uncountable (conservative) or countable (query by projectId fallback).
   - Recommendation: Make `seed_id` nullable; `checkLineageBudget` queries only records with matching lineage seed IDs. Old NULL records are not counted. This is safe and conservative.

3. **Decomposition trigger for evolved seed**
   - What we know: The existing bead dispatch machinery uses `bead.dispatch_requested` events. Decomposition is triggered by a separate Inngest event.
   - What's unclear: What event name triggers decomposition for an evolved seed? The current decomposition events.ts doesn't show an explicit "start decomposition" event — beads are dispatched individually.
   - Recommendation: The evolution FSM should emit `decomposition.requested` (same event as Phase 5 dispatcher, or a new `evolution.decompose_requested`). Verify against decomposition/events.ts and scheduler.ts before implementing.

## DB Migration Requirements (Migration 0009)

The planner must allocate a task for this migration. Changes required:

**`seeds` table additions:**
```sql
ALTER TABLE seeds ADD COLUMN generation integer NOT NULL DEFAULT 0;
ALTER TABLE seeds ADD COLUMN evolution_context jsonb;
```

**`llm_usage` table addition:**
```sql
ALTER TABLE llm_usage ADD COLUMN seed_id uuid REFERENCES seeds(id);
```

**`event_type` enum additions:**
```sql
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'evolution_lateral_thinking';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'evolution_escalated';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'evolution_halted';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'evolution_goal_met';
```

**Drizzle schema updates:** `packages/shared/src/db/schema/seed.ts` and `llm-usage.ts` must match.

## Environment Availability

Step 2.6: SKIPPED (no new external dependencies — all required tools already verified in prior phases)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `packages/engine/vitest.config.ts` (unit), `vitest.integration.config.ts` (integration) |
| Quick run command | `pnpm --filter @cauldron/engine test` |
| Full suite command | `pnpm --filter @cauldron/engine test:integration` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EVOL-01 | GoalEvaluator returns score 0-1 from gateway mock | unit | `pnpm --filter @cauldron/engine test -- evaluator` | ❌ Wave 0 |
| EVOL-02 | Weighted rubric uses evaluationPrinciples from seed | unit | `pnpm --filter @cauldron/engine test -- evaluator` | ❌ Wave 0 |
| EVOL-03 | SeedMutator creates new seed with parentId set | unit | `pnpm --filter @cauldron/engine test -- mutator` | ❌ Wave 0 |
| EVOL-04 | Tiered bead reuse: < 0.4 clears beads, >= 0.4 keeps completed | unit | `pnpm --filter @cauldron/engine test -- mutator` | ❌ Wave 0 |
| EVOL-05 | Jaccard >= 0.95 AND cosine >= 0.95 triggers ontology stability signal | unit | `pnpm --filter @cauldron/engine test -- convergence` | ❌ Wave 0 |
| EVOL-06 | 3 identical scores triggers stagnation signal | unit | `pnpm --filter @cauldron/engine test -- convergence` | ❌ Wave 0 |
| EVOL-07 | Period-2 oscillation (score similarity to grandparent >= 0.95) triggers signal | unit | `pnpm --filter @cauldron/engine test -- convergence` | ❌ Wave 0 |
| EVOL-08 | 70%+ repeated gap IDs triggers repetitive feedback signal | unit | `pnpm --filter @cauldron/engine test -- convergence` | ❌ Wave 0 |
| EVOL-09 | Generation 30 triggers hard cap halt | unit | `pnpm --filter @cauldron/engine test -- convergence` | ❌ Wave 0 |
| EVOL-10 | 5 persona proposals generated in parallel | unit | `pnpm --filter @cauldron/engine test -- lateral-thinking` | ❌ Wave 0 |
| EVOL-11 | evolution_escalated event emitted after lateral thinking failure | unit | `pnpm --filter @cauldron/engine test -- events.evolution` | ❌ Wave 0 |
| EVOL-12 | checkLineageBudget throws BudgetExceededError when lineage total >= limit | unit | `pnpm --filter @cauldron/engine test -- budget` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @cauldron/engine test`
- **Per wave merge:** `pnpm --filter @cauldron/engine test && pnpm -r typecheck && pnpm -r build`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/engine/src/evolution/__tests__/evaluator.test.ts` — covers EVOL-01, EVOL-02
- [ ] `packages/engine/src/evolution/__tests__/mutator.test.ts` — covers EVOL-03, EVOL-04
- [ ] `packages/engine/src/evolution/__tests__/convergence.test.ts` — covers EVOL-05 through EVOL-09
- [ ] `packages/engine/src/evolution/__tests__/lateral-thinking.test.ts` — covers EVOL-10, EVOL-11
- [ ] `packages/engine/src/evolution/__tests__/budget.test.ts` — covers EVOL-12
- [ ] `packages/engine/src/evolution/__tests__/embeddings.test.ts` — covers cosine/jaccard helpers used by EVOL-05, EVOL-07

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `packages/engine/src/holdout/events.ts` — Inngest function structure, step.run pattern, configureVaultDeps pattern
- Direct code inspection: `packages/engine/src/interview/crystallizer.ts` — crystallizeSeed signature, getSeedLineage recursive CTE
- Direct code inspection: `packages/engine/src/gateway/budget.ts` — checkBudget pattern; confirmed no seed_id join
- Direct code inspection: `packages/engine/src/gateway/gateway.ts` — generateObject, writeUsage, evolutionCycle param
- Direct code inspection: `packages/shared/src/db/schema/seed.ts` — confirmed no generation/evolution_context columns
- Direct code inspection: `packages/shared/src/db/schema/event.ts` — confirmed event_type enum contents
- Direct code inspection: `packages/shared/src/db/schema/llm-usage.ts` — confirmed no seed_id column
- Direct code inspection: `packages/engine/src/holdout/types.ts` — HoldoutFailureReport shape (consumed by evo loop)
- Direct code inspection: `packages/engine/src/decomposition/events.ts` — beadDispatchHandler, beadCompletionHandler, module-level deps pattern

### Secondary (MEDIUM confidence)
- CLAUDE.md recommended stack: Vercel AI SDK v6 `embed()` function for text-embedding-3-large — confirmed AI SDK supports embed natively
- Phase 6.2 STATE.md accumulated context: Zod schema LLM constraints (no min/max/int), real model IDs, conditionalOn nullable pattern

### Tertiary (LOW confidence)
- Inngest step count limits (~1000 per function run in Cloud): Based on Inngest documentation patterns, not directly verified against v4 SDK
- text-embedding-3-large 0.95 cosine threshold calibration (D-11): User-specified threshold, not empirically verified by research

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use; no new dependencies
- Architecture: HIGH — patterns directly read from existing code files
- DB migration: HIGH — schema files read directly; gaps clearly identified
- Pitfalls: HIGH — most identified by reading actual code paths and cross-referencing with design decisions
- Embedding computation: MEDIUM — AI SDK embed() verified as a feature; threshold calibration is user-decided

**Research date:** 2026-03-26
**Valid until:** 2026-04-25 (stable stack; 30-day estimate)
