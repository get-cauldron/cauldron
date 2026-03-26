---
phase: 05-dag-decomposition-scheduler
plan: "02"
subsystem: engine/decomposition
tags: [dag, validation, kahn-algorithm, decomposition, llm, two-pass, retry]
dependency_graph:
  requires: ["05-01"]
  provides: ["decomposer.ts", "validator.ts", "decomposition exports"]
  affects: ["05-03"]
tech_stack:
  added: []
  patterns: ["Kahn's topological sort for cycle detection", "two-pass LLM structured output with Zod", "error-type-specific retry prompts"]
key_files:
  created:
    - packages/engine/src/decomposition/validator.ts
    - packages/engine/src/decomposition/decomposer.ts
    - packages/engine/src/decomposition/__tests__/validator.test.ts
    - packages/engine/src/decomposition/__tests__/decomposer.test.ts
  modified:
    - packages/engine/src/decomposition/index.ts
decisions:
  - "Kahn's BFS over DFS for cycle detection — BFS naturally identifies all cycle participants via remaining in-degree > 0 after full traversal"
  - "parent_child edges excluded from cycle detection — they track molecule hierarchy, not scheduling order; including them would incorrectly flag hierarchical containment as cycles"
  - "validateDAG priority order: cycle > oversized_bead > coverage_gap — structural validity first, then context budget, then spec completeness"
  - "Pass 1 molecules flow into Pass 2 prompt — LLM has full molecule context when generating atomic beads, ensuring moleculeId consistency"
  - "Error-type-specific retry instructions rather than generic retry — oversized bead retry explicitly instructs split with sub-bead guidance per D-07"
metrics:
  duration: "5min"
  completed_date: "2026-03-26"
  tasks: 2
  files: 5
---

# Phase 05 Plan 02: DAG Validator and Two-Pass Decomposer Summary

**One-liner:** Kahn's cycle detection + size/coverage validation, plus two-pass LLM decomposition with Zod schemas and error-type-specific auto-retry up to 3 attempts.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | DAG validator — Kahn's cycle detection, size validation, coverage check | 87437f9 | validator.ts, validator.test.ts, index.ts |
| 2 | Two-pass LLM decomposition agent with auto-retry | e60a51e | decomposer.ts, decomposer.test.ts, index.ts |

## What Was Built

### validator.ts

Four exported functions implementing DAG correctness checks:

- **`detectCycle`** — Kahn's BFS topological sort. Filters to scheduling edges only (`blocks`, `waits_for`, `conditional_blocks`), explicitly excludes `parent_child` edges. Returns array of cycle participant bead IDs or `null`.

- **`validateBeadSizes`** — Checks all beads against a token budget (default 200,000). Returns array of oversized beads with their token counts.

- **`validateCoverage`** — Collects all covered criteria across all bead `coversCriteria` arrays into a Set. Returns any acceptance criterion IDs not in the Set.

- **`validateDAG`** — Orchestrates all three checks in priority order: cycle detection first (structural invalidity), then oversized beads (context budget), then coverage gaps (spec completeness). Returns the first error found or `null`.

### decomposer.ts

`decomposeSeed` function implementing the two-pass decomposition pipeline:

- **Pass 1:** Calls `gateway.generateObject` with `MoleculeOutputSchema` (Zod) to produce logical molecule groupings covering all acceptance criteria.

- **Pass 2 (retry loop):** Calls `gateway.generateObject` with `DecompositionOutputSchema` (Zod, `coversCriteria.min(1)` enforced) to produce atomic beads. On validation failure, appends error-type-specific retry instructions:
  - `oversized_bead`: Explicit split directive — "Split each oversized bead into 2-3 smaller sub-beads... Redistribute the original bead's coversCriteria across the sub-beads so no criteria are lost." (per D-07)
  - `cycle`: Edge removal directive with cycle participant IDs
  - `coverage_gap`: Criteria mapping directive with uncovered AC IDs

- Throws with last error message after `maxRetries` exhausted.

### Tests

- 15 unit tests in `validator.test.ts` covering all edge cases: linear DAG, diamond DAG, A→B→C→A cycle, parent_child exclusion, waits_for/conditional_blocks inclusion, disconnected components, size thresholds, custom budgets, coverage gaps, validateDAG priority ordering.

- 10 unit tests in `decomposer.test.ts` with mocked gateway: two-pass call count, stage usage, seed data in prompt, result shape, cycle retry, oversized bead retry with split instruction, coverage gap retry, maxRetries exhaustion, estimatedTokens presence, non-empty coversCriteria.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. Both modules are fully implemented with no placeholder data.

## Self-Check: PASSED

- `packages/engine/src/decomposition/validator.ts` — EXISTS
- `packages/engine/src/decomposition/decomposer.ts` — EXISTS
- `packages/engine/src/decomposition/__tests__/validator.test.ts` — EXISTS (15 tests)
- `packages/engine/src/decomposition/__tests__/decomposer.test.ts` — EXISTS (10 tests)
- Commit `87437f9` — validator module
- Commit `e60a51e` — decomposer module
- All 25 tests pass, `tsc --noEmit` exits 0
