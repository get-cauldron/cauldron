---
phase: 07-evolutionary-loop
verified: 2026-03-26T18:53:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 7: Evolutionary Loop Verification Report

**Phase Goal:** The pipeline evaluates whether the built software actually meets the goal (not just the spec), evolves a new immutable seed when it does not, detects convergence through multiple independent signals, activates lateral thinking on stagnation, escalates to humans when convergence looks unlikely, and unseals holdout tests after convergence — completing the full autonomous loop.
**Verified:** 2026-03-26T18:53:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                  | Status     | Evidence                                                                                              |
|----|----------------------------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------------|
| 1  | Goal attainment evaluator returns 0.0–1.0 weighted score using seed evaluation_principles as rubric dimensions | ✓ VERIFIED | `evaluator.ts`: `buildRubric()` parses `evaluationPrinciples`; `computeWeightedScore()` produces weighted sum; stage='evaluation' with diversity enforced |
| 2  | Gap analysis produces per-dimension gap statements with score, description, and gapId  | ✓ VERIFIED | `evaluator.ts` lines 117–125: filters dimensions with score < 1.0, maps to GapAnalysis with SHA-256 gapId via `hashGapId()` |
| 3  | Evolved seed is created as new immutable row with parentId referencing the original    | ✓ VERIFIED | `mutator.ts` lines 60–76, 97–113, 148–164: three INSERT paths all set `parentId: params.seedId`; never UPDATE |
| 4  | Tiered evolution: score < 0.4 triggers full regen, >= 0.4 triggers AC-only rewrite    | ✓ VERIFIED | `types.ts` FULL_REGEN_THRESHOLD=0.4; `evaluator.ts` line 127: `tier = overallScore < FULL_REGEN_THRESHOLD ? 'full' : 'ac_only'`; `mutator.ts` dispatches on tier |
| 5  | All 5 convergence signals fire on correct conditions and any single signal halts the loop | ✓ VERIFIED | `convergence.ts`: checkHardCap (gen>=30), checkStagnation (3 identical scores), checkOntologyStability (Jaccard AND cosine >=0.95), checkOscillation (period 2/3/4), checkRepetitiveFeedback (>=70% gap ID overlap); `checkConvergence()` priority-ordered any-of semantics; 76 tests pass |
| 6  | Lateral thinking activates 5 personas in parallel on stagnation; meta-judge selects best | ✓ VERIFIED | `lateral-thinking.ts`: PERSONAS tuple has all 5; `runLateralThinking()` uses Promise.all + step.run per persona; `metaJudgeSelect()` evaluates all proposals |
| 7  | Human escalation fires only AFTER lateral thinking fails (stagnation -> personas -> still stagnant -> escalate) | ✓ VERIFIED | `events.ts` lines 180–214: stagnation fires lateral thinking; null return from metaJudge -> `evolution_escalated` event + delegation to `evolution_converged` |
| 8  | Convergence/goal-met both delegate holdout unseal via evolution_converged event         | ✓ VERIFIED | `events.ts`: goal_met sends `evolution_converged`; convergence halt sends `evolution_converged`; escalation sends `evolution_converged`; budget halt sends `evolution_converged`; `holdout/events.ts` line 123: `handleEvolutionConverged` listens on `evolution_converged` |
| 9  | Lineage-level budget check halts loop before each cycle; token budget circuit breaker works | ✓ VERIFIED | `budget.ts`: `checkLineageBudget()` aggregates `llm_usage.costCents` via `inArray(llmUsage.seedId, lineageIds)`; `events.ts` lines 87–108: budget check runs pre-cycle, BudgetExceededError caught and converted to halted/budget_exceeded |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact                                                              | Expected                                       | Status      | Details                                                                 |
|-----------------------------------------------------------------------|------------------------------------------------|-------------|-------------------------------------------------------------------------|
| `packages/engine/src/evolution/types.ts`                             | All evolution domain types                     | ✓ VERIFIED  | 80 lines; exports EvolutionState, ConvergenceSignal, LateralThinkingProposal, GapAnalysis, all constants |
| `packages/engine/src/evolution/embeddings.ts`                        | Embedding and similarity utilities              | ✓ VERIFIED  | 33 lines; exports computeEmbedding, cosineSimilarity, jaccardSimilarity, hashGapId |
| `packages/engine/src/evolution/evaluator.ts`                         | LLM judge goal attainment evaluator             | ✓ VERIFIED  | 135 lines; exports evaluateGoalAttainment, buildRubric; uses gateway.generateObject at stage='evaluation' |
| `packages/engine/src/evolution/mutator.ts`                           | Tiered seed mutation and proposal mutation      | ✓ VERIFIED  | 232 lines; exports mutateSeed (full+ac_only), mutateSeedFromProposal; all paths INSERT new row with parentId |
| `packages/engine/src/evolution/convergence.ts`                       | All 5 convergence signal detectors             | ✓ VERIFIED  | 288 lines; exports checkHardCap, checkStagnation, checkOntologyStability, checkOscillation, checkRepetitiveFeedback, checkConvergence |
| `packages/engine/src/evolution/budget.ts`                            | Lineage-scoped budget enforcement              | ✓ VERIFIED  | 34 lines; exports checkLineageBudget; uses getSeedLineage + inArray aggregate |
| `packages/engine/src/evolution/lateral-thinking.ts`                  | 5-persona lateral thinking + meta-judge        | ✓ VERIFIED  | 211 lines; exports runLateralThinking, generatePersonaProposal, metaJudgeSelect, PERSONAS; null return path for escalation |
| `packages/engine/src/evolution/events.ts`                            | Inngest evolution FSM                          | ✓ VERIFIED  | 281 lines; exports evolutionCycleHandler, handleEvolutionStarted, configureEvolutionDeps; 8-state FSM |
| `packages/engine/src/evolution/index.ts`                             | Barrel exports for evolution module            | ✓ VERIFIED  | 8 lines; re-exports all 8 evolution submodules |
| `packages/engine/src/index.ts`                                       | Engine root barrel includes evolution          | ✓ VERIFIED  | Line 8: `export * from './evolution/index.js'` |
| `packages/shared/src/db/migrations/0009_evolutionary_loop.sql`       | Migration adding generation, evolution_context | ✓ VERIFIED  | Adds seeds.generation (integer), seeds.evolution_context (jsonb), llm_usage.seed_id (uuid), 4 new event types |
| `packages/shared/src/db/schema/seed.ts`                              | seeds table schema updated                     | ✓ VERIFIED  | Line 28: generation integer; line 29: evolutionContext jsonb |
| `packages/shared/src/db/schema/llm-usage.ts`                         | llm_usage schema updated                       | ✓ VERIFIED  | Line 10: seedId uuid references seeds.id; line 23: index on seedId |
| `packages/shared/src/db/schema/event.ts`                             | New event types added                          | ✓ VERIFIED  | Lines 28–31: evolution_lateral_thinking, evolution_escalated, evolution_halted, evolution_goal_met |

---

### Key Link Verification

| From                              | To                                      | Via                                              | Status      | Details                                                                 |
|-----------------------------------|-----------------------------------------|--------------------------------------------------|-------------|-------------------------------------------------------------------------|
| `evolution/evaluator.ts`          | `gateway/gateway.ts`                    | `gateway.generateObject` at stage 'evaluation'   | ✓ WIRED     | Line 49: `params.gateway.generateObject({ stage: 'evaluation', ... })`  |
| `evolution/mutator.ts`            | DB (`seeds` table)                      | Direct INSERT with parentId                      | ✓ WIRED     | Lines 60, 97, 148: `db.insert(seeds).values({ parentId: seedId, ... })` — note: uses direct INSERT rather than crystallizeSeed, which is a documented deliberate deviation (crystallizeSeed enforces interview-flow immutability check not applicable to evolution) |
| `gateway/gateway.ts`              | `gateway/diversity.ts`                  | `enforceDiversity` for evaluation stage          | ✓ WIRED     | Lines 134, 173, 207, 237: `enforceDiversity` called when `stage === 'evaluation'` |
| `evolution/convergence.ts`        | `evolution/embeddings.ts`               | `cosineSimilarity` for ontology/oscillation      | ✓ WIRED     | Lines 9, 107, 156: imports and uses `cosineSimilarity`                  |
| `evolution/budget.ts`             | `interview/crystallizer.ts`             | `getSeedLineage` for ancestor ID collection       | ✓ WIRED     | Line 5 import; line 18: `getSeedLineage(db, seedId)` called             |
| `evolution/lateral-thinking.ts`   | `gateway/gateway.ts`                    | `gateway.generateObject` per persona and meta-judge | ✓ WIRED  | Lines 80, 140: `gateway.generateObject({ stage: 'evaluation', ... })` for both persona proposals and meta-judge |
| `evolution/events.ts`             | `evolution/evaluator.ts`                | `evaluateGoalAttainment` in evaluating state     | ✓ WIRED     | Line 7 import; line 118: `evaluateGoalAttainment(...)` called           |
| `evolution/events.ts`             | `evolution/convergence.ts`              | `checkConvergence` in scoring state              | ✓ WIRED     | Line 8 import; line 147: `checkConvergence(...)` called                 |
| `evolution/events.ts`             | `evolution/mutator.ts`                  | `mutateSeed` and `mutateSeedFromProposal`        | ✓ WIRED     | Line 9 import; lines 245, 219 called in respective branches             |
| `evolution/events.ts`             | `evolution/lateral-thinking.ts`         | `runLateralThinking` on stagnation               | ✓ WIRED     | Line 10 import; line 191: `runLateralThinking(...)` called on stagnation |
| `evolution/events.ts`             | `evolution/budget.ts`                   | `checkLineageBudget` pre-cycle                   | ✓ WIRED     | Line 11 import; line 89: `checkLineageBudget(db, seedId, budgetLimitCents)` |
| `evolution/events.ts`             | `holdout/events.ts`                     | `evolution_converged` event for holdout unseal   | ✓ WIRED     | `step.sendEvent(..., { name: 'evolution_converged', ... })` in all terminal states; `holdout/events.ts` handler registered on `evolution_converged` |

---

### Data-Flow Trace (Level 4)

No UI components or data-rendering artifacts in this phase — the evolution loop is a pure backend pipeline. All data flows are verified through the key link verification above and behavioral spot-checks below. Level 4 trace is not applicable for this phase.

---

### Behavioral Spot-Checks

| Behavior                                 | Command                                                                        | Result           | Status  |
|------------------------------------------|--------------------------------------------------------------------------------|------------------|---------|
| All 76 evolution unit tests pass         | `cd packages/engine && pnpm exec vitest run src/evolution/__tests__/`         | 76 passed (287ms) | ✓ PASS  |
| TypeScript compilation across all packages | `pnpm -r typecheck`                                                           | 4/4 packages pass | ✓ PASS  |
| Engine package build                     | `cd packages/engine && pnpm build`                                             | tsc exits 0      | ✓ PASS  |

---

### Requirements Coverage

| Requirement | Source Plan | Description                                                                        | Status       | Evidence                                                                                                  |
|-------------|-------------|------------------------------------------------------------------------------------|--------------|-----------------------------------------------------------------------------------------------------------|
| EVOL-01     | 07-01, 07-04 | Post-execution evaluation assesses goal attainment (not just spec compliance)      | ✓ SATISFIED  | `evaluator.ts`: evaluates against goal + rubric dimensions, not bead spec; stage='evaluation'             |
| EVOL-02     | 07-01, 07-04 | Evaluation uses weighted principles from seed's evaluation_principles field        | ✓ SATISFIED  | `evaluator.ts` buildRubric() parses seed.evaluationPrinciples JSONB into weighted rubric                  |
| EVOL-03     | 07-01, 07-04 | If goal not met, system generates a new immutable evolved seed with parent reference | ✓ SATISFIED  | `mutator.ts`: all INSERT paths set parentId; `events.ts` calls mutateSeed when score < SUCCESS_THRESHOLD  |
| EVOL-04     | 07-01, 07-04 | Evolution decomposes new/changed acceptance criteria into new beads                | ✓ SATISFIED  | `events.ts` lines 259–267: sends `bead.dispatch_requested` with tier + conditional previousSeedId (D-08)  |
| EVOL-05     | 07-02        | Convergence detection: ontology stability (similarity >= 0.95 across 2 generations) | ✓ SATISFIED  | `convergence.ts` checkOntologyStability: Jaccard AND cosine >= ONTOLOGY_SIMILARITY_THRESHOLD (0.95)       |
| EVOL-06     | 07-02        | Convergence detection: stagnation (unchanged for 3 consecutive generations)        | ✓ SATISFIED  | `convergence.ts` checkStagnation: last STAGNATION_WINDOW=3 scores within 0.001 epsilon                   |
| EVOL-07     | 07-02        | Convergence detection: oscillation (period-2 cycling detected)                     | ✓ SATISFIED  | `convergence.ts` checkOscillation: checks periods 2, 3, 4 via cosine similarity                          |
| EVOL-08     | 07-02        | Convergence detection: repetitive feedback (wonder questions repeat >= 70%)        | ✓ SATISFIED  | `convergence.ts` checkRepetitiveFeedback: gap ID overlap ratio >= REPETITIVE_FEEDBACK_THRESHOLD (0.70)    |
| EVOL-09     | 07-02        | Hard cap: maximum 30 evolution generations                                         | ✓ SATISFIED  | `convergence.ts` checkHardCap: fires when generation >= MAX_GENERATIONS=30                                |
| EVOL-10     | 07-03, 07-04 | Lateral thinking personas activate on stagnation (contrarian, hacker, simplifier, researcher, architect) | ✓ SATISFIED  | `lateral-thinking.ts` PERSONAS tuple all 5; `events.ts` triggers runLateralThinking on stagnation; REQUIREMENTS.md checkbox is stale (not updated) — code fully implements |
| EVOL-11     | 07-03, 07-04 | Human escalation mechanism triggers when convergence looks unlikely                | ✓ SATISFIED  | `events.ts` lines 200–214: null from metaJudge -> evolution_escalated event emitted; REQUIREMENTS.md checkbox is stale — code fully implements |
| EVOL-12     | 07-02, 07-04 | Token budget circuit breaker: halts if cumulative cost exceeds configurable threshold | ✓ SATISFIED  | `budget.ts` aggregates lineage cost; `events.ts` pre-cycle BudgetExceededError -> evolution_halted + evolution_converged |

**All 12 requirements: SATISFIED**

**Note on REQUIREMENTS.md:** EVOL-10 and EVOL-11 show `[ ]` (unchecked) and "Pending" status in `.planning/REQUIREMENTS.md`. This is a stale documentation state — the code fully implements both requirements (confirmed by Plan 03 SUMMARY `requirements-completed: [EVOL-10, EVOL-11]` and the lateral-thinking.ts + events.ts implementations). REQUIREMENTS.md should be updated to mark these complete.

---

### Anti-Patterns Found

| File                              | Line | Pattern       | Severity | Impact                                                                                    |
|-----------------------------------|------|---------------|----------|-------------------------------------------------------------------------------------------|
| `evolution/lateral-thinking.ts`   | 151  | `return null` | ℹ️ Info   | Intentional escalation signal per D-16 ("returns null when no viable proposal exists"). Not a stub — FSM in events.ts explicitly checks for null and triggers human escalation. |

No blockers or warnings found.

---

### Human Verification Required

None of the automated checks identified items requiring human verification for this phase. The evolution FSM is a backend pipeline with no UI components. However, end-to-end behavior of the full pipeline (evolution cycle triggered by real failed holdout tests, real LLM calls, actual convergence across multiple generations) cannot be tested programmatically and would need a real integration run.

### 1. Full Pipeline Integration Run

**Test:** Trigger an evolution cycle by deploying the stack, running a project through interview + decomposition + execution + holdout failure, then observing whether evolution_started fires and the FSM executes the full cycle.
**Expected:** evolution_started fires, evaluateGoalAttainment produces a score, a new evolved seed is inserted with parentId set, bead.dispatch_requested is emitted with correct tier, and subsequent cycles detect convergence or stagnation.
**Why human:** Requires a running stack with real Inngest, real PostgreSQL, and real LLM API keys. Cannot be tested with unit-level mocks.

---

## Gaps Summary

No gaps. All 9 observable truths are verified, all 12 requirements are satisfied, all key links are wired, and all 76 unit tests pass with clean typecheck and build.

The one documentation discrepancy (EVOL-10/11 showing "Pending" in REQUIREMENTS.md despite being fully implemented) is a stale checkbox issue only — the underlying code is complete. This does not block the phase goal.

---

_Verified: 2026-03-26T18:53:00Z_
_Verifier: Claude (gsd-verifier)_
