# Phase 7: Evolutionary Loop - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

The pipeline evaluates whether built software meets the *goal* (not just the spec), evolves a new immutable seed when it does not, detects convergence through multiple independent signals, activates lateral thinking on stagnation, escalates to humans when convergence looks unlikely, and unseals holdout tests after any terminal state. This completes the full autonomous loop.

</domain>

<decisions>
## Implementation Decisions

### Goal vs Spec Evaluation (EVOL-01, EVOL-02)
- **D-01:** LLM judge with rubric for goal attainment — separate from holdout pass/fail (spec compliance)
- **D-02:** Score >= 0.95 = success, below triggers evolution
- **D-03:** Cross-model diversity enforced for evaluator (different family than implementer)
- **D-04:** evaluation_principles from seed map to weighted rubric dimensions. LLM scores each dimension, weighted sum produces final score
- **D-05:** Gap analysis is per-dimension: each rubric dimension gets a gap statement with score and description

### Evolution Trigger & Seed Mutation (EVOL-03, EVOL-04)
- **D-06:** Tiered evolution based on score:
  - Score < 0.4 → full seed regeneration (re-run crystallizer with gap analysis as context) + re-run all beads
  - Score >= 0.4 → LLM rewrites acceptance criteria only, goal/constraints unchanged + keep completed beads, add new ones
- **D-07:** Evolved seeds track generation counter + evolution_context JSONB (gap analysis, score, tier used)
- **D-08:** Bead reuse follows same tiered approach: < 0.4 = clean slate, >= 0.4 = keep completed, add new

### Convergence Signals (EVOL-05 through EVOL-09)
- **D-09:** Any-of, independent — first signal to fire halts the loop. evolution_context records which signal fired
- **D-10:** Ontology stability: AC set Jaccard similarity + embedding cosine similarity, both must be >= 0.95 across 2 consecutive generations
- **D-11:** Embeddings via OpenAI text-embedding-3-large (3072 dims). 0.95 threshold calibrated for this model
- **D-12:** Oscillation detection checks periods 2-4 (similarity to grandparent, great-grandparent, great-great-grandparent)
- **D-13:** Repetitive feedback: structured gap IDs first (hash of dimension + description), embedding similarity fallback (>= 0.70 cosine = repetitive)

### Lateral Thinking & Escalation (EVOL-10, EVOL-11)
- **D-14:** All 5 personas (contrarian, hacker, simplifier, researcher, architect) run in parallel on stagnation, each producing an alternative seed proposal
- **D-15:** LLM meta-judge (cross-model from personas) selects the most promising proposal or merges complementary ideas
- **D-16:** Human escalation fires only AFTER lateral thinking fails (stagnation → personas → still stagnant → escalate)
- **D-17:** Notification: always emit 'evolution_escalated' event + optionally fire webhook if configured in project settings

### Token Budget Circuit Breaker (EVOL-12)
- **D-18:** Cumulative cost tracked per seed lineage (not per generation). Uses existing llm_usage table with evolution_cycle column. BudgetExceededError fires when lineage total exceeds configurable threshold

### Holdout Unsealing
- **D-19:** Unseal holdout tests on ANY terminal state (convergence, hard cap, budget exceeded, human-approved stop). Results are always valuable feedback

### v1 Test Case Strategy
- **D-20:** Sabotage holdouts to guarantee at least one evolutionary cycle. Write holdout tests targeting edge cases the first seed doesn't mention

### Evolution FSM
- **D-21:** 8-state granular FSM for maximum observability:
  - idle → evaluating → scoring → evolving → decomposing → executing → merging → (back to evaluating)
  - lateral_thinking (sub-state of evolving, activated on stagnation)
  - converged (terminal, positive)
  - halted (terminal: hard cap, budget, or escalation)

### Claude's Discretion
- Specific rubric dimension names and default weights (can be overridden by seed evaluation_principles)
- Internal prompt design for the LLM judge and lateral thinking personas
- Embedding model integration details (AI SDK vs direct API call)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Evolution Infrastructure
- `packages/engine/src/holdout/events.ts` — convergenceHandler, handleEvolutionConverged Inngest function
- `packages/engine/src/holdout/evaluator.ts` — holdout evaluation (spec compliance, not goal attainment)
- `packages/engine/src/holdout/vault.ts` — unsealVault, storeEvalResults
- `packages/engine/src/gateway/types.ts` — PipelineStage includes 'evaluation', evolutionCycle field

### Seed & Lineage
- `packages/engine/src/interview/crystallizer.ts` — getSeedLineage (recursive CTE)
- `packages/shared/src/db/schema/seeds.ts` — seed table schema (needs generation + evolution_context columns)

### Budget & Gateway
- `packages/engine/src/gateway/gateway.ts` — LLMGateway with budget enforcement
- `packages/engine/src/gateway/budget.ts` — checkBudget, BudgetExceededError

### Event System
- `packages/shared/src/db/schema/events.ts` — event_type enum includes evolution_started, evolution_converged
- DB migration pattern: `packages/shared/src/db/migrations/`

### Decomposition & Execution
- `packages/engine/src/decomposition/events.ts` — beadDispatchHandler, beadCompletionHandler
- `packages/engine/src/decomposition/scheduler.ts` — findReadyBeads, claimBead

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `convergenceHandler` in holdout/events.ts — already unseals vault and emits evolution_started on failure. Needs extension for the full evo loop
- `evaluator.ts` — evaluateHoldouts function. Goal attainment evaluator can follow the same pattern
- `LLMGateway.generateObject` — used throughout for structured LLM output. Same pattern for rubric scoring
- `appendEvent` — event sourcing pattern for all state transitions
- `BudgetExceededError` + `checkBudget` — existing budget enforcement, needs lineage-level aggregation
- `getSeedLineage` — recursive CTE for parent chain, can derive generation count

### Established Patterns
- Inngest `createFunction` with `step.run` for durable execution — same pattern for evolution FSM steps
- Cross-model diversity enforcement via `enforceDiversity` in gateway
- Zod schemas for structured LLM output (no min/max/int/uuid constraints per Phase 6.2 findings)
- Module-level deps pattern (configureSchedulerDeps, configureVaultDeps) for testability

### Integration Points
- `handleEvolutionConverged` Inngest function — entry point for the evaluation step
- `evolution_started` event — currently emitted by convergenceHandler, consumed by the evo loop
- DB event_type enum — may need new types: evolution_escalated, evolution_lateral_thinking, etc.
- Seeds table — needs generation integer + evolution_context JSONB columns (migration)

</code_context>

<specifics>
## Specific Ideas

- Tiered evolution (< 0.4 full regen, >= 0.4 AC rewrite) is a key architectural choice — the threshold should be configurable per-project
- Period 2-4 oscillation detection (not just period-2)
- Gap ID hashing for repetitive feedback detection with embedding fallback
- 8-state granular FSM chosen for maximum observability — dashboard (Phase 8) will visualize these states

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-evolutionary-loop*
*Context gathered: 2026-03-26*
