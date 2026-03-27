---
phase: 07-evolutionary-loop
plan: "01"
subsystem: evolution
tags: [evolution, schema, embeddings, evaluator, mutator, tdd]
dependency_graph:
  requires:
    - "Phase 03: seeds, crystallizeSeed, appendEvent"
    - "Phase 02: LLMGateway, generateObject, writeUsage"
    - "Phase 01: PostgreSQL schema, event store"
  provides:
    - "Migration 0009: seeds.generation, seeds.evolution_context, llm_usage.seed_id, 4 event types"
    - "Evolution domain types: EvolutionState, RubricDimension, GoalAttainmentResult, constants"
    - "Embeddings utilities: cosineSimilarity, jaccardSimilarity, hashGapId, computeEmbedding"
    - "GoalEvaluator: evaluateGoalAttainment, buildRubric"
    - "SeedMutator: mutateSeed, mutateSeedFromProposal"
  affects:
    - "Phase 07-02: convergence detector, lateral thinking engine"
    - "Phase 07-03: full evolution loop orchestrator"
tech_stack:
  added: []
  patterns:
    - "TDD: RED-GREEN for all evolution modules"
    - "LLM-safe Zod schemas (no min/max/int constraints per Phase 6.2 finding)"
    - "Immutable seed evolution via INSERT with parentId (never UPDATE)"
    - "Tiered evolution: score<0.4 => full regen, >=0.4 => AC-only rewrite"
key_files:
  created:
    - packages/engine/src/evolution/types.ts
    - packages/engine/src/evolution/embeddings.ts
    - packages/engine/src/evolution/evaluator.ts
    - packages/engine/src/evolution/mutator.ts
    - packages/engine/src/evolution/__tests__/embeddings.test.ts
    - packages/engine/src/evolution/__tests__/evaluator.test.ts
    - packages/engine/src/evolution/__tests__/mutator.test.ts
    - packages/shared/src/db/migrations/0009_evolutionary_loop.sql
  modified:
    - packages/shared/src/db/schema/seed.ts
    - packages/shared/src/db/schema/llm-usage.ts
    - packages/shared/src/db/schema/event.ts
    - packages/engine/src/gateway/types.ts
    - packages/engine/src/gateway/gateway.ts
    - packages/engine/src/decomposition/__tests__/decomposer.test.ts
    - packages/engine/src/holdout/__tests__/generator.test.ts
decisions:
  - "Tiered mutation thresholds: FULL_REGEN_THRESHOLD=0.4, SUCCESS_THRESHOLD=0.95 per plan spec"
  - "LLM-safe Zod schemas in evaluator/mutator: no min/max/array length constraints per Phase 6.2 finding"
  - "mutateSeedFromProposal bypasses GoalAttainmentResult entirely - lateral thinking produces complete seed"
  - "generation field cast as (seed as Seed & {generation:number}).generation to avoid TypeScript complaint on jsonb inference"
  - "Evaluation diversity enforcement uses same implementerFamily logic as holdout stage"
metrics:
  duration: "18min"
  completed: "2026-03-27"
  tasks_completed: 2
  files_changed: 15
---

# Phase 7 Plan 1: Schema Migration, Evolution Types, Goal Evaluator, Seed Mutator Summary

**One-liner:** AES-256-GCM-inspired immutable seed evolution with weighted rubric scoring, tiered mutation (full regen vs AC-only), and lateral thinking proposal path.

## What Was Built

**Migration 0009** adds `generation INTEGER NOT NULL DEFAULT 0` and `evolution_context JSONB` to the seeds table, `seed_id UUID` to llm_usage for lineage-level budget tracking, and 4 new event types: `evolution_lateral_thinking`, `evolution_escalated`, `evolution_halted`, `evolution_goal_met`.

**Gateway updates:** `GatewayCallOptions.seedId` propagates through `writeUsage` to the `llm_usage` table. Evaluation-stage cross-model diversity enforcement added (same pattern as holdout, per D-03) — evaluator model must be from a different provider family than the implementer.

**Evolution domain types** (`evolution/types.ts`): Complete type system covering 8 FSM states, convergence signal types, terminal reasons, rubric/scoring interfaces, and key constants (SUCCESS_THRESHOLD=0.95, FULL_REGEN_THRESHOLD=0.4, MAX_GENERATIONS=30, STAGNATION_WINDOW=3).

**Embeddings utilities** (`evolution/embeddings.ts`): `cosineSimilarity`, `jaccardSimilarity`, `hashGapId` (SHA-256), and `computeEmbedding` (OpenAI text-embedding-3-large via AI SDK).

**Goal Attainment Evaluator** (`evolution/evaluator.ts`):
- `buildRubric`: parses seed's `evaluationPrinciples` JSONB into weighted rubric dimensions; falls back to default 3-dimension rubric (goal_alignment:40%, completeness:30%, quality:30%) when empty
- `evaluateGoalAttainment`: calls LLM at `evaluation` stage with diversity enforced, computes weighted sum score, generates gap analysis with SHA-256 gapIds, determines tier

**Seed Mutator** (`evolution/mutator.ts`):
- `mutateSeed`: tier-dispatched evolution — `full` regenerates entire seed spec via LLM, `ac_only` rewrites only acceptance criteria keeping goal/constraints intact; both INSERT a new immutable seed row with incremented `generation` and populated `evolutionContext`
- `mutateSeedFromProposal`: lateral thinking path that creates an evolved seed directly from a `LateralThinkingProposal` without requiring a `GoalAttainmentResult`; always treated as `full` tier; records `persona` and `source: lateral_thinking` in event payload

## Test Results

27 evolution unit tests passing (12 embeddings + 5 evaluator + 10 mutator). Full typecheck and build pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing test fixtures missing new schema columns**
- **Found during:** Task 1 typecheck
- **Issue:** `decomposer.test.ts` and `generator.test.ts` had `fakeSeed` objects missing `generation` and `evolutionContext` fields after schema update
- **Fix:** Added `generation: 0, evolutionContext: null` to both test fixtures
- **Files modified:** `packages/engine/src/decomposition/__tests__/decomposer.test.ts`, `packages/engine/src/holdout/__tests__/generator.test.ts`
- **Commit:** 284588f

**2. [Rule 1 - Bug] TypeScript error in mutator test fixtures calling mock chain**
- **Found during:** Task 2 typecheck
- **Issue:** `mockDb.insert().values.mock.calls` triggered TS2348 ("Value of type Mock<Procedure | Constructable> is not callable") because calling the mock again at assertion time confused TS inference
- **Fix:** Extracted `valuesMock` as a separate variable in describe scope, referenced it directly in assertions
- **Files modified:** `packages/engine/src/evolution/__tests__/mutator.test.ts`
- **Commit:** 058da42

## Known Stubs

None. All exports are fully implemented and tested.

## Self-Check: PASSED

Files created:
- `packages/engine/src/evolution/types.ts` — FOUND
- `packages/engine/src/evolution/embeddings.ts` — FOUND
- `packages/engine/src/evolution/evaluator.ts` — FOUND
- `packages/engine/src/evolution/mutator.ts` — FOUND
- `packages/shared/src/db/migrations/0009_evolutionary_loop.sql` — FOUND

Commits:
- edd02e8 — test(07-01): add failing test for embeddings utilities
- 284588f — feat(07-01): DB migration 0009, evolution types, embeddings, gateway seedId + evaluation diversity
- 3a4cfc4 — test(07-01): add failing tests for goal evaluator and seed mutator
- 058da42 — feat(07-01): goal attainment evaluator, seed mutator with lateral thinking support
