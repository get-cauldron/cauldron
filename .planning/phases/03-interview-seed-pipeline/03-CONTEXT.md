# Phase 3: Interview & Seed Pipeline - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Socratic interview FSM that gathers requirements through a multi-perspective panel of LLM agents, scores clarity deterministically across weighted dimensions, and crystallizes an immutable seed spec — the sole source of truth for all downstream execution. Covers both greenfield and brownfield interview modes.

</domain>

<decisions>
## Implementation Decisions

### Interview FSM Design
- **D-01:** Dedicated `interviews` table — new table with id, projectId, status (active/paused/completed/abandoned), mode (greenfield/brownfield), transcript (JSONB turn-based array), ambiguity scores history, created/completedAt. Seeds reference via interviewId FK (already on seeds table).
- **D-02:** Linear state machine: `gathering → reviewing → approved → crystallized` plus `paused` and `abandoned` states. No backtracking — user answers sequentially until clarity threshold met, then reviews summary.
- **D-03:** Full session resume supported — interview state persisted to DB, user can close and resume later. Transcript and scores preserved across sessions.
- **D-04:** Both greenfield and brownfield modes from day one (INTV-05). Mode auto-detected at interview start: if project has existing code (detected via codebase index or git history), use brownfield. User can override. Mode stored on interview record.
- **D-05:** Purely score-driven termination — no question count cap. Interview runs until ambiguity score <= 0.2.
- **D-06:** Early crystallization allowed — user can force-crystallize before threshold with a clear warning showing current score, gap, and weakest dimensions. Seed is marked with actual score so downstream phases know it's underspecified.
- **D-07:** Turn-based transcript structure: `{turnNumber, perspective, question, mcOptions[], userAnswer, freeformText?, ambiguityScoreSnapshot, model, allCandidates[], timestamp}`. Score snapshot per turn enables charting progress. All 5 candidate questions stored in `allCandidates` metadata.
- **D-08:** Per-turn model tracking — each transcript turn records the model ID used for auditability and debugging.

### Multi-Perspective Panel
- **D-09:** 5 parallel LLM calls per turn (one per perspective: researcher, simplifier, architect, breadth-keeper, seed-closer). Each perspective has its own system prompt. Maximum cognitive diversity.
- **D-10:** Cross-model perspective diversity — different perspectives can use different LLM models. Configurable per-perspective in `cauldron.config.ts` via a `perspectiveModels` map (e.g., `{researcher: 'claude-sonnet-4-6', architect: 'gpt-4o'}`). Per-project overrides possible. Falls back to interview-stage default if not configured.
- **D-11:** LLM ranker merges candidates — a separate LLM call (using interview-stage default model) receives all perspective candidates + transcript context, picks the single most valuable question, and generates 3-4 MC answer suggestions. One call does selection + MC generation.
- **D-12:** Dynamic perspective activation — not all 5 fire every turn. Early turns: researcher + simplifier + breadth-keeper. Mid turns: architect + breadth-keeper. Late turns: seed-closer + architect. Activation based on previous turn's ambiguity scores. Saves cost.
- **D-13:** Ranker shows perspective rationale to user — brief context like "From the Architect perspective: We need to understand your data model before we can assess scalability." Helps user understand why they're being asked this.
- **D-14:** Unused perspective questions (4 not selected) stored in transcript metadata for debugging and potential future reuse.

### Ambiguity Scoring
- **D-15:** Hybrid scoring — LLM at temperature=0 with `generateObject` produces per-dimension clarity scores using a Zod schema, then rule-based validations complement. Near-deterministic: same transcript → same scores.
- **D-16:** Greenfield: 3-dimension matrix (goal clarity 40%, constraint clarity 30%, success criteria clarity 30%). Brownfield: 4-dimension matrix (goal 35%, constraint 25%, success criteria 25%, context clarity 15%).
- **D-17:** Full dimension breakdown visible to user: "Goal: 85%, Constraints: 60%, Success criteria: 40% — Overall: 0.38". Shows exactly where clarity gaps are.
- **D-18:** Fast/cheap model for scoring (e.g., Haiku, GPT-4o-mini) since it's structured output with a fixed schema. Configurable in cauldron.config.ts. Speed matters — user is waiting between turns.
- **D-19:** Full transcript as scorer input — scorer sees entire Q&A history for accurate cumulative clarity assessment.
- **D-20:** Rule validations: scores in [0,1], no single answer drops a dimension by >0.3 (anomaly detection), overall score monotonicity hint (shouldn't decrease after substantive answer). Anomaly triggers one scoring retry.
- **D-21:** Scoring and next-turn perspective calls run in parallel after each user answer. Perspective activation for current turn uses previous turn's scores (already available). Fresh score becomes available for next turn's activation.

### Seed Crystallization
- **D-22:** LLM synthesis from full transcript — a dedicated LLM call (interview-stage default model) takes the complete transcript and produces a structured summary matching the seed DB columns: goal, constraints, acceptance criteria, ontology schema, evaluation principles, exit conditions.
- **D-23:** Edit-then-approve flow — user sees the full summary with each section editable. They can modify any field. Once satisfied, explicit "Approve & Crystallize" action. Edits tracked as summary revisions.
- **D-24:** Ontology schema contains a domain entity map: key entities, their relationships, and core attributes inferred from the interview. Structured JSON: `{entities: [{name, attributes[], relations: [{to, type}]}]}`. Gives decomposition (Phase 5) a head start.
- **D-25:** DB-only — the seeds table IS the seed (Phase 1 D-01 structured columns). YAML is a serialization format for export/display, generated on-demand from DB record. No file on disk.
- **D-26:** Immutability enforced via both application-level guard (ImmutableSeedError when status='crystallized') AND PostgreSQL BEFORE UPDATE trigger. Belt and suspenders.
- **D-27:** Seed lineage via recursive CTE (confirmed from Phase 1 D-03). Single SQL query walks parent_id chain. Returns full chain: seed → parent → ... → original + interview_id.

### Claude's Discretion
- Exact perspective system prompt content and structure
- Interview table indexing strategy
- FSM transition validation implementation details
- Zod schemas for scoring and synthesis structured output
- Event store event payloads for interview events
- Error types and error handling patterns
- DB trigger implementation details
- Perspective activation thresholds (which score ranges trigger which perspectives)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §INTV-01 through §INTV-07, §SEED-01 through §SEED-04 — All Phase 3 requirements with success criteria

### Prior Phase Context
- `.planning/phases/01-persistence-foundation/01-CONTEXT.md` — Schema decisions: D-01 (seed structured columns), D-03 (lineage via parent_id), D-05/D-06 (event sourcing)
- `.planning/phases/02-llm-gateway/02-CONTEXT.md` — Gateway API: D-01 (stage enum), D-02/D-03 (streamText/generateText/generateObject), D-06 (system prompt injection), D-07 (cross-model diversity)

### Existing Code
- `packages/shared/src/db/schema/seed.ts` — Seeds table with structured columns (goal, constraints, acceptanceCriteria, ontologySchema, evaluationPrinciples, exitConditions, ambiguityScore, interviewId, parentId)
- `packages/shared/src/db/schema/event.ts` — Event types including interview_started, interview_completed, seed_crystallized
- `packages/engine/src/gateway/` — LLM gateway with interview stage routing, generateObject, streamText
- `packages/engine/src/gateway/types.ts` — PipelineStage, GatewayCallOptions, GatewayObjectOptions types
- `packages/engine/src/gateway/diversity.ts` — Cross-model diversity enforcement

### Research
- `.planning/research/STACK.md` — Technology stack: Vercel AI SDK 6, Drizzle, Inngest 4, specific versions
- `.planning/research/ARCHITECTURE.md` — Component boundaries, data flow patterns

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **LLM Gateway** (`packages/engine/src/gateway/gateway.ts`): `generateObject`, `streamText`, `generateText` with stage-based routing, failover, and token tracking. All interview LLM calls go through this.
- **Event Store** (`packages/shared/src/db/event-store.ts`): Append events for interview_started, interview_completed, seed_crystallized
- **Seeds Schema** (`packages/shared/src/db/schema/seed.ts`): All seed fields already defined as structured columns with correct types
- **Pricing & Budget** (`packages/engine/src/gateway/pricing.ts`, `budget.ts`): Token cost tracking already works per-call
- **Diversity Enforcement** (`packages/engine/src/gateway/diversity.ts`): Cross-model diversity check available for perspective model assignments

### Established Patterns
- Drizzle schema in `packages/shared`, consumed by engine and api packages
- pgEnum for status enums (seedStatusEnum: draft/crystallized)
- UUID primary keys with `.defaultRandom()`
- Timestamps with `{ withTimezone: true }`
- No `updatedAt` on immutable entities
- `.js` extensions on all relative TypeScript imports (Node16 moduleResolution)
- Structured gateway call options with stage enum

### Integration Points
- New `interviews` table added to `packages/shared/src/db/schema/` with Drizzle migration
- Interview FSM module created in `packages/engine/src/interview/` (new directory)
- Seeds table already has `interviewId` FK — just needs to reference the new interviews table
- Gateway called with `stage: 'interview'` for all LLM calls (perspectives, ranker, scorer, synthesizer)
- Event store receives interview events (types already defined)
- `cauldron.config.ts` extended with `perspectiveModels` map and scoring model config
- seedStatusEnum may need extension (currently: draft, crystallized — may need 'reviewing', 'approved' if tracking summary review state)

</code_context>

<specifics>
## Specific Ideas

- Per-turn flow: user answers → (parallel) scoring call + perspective calls → ranker picks best question + generates MC → present to user. Minimizes latency.
- Dynamic perspective activation uses previous turn's ambiguity scores to decide which 2-3 perspectives to fire (not always all 5).
- Cross-model perspectives: researcher might use Claude, architect might use GPT-4o — configurable via perspectiveModels in config.
- Scoring model should be fast/cheap (Haiku or GPT-4o-mini class) since it runs every turn and user is waiting.
- Synthesis model should be the strongest interview-stage model since it's the most critical call.
- Brownfield auto-detection: check for git history or codebase index presence. When Code Intelligence (Phase 6) is available, brownfield interviews receive codebase context.
- The ambiguity scoring weights (40/30/30 greenfield, 35/25/25/15 brownfield) are from the Ouroboros spec but flagged as unvalidated empirically in STATE.md. Build with these weights but make them configurable for future calibration.

</specifics>

<deferred>
## Deferred Ideas

- **D-23 edit-tracking for summary revisions** — The "Approve & Crystallize" flow is implemented in Phase 3, but the revision tracking mechanism (tracking diffs of user edits to the summary before approval) is deferred to Phase 8 (Dashboard & UX). Phase 3 provides the `approveAndCrystallize` API accepting a (possibly user-modified) `SeedSummary`; the UI layer in Phase 8 will track edit history.

</deferred>

---

*Phase: 03-interview-seed-pipeline*
*Context gathered: 2026-03-25*