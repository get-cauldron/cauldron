# Phase 3: Interview & Seed Pipeline - Research

**Researched:** 2026-03-26
**Domain:** Socratic interview FSM, multi-perspective LLM panel, deterministic ambiguity scoring, immutable seed crystallization
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Interview FSM Design**
- D-01: Dedicated `interviews` table — new table with id, projectId, status (active/paused/completed/abandoned), mode (greenfield/brownfield), transcript (JSONB turn-based array), ambiguity scores history, created/completedAt. Seeds reference via interviewId FK (already on seeds table).
- D-02: Linear state machine: `gathering → reviewing → approved → crystallized` plus `paused` and `abandoned` states. No backtracking — user answers sequentially until clarity threshold met, then reviews summary.
- D-03: Full session resume supported — interview state persisted to DB, user can close and resume later. Transcript and scores preserved across sessions.
- D-04: Both greenfield and brownfield modes from day one (INTV-05). Mode auto-detected at interview start: if project has existing code (detected via codebase index or git history), use brownfield. User can override. Mode stored on interview record.
- D-05: Purely score-driven termination — no question count cap. Interview runs until ambiguity score <= 0.2.
- D-06: Early crystallization allowed — user can force-crystallize before threshold with a clear warning showing current score, gap, and weakest dimensions. Seed is marked with actual score so downstream phases know it's underspecified.
- D-07: Turn-based transcript structure: `{turnNumber, perspective, question, mcOptions[], userAnswer, freeformText?, ambiguityScoreSnapshot, model, allCandidates[], timestamp}`. Score snapshot per turn enables charting progress. All 5 candidate questions stored in `allCandidates` metadata.
- D-08: Per-turn model tracking — each transcript turn records the model ID used for auditability and debugging.

**Multi-Perspective Panel**
- D-09: 5 parallel LLM calls per turn (one per perspective: researcher, simplifier, architect, breadth-keeper, seed-closer). Each perspective has its own system prompt. Maximum cognitive diversity.
- D-10: Cross-model perspective diversity — different perspectives can use different LLM models. Configurable per-perspective in `cauldron.config.ts` via a `perspectiveModels` map (e.g., `{researcher: 'claude-sonnet-4-6', architect: 'gpt-4o'}`). Per-project overrides possible. Falls back to interview-stage default if not configured.
- D-11: LLM ranker merges candidates — a separate LLM call (using interview-stage default model) receives all perspective candidates + transcript context, picks the single most valuable question, and generates 3-4 MC answer suggestions. One call does selection + MC generation.
- D-12: Dynamic perspective activation — not all 5 fire every turn. Early turns: researcher + simplifier + breadth-keeper. Mid turns: architect + breadth-keeper. Late turns: seed-closer + architect. Activation based on previous turn's ambiguity scores. Saves cost.
- D-13: Ranker shows perspective rationale to user — brief context like "From the Architect perspective: We need to understand your data model before we can assess scalability." Helps user understand why they're being asked this.
- D-14: Unused perspective questions (4 not selected) stored in transcript metadata for debugging and potential future reuse.

**Ambiguity Scoring**
- D-15: Hybrid scoring — LLM at temperature=0 with `generateObject` produces per-dimension clarity scores using a Zod schema, then rule-based validations complement. Near-deterministic: same transcript → same scores.
- D-16: Greenfield: 3-dimension matrix (goal clarity 40%, constraint clarity 30%, success criteria clarity 30%). Brownfield: 4-dimension matrix (goal 35%, constraint 25%, success criteria 25%, context clarity 15%).
- D-17: Full dimension breakdown visible to user: "Goal: 85%, Constraints: 60%, Success criteria: 40% — Overall: 0.38". Shows exactly where clarity gaps are.
- D-18: Fast/cheap model for scoring (e.g., Haiku, GPT-4o-mini class) since it's structured output with a fixed schema. Configurable in cauldron.config.ts. Speed matters — user is waiting between turns.
- D-19: Full transcript as scorer input — scorer sees entire Q&A history for accurate cumulative clarity assessment.
- D-20: Rule validations: scores in [0,1], no single answer drops a dimension by >0.3 (anomaly detection), overall score monotonicity hint (shouldn't decrease after substantive answer). Anomaly triggers one scoring retry.
- D-21: Scoring and next-turn perspective calls run in parallel after each user answer. Perspective activation for current turn uses previous turn's scores (already available). Fresh score becomes available for next turn's activation.

**Seed Crystallization**
- D-22: LLM synthesis from full transcript — a dedicated LLM call (interview-stage default model) takes the complete transcript and produces a structured summary matching the seed DB columns: goal, constraints, acceptance criteria, ontology schema, evaluation principles, exit conditions.
- D-23: Edit-then-approve flow — user sees the full summary with each section editable. They can modify any field. Once satisfied, explicit "Approve & Crystallize" action. Edits tracked as summary revisions.
- D-24: Ontology schema contains a domain entity map: key entities, their relationships, and core attributes inferred from the interview. Structured JSON: `{entities: [{name, attributes[], relations: [{to, type}]}]}`. Gives decomposition (Phase 5) a head start.
- D-25: DB-only — the seeds table IS the seed (Phase 1 D-01 structured columns). YAML is a serialization format for export/display, generated on-demand from DB record. No file on disk.
- D-26: Immutability enforced via both application-level guard (ImmutableSeedError when status='crystallized') AND PostgreSQL BEFORE UPDATE trigger. Belt and suspenders.
- D-27: Seed lineage via recursive CTE (confirmed from Phase 1 D-03). Single SQL query walks parent_id chain. Returns full chain: seed → parent → ... → original + interview_id.

### Claude's Discretion
- Exact perspective system prompt content and structure
- Interview table indexing strategy
- FSM transition validation implementation details
- Zod schemas for scoring and synthesis structured output
- Event store event payloads for interview events
- Error types and error handling patterns
- DB trigger implementation details
- Perspective activation thresholds (which score ranges trigger which perspectives)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INTV-01 | Interview begins with open-ended question generation using multi-perspective panel (researcher, simplifier, architect, breadth-keeper, seed-closer) | D-09/D-10/D-11/D-12 define parallel panel architecture; gateway `generateObject` handles each perspective call |
| INTV-02 | Multiple-choice answer suggestions generated per question with always-available freeform option | D-11 ranker generates 3-4 MC options; transcript turn structure includes `mcOptions[]` and `freeformText?` |
| INTV-03 | Deterministic ambiguity scoring matrix computed after each response | D-15 hybrid scoring: `generateObject` at temperature=0 + Zod schema → near-deterministic; D-20 rule validations |
| INTV-04 | Interview continues until ambiguity score <= 0.2 (weighted clarity >= 80%) | D-05 score-driven termination; D-16 weighting matrix; D-02 FSM `gathering` state loops until threshold |
| INTV-05 | Brownfield variant adds context clarity dimension (15%) and adjusts other weights | D-04 mode auto-detection; D-16 brownfield 4-dimension matrix (35/25/25/15) |
| INTV-06 | Structured summary presented to user for review before seed crystallization | D-22 LLM synthesis produces structured summary; D-23 edit-then-approve flow; FSM `reviewing` state |
| INTV-07 | User explicitly approves summary before seed generation proceeds | D-23 "Approve & Crystallize" action; FSM transitions `approved → crystallized` |
| SEED-01 | Immutable seed spec generated (goal, constraints, acceptance criteria, ontology schema, evaluation principles, exit conditions) | D-25 seeds table already has all structured columns from Phase 1; D-22 synthesis call populates them |
| SEED-02 | Seeds are frozen after crystallization — no mutation, only evolution creates new seeds | D-26 ImmutableSeedError app-level guard + PostgreSQL BEFORE UPDATE trigger |
| SEED-03 | Each seed has unique ID, version, creation timestamp, parent seed reference (if evolved), interview ID | Already in seeds schema: uuid PK, version int, createdAt, parentId (self-ref FK), interviewId FK |
| SEED-04 | Seed lineage trackable: given any seed, trace back to original interview through all evolutionary ancestors | D-27 recursive CTE on parent_id chain; already tested in Phase 1 integration tests |
</phase_requirements>

---

## Summary

Phase 3 builds the core intelligence acquisition pipeline: a multi-perspective Socratic interview FSM that gathers requirements, scores clarity deterministically, and crystallizes an immutable seed spec. The decisions are fully locked and detailed — this is an implementation phase, not a design phase.

The architecture is straightforward given the existing codebase: a new `interviews` table in `packages/shared`, a new `packages/engine/src/interview/` module containing the FSM logic, and integration with the existing LLM gateway. The gateway already supports `generateObject` (for scoring and perspective calls), `generateText` (for synthesis), and stage-based routing with the `'interview'` stage. All LLM calls go through the existing `LLMGateway` class.

The two highest-complexity pieces are: (1) the parallel perspective panel with dynamic activation — 2-5 `Promise.all` calls to `gateway.generateObject` per turn, followed by a ranker call; and (2) the PostgreSQL BEFORE UPDATE trigger for immutability enforcement. Everything else follows patterns already established in Phases 1 and 2.

**Primary recommendation:** Build the interview FSM as a pure TypeScript service class in `packages/engine/src/interview/` with clear method boundaries for each FSM transition. Keep all DB interaction through Drizzle and all LLM calls through the existing `LLMGateway`. Add the `interviews` table migration first, then build FSM, scoring, and crystallization in that order.

---

## Standard Stack

### Core (all already installed — no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` (Vercel AI SDK) | 6.0.138 | `generateObject` for perspective calls and scoring; `generateText` for synthesis | Already in engine; `generateObject` at temperature=0 is the locked scoring mechanism |
| `zod` | 4.3.6 | Schemas for scoring output, perspective output, synthesis output, transcript turn shape | Already in engine; native AI SDK integration for structured output |
| `drizzle-orm` | 0.45.1 | `interviews` table CRUD, seed crystallization write, lineage query | Already in shared/engine; established pattern |
| `postgres` driver | 3.4.8 | Raw SQL for PostgreSQL BEFORE UPDATE trigger (DDL cannot be expressed in Drizzle schema) | Already in shared |
| `pino` | 10.3.1 | Structured logging per turn, per LLM call | Already in engine |
| `vitest` | 4.1.1 | Unit tests (FSM transitions, scoring validators, Zod schemas) | Already configured in engine/vitest.config.ts |

### No New Dependencies

All required libraries are already installed. Phase 3 is purely a new module within the existing monorepo.

**Verification:** `npm view ai version` → 6.0.138 (confirmed 2026-03-26). `npm view zod version` → 4.3.6 (confirmed 2026-03-26).

---

## Architecture Patterns

### Recommended Project Structure

```
packages/engine/src/interview/
├── index.ts                    # Public exports
├── types.ts                    # InterviewTurn, InterviewStatus, PerspectiveName, AmbiguityScores, SeedSummary
├── fsm.ts                      # InterviewFSM class — state transitions, session persistence
├── perspectives.ts             # 5 perspective system prompts + parallel call orchestration
├── ranker.ts                   # Ranker call: select best question + generate MC options
├── scorer.ts                   # Zod schema for scores + generateObject at temperature=0 + rule validators
├── synthesizer.ts              # LLM synthesis call: transcript → seed summary struct
├── crystallizer.ts             # Crystallize approved summary into seeds table + trigger BEFORE UPDATE check
└── __tests__/
    ├── fsm.test.ts             # FSM state machine transitions
    ├── scorer.test.ts          # Score calculation, anomaly detection, rule validation
    ├── perspectives.test.ts    # Perspective activation logic by turn score
    └── interview.integration.test.ts   # Full turn lifecycle against real DB
```

```
packages/shared/src/db/schema/
└── interview.ts                # New: interviews table definition

packages/shared/src/db/migrations/
└── 0003_*.sql                  # New: interviews table + BEFORE UPDATE trigger on seeds
```

### Pattern 1: Interview FSM as a Service Class

The `InterviewFSM` class owns state transitions and delegates to collaborators for LLM calls.

```typescript
// packages/engine/src/interview/fsm.ts
import type { DbClient } from '@cauldron/shared';
import type { LLMGateway } from '../gateway/index.js';
import { runPerspectivePanel } from './perspectives.js';
import { rankCandidates } from './ranker.js';
import { computeAmbiguityScore } from './scorer.js';

export type InterviewStatus = 'active' | 'paused' | 'completed' | 'abandoned';
export type InterviewPhase = 'gathering' | 'reviewing' | 'approved' | 'crystallized';

export class InterviewFSM {
  constructor(
    private readonly db: DbClient,
    private readonly gateway: LLMGateway,
    private readonly logger: Logger,
  ) {}

  // Start or resume an interview session
  async startOrResume(projectId: string, mode?: 'greenfield' | 'brownfield'): Promise<Interview>

  // User submits an answer — triggers scoring + next question generation in parallel
  async submitAnswer(interviewId: string, answer: string, freeformText?: string): Promise<TurnResult>

  // Request early crystallization (D-06)
  async requestEarlyCrystallization(interviewId: string): Promise<EarlyCrystallizationWarning>

  // Approve the summary and crystallize (D-23, D-07)
  async approveAndCrystallize(interviewId: string, editedSummary?: Partial<SeedSummary>): Promise<Seed>

  // Pause / abandon
  async pause(interviewId: string): Promise<void>
  async abandon(interviewId: string): Promise<void>
}
```

### Pattern 2: Parallel Panel Execution (D-09, D-12, D-21)

All perspective calls and the scoring call run in parallel after a user answer.

```typescript
// packages/engine/src/interview/perspectives.ts
export async function runActivePerspectives(
  gateway: LLMGateway,
  transcript: InterviewTurn[],
  previousScores: AmbiguityScores | null,
  projectId: string,
): Promise<PerspectiveCandidate[]> {
  const active = selectActivePerspectives(previousScores); // D-12 activation logic
  const calls = active.map((name) =>
    gateway.generateObject({
      projectId,
      stage: 'interview',
      system: PERSPECTIVE_PROMPTS[name],
      prompt: buildPerspectivePrompt(transcript),
      schema: perspectiveCandidateSchema,  // Zod schema
    })
  );
  const results = await Promise.all(calls);
  return results.map((r, i) => ({ perspective: active[i]!, ...r.object }));
}

// Called simultaneously with perspective calls
export async function computeScoreInParallel(
  gateway: LLMGateway,
  transcript: InterviewTurn[],
  mode: 'greenfield' | 'brownfield',
  projectId: string,
): Promise<AmbiguityScores> { ... }
```

### Pattern 3: Deterministic Scoring via generateObject at temperature=0 (D-15)

```typescript
// packages/engine/src/interview/scorer.ts
import { z } from 'zod';

// Greenfield scoring schema
export const greenFieldScoresSchema = z.object({
  goalClarity: z.number().min(0).max(1),
  constraintClarity: z.number().min(0).max(1),
  successCriteriaClarity: z.number().min(0).max(1),
  reasoning: z.string(),  // brief rationale per dimension
});

export const brownfieldScoresSchema = greenFieldScoresSchema.extend({
  contextClarity: z.number().min(0).max(1),
});

export function computeWeightedScore(
  scores: z.infer<typeof greenFieldScoresSchema>,
  mode: 'greenfield' | 'brownfield'
): number {
  if (mode === 'greenfield') {
    return scores.goalClarity * 0.4
      + scores.constraintClarity * 0.3
      + scores.successCriteriaClarity * 0.3;
  }
  const bf = scores as z.infer<typeof brownfieldScoresSchema>;
  return bf.goalClarity * 0.35
    + bf.constraintClarity * 0.25
    + bf.successCriteriaClarity * 0.25
    + bf.contextClarity * 0.15;
}

// gateway call site: temperature: 0 for determinism (D-15)
const result = await gateway.generateObject({
  projectId,
  stage: 'interview',
  schema: mode === 'greenfield' ? greenFieldScoresSchema : brownfieldScoresSchema,
  temperature: 0,  // deterministic
  prompt: buildScorerPrompt(transcript),
});
```

### Pattern 4: PostgreSQL BEFORE UPDATE Trigger for Immutability (D-26)

The trigger must be created in the migration SQL — Drizzle cannot express triggers in schema definitions.

```sql
-- In migration 0003_*.sql, after creating interviews table:
CREATE OR REPLACE FUNCTION prevent_seed_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'crystallized' THEN
    RAISE EXCEPTION 'ImmutableSeedError: seed % is crystallized and cannot be mutated', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER seeds_immutability_guard
  BEFORE UPDATE ON seeds
  FOR EACH ROW
  EXECUTE FUNCTION prevent_seed_mutation();
```

Application-level guard (belt):
```typescript
// packages/engine/src/interview/crystallizer.ts
export class ImmutableSeedError extends Error {
  constructor(seedId: string) {
    super(`Seed ${seedId} is crystallized and cannot be mutated`);
    this.name = 'ImmutableSeedError';
  }
}

export async function crystallizeSeed(db: DbClient, interviewId: string, summary: SeedSummary): Promise<Seed> {
  // Check existing seed for this interview
  const existing = await db.select().from(seeds).where(eq(seeds.interviewId, interviewId));
  if (existing[0]?.status === 'crystallized') {
    throw new ImmutableSeedError(existing[0].id);
  }
  // Insert new seed (always INSERT, never UPDATE for crystallization)
  const [seed] = await db.insert(seeds).values({
    ...summary,
    interviewId,
    status: 'crystallized',
    crystallizedAt: new Date(),
  }).returning();
  return seed!;
}
```

### Pattern 5: interviews Table Schema (D-01)

```typescript
// packages/shared/src/db/schema/interview.ts
import { pgTable, pgEnum, uuid, text, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';
import { projects } from './project.js';

export const interviewStatusEnum = pgEnum('interview_status', [
  'active', 'paused', 'completed', 'abandoned',
]);

export const interviewModeEnum = pgEnum('interview_mode', [
  'greenfield', 'brownfield',
]);

export const interviews = pgTable('interviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  status: interviewStatusEnum('status').notNull().default('active'),
  mode: interviewModeEnum('mode').notNull().default('greenfield'),
  transcript: jsonb('transcript').notNull().default([]),  // InterviewTurn[]
  ambiguityScoresHistory: jsonb('ambiguity_scores_history').notNull().default([]),  // per-turn score snapshots
  currentAmbiguityScore: jsonb('current_ambiguity_score'),  // latest AmbiguityScores object
  turnCount: integer('turn_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export type Interview = typeof interviews.$inferSelect;
export type NewInterview = typeof interviews.$inferInsert;
```

Note: `seedStatusEnum` in `packages/shared/src/db/schema/seed.ts` currently has only `'draft' | 'crystallized'`. Phase 3 does NOT need to add `'reviewing'` or `'approved'` to this enum — the review/approval state lives on the `interviews` table (status field), not on seeds. Seeds are only ever inserted once, at crystallization time, directly as `'crystallized'` status. The `'draft'` status may be used for synthesis preview before user approval (tracked in interview record, not seed record).

### Pattern 6: Seed Lineage Query (D-27, confirmed working in Phase 1 tests)

```sql
-- Already tested in packages/shared/src/db/__tests__/schema-invariants.integration.test.ts
WITH RECURSIVE lineage AS (
  SELECT * FROM seeds WHERE id = $1
  UNION ALL
  SELECT s.* FROM seeds s INNER JOIN lineage l ON s.id = l.parent_id
)
SELECT * FROM lineage ORDER BY version ASC
```

### Anti-Patterns to Avoid

- **Mutating seeds table via UPDATE after crystallization:** D-26 requires both app-level guard and DB trigger. Never call `db.update(seeds)` — only INSERT for new seeds.
- **Firing all 5 perspectives every turn:** D-12 requires dynamic activation. Firing all 5 always doubles LLM cost with no clarity gain in early/late turns.
- **Sequential scoring + perspective calls:** D-21 explicitly requires parallel execution (scoring + perspective calls in `Promise.all`). Sequential execution doubles latency between turns.
- **Blocking crystallization on score threshold alone:** D-06 allows early crystallization. Score check must be advisory, not hard-blocking for the crystallize path.
- **Storing seed as YAML file:** D-25 is clear — seeds live only in the DB. YAML export is on-demand serialization.
- **Using `temperature > 0` for scorer:** D-15 requires temperature=0 for near-deterministic scoring. The existing gateway `GatewayCallOptions` already has `temperature?: number` — always pass `0` for scoring calls.
- **Calling gateway with a custom model string outside the config:** All models resolve through `resolveModelChain`. For per-perspective model configuration (D-10), the `perspectiveModels` config key extends `cauldron.config.ts`, not a runtime override.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured LLM output with type safety | Custom JSON parsing + validation | `gateway.generateObject` with Zod schema | AI SDK handles retries, schema validation, and type inference; already wired into gateway |
| Parallel async execution | Manual Promise chaining | `Promise.all([...perspectiveCalls, scoringCall])` | Native JS; no library needed |
| DB trigger for immutability | Application-only guard | PostgreSQL BEFORE UPDATE trigger in migration SQL | Application guards can be bypassed by direct DB writes; triggers cannot |
| Session persistence/resume | Custom serialization | Drizzle insert/update on `interviews` table with JSONB transcript | JSONB handles the transcript array natively; Drizzle types it |
| Lineage query | N+1 parent fetches | PostgreSQL recursive CTE | Single query, already proven working in Phase 1 integration tests |
| Score weighting | Floating point accumulator | Simple arithmetic on Zod-validated scores | No library needed; the 40/30/30 and 35/25/25/15 weights are just multiplications |
| FSM state validation | Ad-hoc if/else | Explicit transition table in `fsm.ts` | Makes invalid transitions impossible to accidentally introduce |

---

## Common Pitfalls

### Pitfall 1: seedStatusEnum Does Not Include 'reviewing' or 'approved'

**What goes wrong:** Developer adds a `reviewing` status to the seeds table to track the summary review flow, triggering an unnecessary migration and confusing the seed lifecycle.

**Why it happens:** The FSM has `reviewing → approved → crystallized` phases, and it's natural to mirror that in the seeds table.

**How to avoid:** The review/approval state belongs to the `interviews` table (status = 'active' during review, 'completed' after crystallization). Seeds are INSERTED once, at crystallization time, always as `status = 'crystallized'`. The `'draft'` seed status exists for potential future use but is not needed by Phase 3's crystallization path.

**Warning signs:** A migration adding `'reviewing'` to `seed_status` enum.

### Pitfall 2: generateObject Schema Compatibility with Zod 4 + AI SDK 6

**What goes wrong:** Using Zod 4 discriminated unions or `z.union()` as the top-level schema for `generateObject` — some providers don't support complex union schemas in structured output mode.

**Why it happens:** Zod 4 ships new features; not all AI SDK providers pass all Zod types through to structured output correctly.

**How to avoid:** Keep scorer and perspective schemas as flat `z.object()` with `z.number()` fields. Avoid `z.union()` or `z.discriminatedUnion()` at the top level of generateObject schemas. The greenfield and brownfield scorer schemas differ only by the addition of `contextClarity` — use `.extend()` not union.

**Warning signs:** TypeScript compiles but runtime throws schema serialization errors from Anthropic/OpenAI provider.

### Pitfall 3: Anomaly Detection Must Not Block the Turn

**What goes wrong:** When anomaly detection (D-20) triggers a scoring retry, the entire turn's perspective calls are re-run, adding 2x latency.

**Why it happens:** The developer waits for the retry to complete before presenting the question.

**How to avoid:** Run one scoring retry transparently. If the retry also produces an anomalous result, accept it and flag it in the transcript metadata for debugging. Never block the user-facing turn on more than one retry. Log the anomaly via pino for later analysis.

**Warning signs:** Average turn latency > 10 seconds when anomalies are present.

### Pitfall 4: Parallel Calls May Exhaust the Budget

**What goes wrong:** `Promise.all` fires 5 perspective calls + 1 scoring call simultaneously. If the project is near the budget limit, all 6 calls pass the `checkBudget` pre-check (which reads the same snapshot), but the aggregate cost exceeds the limit.

**Why it happens:** `checkBudget` reads current usage and compares it to the limit, but 6 concurrent calls all read before any write.

**How to avoid:** Accept this as an acceptable race — the budget check is a soft guardrail, not a hard atomic transaction. The existing gateway behavior (fire-and-forget usage recording) is intentional. Document this in interview module comments. Hard budget enforcement would require a distributed lock, which is not warranted here.

**Warning signs:** Budget slightly exceeded after multi-perspective turns near the limit.

### Pitfall 5: Drizzle Cannot Express PostgreSQL Triggers — Use Raw Migration SQL

**What goes wrong:** Developer searches for a Drizzle API to define a BEFORE UPDATE trigger in the schema file and can't find one, concludes it's unsupported, and uses only the application-level guard.

**Why it happens:** Drizzle ORM docs focus on table/column definitions; triggers are a Postgres-specific extension.

**How to avoid:** Write the trigger in the migration SQL file directly (in the `0003_*.sql` migration). Drizzle Kit's `drizzle-kit generate` will not include it — the trigger must be manually added to the generated SQL file after generation, or added as a separate hand-written migration. Use `CREATE OR REPLACE FUNCTION` and `CREATE TRIGGER` syntax directly.

**Warning signs:** Application-level immutability tests pass but a raw `UPDATE seeds SET goal = 'x' WHERE status = 'crystallized'` via psql succeeds.

### Pitfall 6: `truncateAll` in Integration Tests Must Include `interviews` Table

**What goes wrong:** After adding the `interviews` table, the test teardown function in `packages/shared/src/db/__tests__/setup.ts` doesn't include it, causing test isolation failures.

**Why it happens:** The `truncateAll` function lists tables explicitly.

**How to avoid:** Add `interviews` to the TRUNCATE statement in `setup.ts` as part of the migration task. The table must be truncated BEFORE `seeds` (FK constraint: seeds.interviewId references interviews.id).

Correct order: `llm_usage, project_snapshots, events, holdout_vault, bead_edges, beads, seeds, interviews, projects`

### Pitfall 7: cauldron.config.ts `perspectiveModels` Key Is New — Gateway Must Handle Missing Key

**What goes wrong:** The gateway's `resolveModelChain` will throw `Error: No models configured for stage: interview` if a perspective tries to use a model not in the config chain.

**Why it happens:** D-10 adds `perspectiveModels` as a new optional config key. If not present, fall back to interview-stage default.

**How to avoid:** In the perspective panel, resolve models from `config.perspectiveModels?.[perspectiveName] ?? config.models.interview[0]`. The `GatewayConfig` type will need a new optional field. Pass the resolved model string through a new `model?` override field in `GatewayCallOptions` (or resolve the model ID outside the gateway and create a separate direct-model call path).

**Warning signs:** TypeScript error on `config.perspectiveModels` — the type needs updating.

---

## Code Examples

### Verified Patterns from Existing Codebase

#### generateObject Call Pattern (confirmed in gateway.ts)

```typescript
// All scoring and perspective calls use this pattern
const result = await gateway.generateObject({
  projectId,
  stage: 'interview',
  schema: scoringSchema,        // Zod schema
  temperature: 0,               // deterministic for scoring
  system: SCORER_SYSTEM_PROMPT,
  prompt: buildScorerPrompt(transcript),
  schemaName: 'AmbiguityScores',
  schemaDescription: 'Clarity scores per dimension after analyzing the interview transcript',
});
const scores = result.object;  // typed as z.infer<typeof scoringSchema>
```

#### Event Store Pattern (confirmed in event-store.ts)

```typescript
// Append interview events
await appendEvent(db, {
  projectId,
  type: 'interview_started',
  payload: { interviewId, mode },
});

await appendEvent(db, {
  projectId,
  type: 'interview_completed',
  payload: { interviewId, finalAmbiguityScore, turnCount },
});

await appendEvent(db, {
  projectId,
  seedId,
  type: 'seed_crystallized',
  payload: { interviewId, ambiguityScore, version },
});
```

Note: All three event types (`interview_started`, `interview_completed`, `seed_crystallized`) are already in the `event_type` enum from Phase 1 — no enum migration needed.

#### Drizzle JSONB Pattern for Transcript (confirmed in existing schemas)

```typescript
// Read and update transcript
const [interview] = await db
  .select()
  .from(interviews)
  .where(eq(interviews.id, interviewId));

const transcript = interview.transcript as InterviewTurn[];
const newTurn: InterviewTurn = { ... };

await db
  .update(interviews)
  .set({
    transcript: [...transcript, newTurn],
    turnCount: interview.turnCount + 1,
    currentAmbiguityScore: newScore,
    ambiguityScoresHistory: [...(interview.ambiguityScoresHistory as AmbiguityScores[]), newScore],
  })
  .where(eq(interviews.id, interviewId));
```

#### Recursive CTE for Lineage (confirmed working in integration tests)

```typescript
import { sql } from 'drizzle-orm';

export async function getSeedLineage(db: DbClient, seedId: string) {
  return db.execute(sql`
    WITH RECURSIVE lineage AS (
      SELECT * FROM seeds WHERE id = ${seedId}
      UNION ALL
      SELECT s.* FROM seeds s INNER JOIN lineage l ON s.id = l.parent_id
    )
    SELECT id, version, interview_id, parent_id, created_at, ambiguity_score
    FROM lineage
    ORDER BY version ASC
  `);
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single LLM call for interview question | Multi-perspective parallel panel | 2024-2025 (multi-agent patterns) | More cognitive diversity; 3-5x more questions considered per turn |
| Prompt-based open-ended responses | `generateObject` with Zod schema for structured scoring | AI SDK 4.x+ | Eliminates JSON parsing bugs; scores are typed |
| `maxTokens` parameter | `maxOutputTokens` in AI SDK v6 | AI SDK v6 (confirmed in Phase 2 gateway.ts) | Must use `maxOutputTokens` not `maxTokens` in gateway calls |
| `pipeline` key in turbo.json | `tasks` key | Turborepo 2.x (confirmed in Phase 1) | `pipeline` is deprecated |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL (dev) | Interview table, seed crystallization | ✓ | Running (cauldron-postgres-1, healthy) | — |
| PostgreSQL (test) | Integration tests | ✓ | Running (cauldron-postgres-test-1, healthy) | — |
| Node.js | Engine package execution | ✓ | v22.22.1 | — |
| pnpm | Package management | ✓ | 10.32.1 | — |
| AI provider keys | LLM calls (perspective, scoring, synthesis) | Unknown at plan time | Set in env | Tests can mock gateway |

**Notes:**
- No new infrastructure dependencies introduced by Phase 3
- AI provider API keys are required for integration tests that make real LLM calls; unit tests should mock the gateway
- Both Postgres instances confirmed running and healthy

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 |
| Config file (unit) | `packages/engine/vitest.config.ts` — `include: ['src/**/*.test.ts']` |
| Config file (integration) | `packages/shared/vitest.integration.config.ts` — `include: ['src/**/*.integration.test.ts']`, maxWorkers: 1 |
| Quick run (unit) | `pnpm --filter @cauldron/engine test` |
| Full suite (integration) | `pnpm --filter @cauldron/shared test:integration` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INTV-01 | Multi-perspective panel generates candidate questions | unit | `pnpm --filter @cauldron/engine test -- perspectives.test.ts` | ❌ Wave 0 |
| INTV-02 | Ranker produces MC options + rationale from candidates | unit | `pnpm --filter @cauldron/engine test -- ranker.test.ts` | ❌ Wave 0 |
| INTV-03 | Same transcript always produces same ambiguity score | unit | `pnpm --filter @cauldron/engine test -- scorer.test.ts` | ❌ Wave 0 |
| INTV-04 | Interview FSM refuses crystallize when score > 0.2 (unless forced) | unit | `pnpm --filter @cauldron/engine test -- fsm.test.ts` | ❌ Wave 0 |
| INTV-05 | Brownfield adds contextClarity dimension with correct weights | unit | `pnpm --filter @cauldron/engine test -- scorer.test.ts` | ❌ Wave 0 |
| INTV-06 | synthesizeSummary returns structured summary from transcript | unit | `pnpm --filter @cauldron/engine test -- synthesizer.test.ts` | ❌ Wave 0 |
| INTV-07 | approveAndCrystallize transitions interview to 'completed' | integration | `pnpm --filter @cauldron/shared test:integration -- interview.integration.test.ts` | ❌ Wave 0 |
| SEED-01 | Crystallized seed has all 6 structured columns populated | integration | `pnpm --filter @cauldron/shared test:integration -- interview.integration.test.ts` | ❌ Wave 0 |
| SEED-02 | Attempting to mutate crystallized seed throws ImmutableSeedError | integration | `pnpm --filter @cauldron/shared test:integration -- interview.integration.test.ts` | ❌ Wave 0 |
| SEED-03 | Crystallized seed has id, version, createdAt, parentId, interviewId | integration | `pnpm --filter @cauldron/shared test:integration -- interview.integration.test.ts` | ❌ Wave 0 |
| SEED-04 | Lineage CTE from evolved seed returns full ancestor chain | integration | `pnpm --filter @cauldron/shared test:integration -- interview.integration.test.ts` | ❌ Wave 0 (lineage tested in Phase 1; extend existing) |

### Sampling Rate
- **Per task commit:** `pnpm --filter @cauldron/engine test`
- **Per wave merge:** `pnpm --filter @cauldron/engine test && pnpm --filter @cauldron/shared test:integration && pnpm --filter @cauldron/engine typecheck && pnpm --filter @cauldron/shared typecheck`
- **Phase gate:** Full unit + integration suite green + `pnpm build` from root before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/engine/src/interview/__tests__/fsm.test.ts` — covers INTV-04
- [ ] `packages/engine/src/interview/__tests__/scorer.test.ts` — covers INTV-03, INTV-05
- [ ] `packages/engine/src/interview/__tests__/perspectives.test.ts` — covers INTV-01, INTV-02
- [ ] `packages/engine/src/interview/__tests__/synthesizer.test.ts` — covers INTV-06
- [ ] `packages/engine/src/interview/__tests__/interview.integration.test.ts` — covers INTV-07, SEED-01 through SEED-04
- [ ] `packages/shared/src/db/schema/interview.ts` — new table schema (prerequisite for tests)
- [ ] Migration `0003_*.sql` — interviews table + BEFORE UPDATE trigger

---

## Project Constraints (from CLAUDE.md)

The following directives from CLAUDE.md apply to Phase 3:

| Constraint | Application to Phase 3 |
|------------|------------------------|
| TypeScript end-to-end | All new files in `packages/engine/src/interview/` and `packages/shared/src/db/schema/interview.ts` must be `.ts` with strict types |
| Vercel AI SDK for all LLM calls | `generateObject`, `generateText` via existing `LLMGateway` — no direct AI SDK calls outside gateway |
| OSS dependencies: 80% clean or skip | Phase 3 requires no new dependencies; all needed libraries already installed |
| Encryption not applicable here | Holdout encryption (Phase 4), not Phase 3 |
| PostgreSQL, not SQLite | Single instance; row-level locking via Drizzle transactions for crystallization |
| Drizzle ORM for DB access | Schema in `packages/shared/src/db/schema/`; calls via `DbClient` |
| Zod for runtime validation | Scorer schemas, transcript turn types, synthesis output schema |
| pino for logging | Log per-turn timing, LLM call metadata, anomaly detection events |
| Vitest for testing | Unit tests in engine, integration tests in shared |
| `.js` extensions on all relative TS imports | Node16 moduleResolution — required on every `import` in new files |
| No `updatedAt` on immutable entities | seeds table already has no `updatedAt`; interviews table DOES use `completedAt` (not updatedAt) |
| GSD workflow for all edits | All file changes through `/gsd:execute-phase` |
| `pnpm build` in regression gate | Include build step after test+typecheck per MEMORY feedback |

---

## Open Questions

1. **`perspectiveModels` config key shape: how does the gateway resolve a per-perspective model override?**
   - What we know: D-10 says perspectives can use different models, configured via `perspectiveModels` map in `cauldron.config.ts`. The existing `GatewayConfig` type only has `models: Record<PipelineStage, string[]>`.
   - What's unclear: The gateway's `resolveModelChain` always takes a `PipelineStage`. To support per-perspective models, either (a) add `perspectiveModels?: Partial<Record<PerspectiveName, string>>` to `GatewayConfig` and resolve in the interview module before calling gateway, or (b) add a `modelOverride?` field to `GatewayCallOptions`.
   - Recommendation: Option (b) is cleaner — add `modelOverride?: string` to `GatewayCallOptions`. When set, skip `resolveModelChain` and use the override directly. This keeps per-perspective model resolution in the interview module (where the config is read), not in the gateway.

2. **Ambiguity scoring weights (40/30/30) unvalidated — how should planner handle this?**
   - What we know: STATE.md explicitly flags these weights as "unvalidated empirically." D-16 specifies them.
   - What's unclear: Will the weights produce meaningful scoring in practice?
   - Recommendation: Implement with the specified weights but extract them as named constants (not inline magic numbers) so they can be changed without touching business logic. Document in code that these are provisional per STATE.md concern.

3. **`interviews` table FK: `seeds.interviewId` references `interviews.id` — migration order matters**
   - What we know: The seeds table already has `interviewId uuid` column (Phase 1), but it's declared without a FK constraint (just a plain `uuid` column — verified in `seed.ts`). The `interviews` table doesn't exist yet.
   - What's unclear: Should migration 0003 add the FK constraint to the existing `interviewId` column at the same time it creates the interviews table?
   - Recommendation: Yes — migration 0003 should: (1) create `interviews` table, (2) add `ALTER TABLE seeds ADD CONSTRAINT seeds_interview_id_fk FOREIGN KEY (interview_id) REFERENCES interviews(id)`. This closes the dangling reference.

---

## Sources

### Primary (HIGH confidence)
- Direct code read: `packages/shared/src/db/schema/seed.ts` — confirmed column structure, no FK on interviewId, no updatedAt
- Direct code read: `packages/shared/src/db/schema/event.ts` — confirmed interview_started, interview_completed, seed_crystallized in event_type enum
- Direct code read: `packages/engine/src/gateway/gateway.ts` — confirmed generateObject signature, temperature param, stage-based routing
- Direct code read: `packages/engine/src/gateway/types.ts` — confirmed GatewayCallOptions shape
- Direct code read: `packages/shared/src/db/__tests__/schema-invariants.integration.test.ts` — confirmed recursive CTE lineage query works
- Direct code read: `packages/shared/src/db/__tests__/setup.ts` — confirmed truncateAll table list (must be updated)
- Direct code read: `packages/engine/package.json` — confirmed zod, ai, pino all installed
- Direct code read: `packages/shared/src/db/migrations/0002_material_ikaris.sql` — confirmed current migration state

### Secondary (MEDIUM confidence)
- CLAUDE.md technology stack table — confirmed versions for all packages
- `.planning/phases/03-interview-seed-pipeline/03-CONTEXT.md` — all decisions from user discussion
- `npm view zod version` → 4.3.6 (verified 2026-03-26)
- `npm view ai version` → 6.0.138 (verified 2026-03-26)

### Tertiary (LOW confidence)
- AI SDK `generateObject` at temperature=0 behavior: per AI SDK docs pattern, temperature=0 is supported for structured output; however, "same transcript → same scores" also depends on model non-determinism at the provider level. Anthropic claude-haiku may have slight non-determinism at temperature=0. Flag as "near-deterministic" not "fully deterministic" — consistent with D-15 wording.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use; versions verified against npm registry
- Architecture: HIGH — patterns derived directly from reading existing code; follows established conventions
- Pitfalls: HIGH — derived from reading actual code paths and DB schema; no speculative claims
- DB trigger approach: HIGH — standard PostgreSQL; no library dependency
- AI SDK generateObject at temperature=0: MEDIUM — documented feature; near-determinism claim is provider-dependent

**Research date:** 2026-03-26
**Valid until:** 2026-04-25 (stable stack; 30-day window)
