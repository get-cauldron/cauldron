---
phase: 05-dag-decomposition-scheduler
plan: 01
subsystem: database
tags: [drizzle, postgres, migration, dag, decomposition, typescript]

# Dependency graph
requires:
  - phase: 04-holdout-vault
    provides: Migration 0004 format (breakpoint-style ALTER TYPE outside transactions)
  - phase: 03-interview-seed-pipeline
    provides: eventTypeEnum, beads table schema, seeds table, gateway PipelineStage type
  - phase: 02-llm-gateway
    provides: GatewayConfig, PipelineStage type, cauldron.config.ts structure
provides:
  - Migration 0005 adding version column (optimistic concurrency) and covers_criteria JSONB to beads
  - Decomposition lifecycle event types in eventTypeEnum
  - Performance indexes for ready-bead queries (beads_status_seed_idx, bead_edges_to_bead_idx)
  - PipelineStage union extended with 'decomposition'
  - decomposition STAGE_PREAMBLES entry in gateway
  - cauldron.config.ts decomposition model assignment
  - All decomposition domain types: MoleculeSpec, BeadSpec, DecompositionResult, DecompositionOptions, DAGValidationError, ClaimResult, BeadDispatchPayload, BeadCompletedPayload
affects:
  - 05-02 (decomposition agent uses these types directly)
  - 05-03 (DAG scheduler uses BeadSpec edges, ClaimResult, version column)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ALTER TYPE ADD VALUE breakpoint-style migration (outside transaction block)"
    - "Drizzle jsonb().$type<T>() for typed JSONB columns with TypeScript generics"
    - "PipelineStage as the single source of truth for gateway routing — adding a stage requires types.ts + STAGE_PREAMBLES + cauldron.config.ts + any test fixtures"

key-files:
  created:
    - packages/shared/src/db/migrations/0005_dag_decomposition.sql
    - packages/engine/src/decomposition/types.ts
    - packages/engine/src/decomposition/index.ts
  modified:
    - packages/shared/src/db/schema/bead.ts
    - packages/shared/src/db/schema/event.ts
    - packages/shared/src/db/schema/project.ts
    - packages/engine/src/gateway/types.ts
    - packages/engine/src/gateway/gateway.ts
    - packages/engine/src/index.ts
    - cauldron.config.ts
    - packages/engine/src/gateway/__tests__/gateway.test.ts

key-decisions:
  - "decomposition stage model assignment follows D-02: strong reasoning models claude-sonnet-4-6 and gpt-4.1"
  - "PipelineStage extended to 'decomposition' — GatewayConfig.models Record<PipelineStage, string[]> now requires all 5 stages including decomposition"
  - "coversCriteria stored as JSONB string[] (AC ID references) to support coverage gap validation in Plan 02"
  - "version column defaults to 1 (not 0) — first increment yields version 2, making unversioned rows identifiable"

patterns-established:
  - "Adding a PipelineStage: update types.ts union + STAGE_PREAMBLES in gateway.ts + cauldron.config.ts models record + all test fixtures using Record<PipelineStage, string[]>"

requirements-completed: [DAG-02, DAG-04, DAG-08, DAG-09]

# Metrics
duration: 3min
completed: 2026-03-26
---

# Phase 5 Plan 1: DAG Decomposition — Schema, Types, and Gateway Config

**PostgreSQL migration 0005 with optimistic concurrency (version) and AC mapping (covers_criteria) columns, decomposition event types, ready-bead indexes, PipelineStage extended to 'decomposition', and all domain types for the decomposition module exported from @cauldron/engine**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-26T14:19:23Z
- **Completed:** 2026-03-26T14:22:12Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Created migration 0005 adding `version` (integer, optimistic concurrency per DAG-08) and `covers_criteria` (JSONB string[], acceptance criteria mapping per DAG-09) columns to beads table with 5 new event types and 2 performance indexes
- Extended PipelineStage union to include `'decomposition'` across types.ts, STAGE_PREAMBLES, and cauldron.config.ts; both shared and engine packages typecheck cleanly
- Defined and exported all decomposition domain types (MoleculeSpec, BeadSpec, DecompositionResult, DecompositionOptions, DAGValidationError, ClaimResult, BeadDispatchPayload, BeadCompletedPayload) from @cauldron/engine

## Task Commits

1. **Task 1: Schema migration and Drizzle updates** - `6c260ab` (feat)
2. **Task 2: Gateway extension, domain types, and config update** - `d3535c3` (feat)

## Files Created/Modified

- `packages/shared/src/db/migrations/0005_dag_decomposition.sql` - Migration with ALTER TYPE, ALTER TABLE for version + covers_criteria, and CREATE INDEX for performance
- `packages/shared/src/db/schema/bead.ts` - Added `version` integer and `coversCriteria` jsonb columns; added `jsonb` to drizzle imports
- `packages/shared/src/db/schema/event.ts` - Added decomposition_started, decomposition_completed, decomposition_failed, bead_dispatched, bead_skipped to eventTypeEnum
- `packages/shared/src/db/schema/project.ts` - Extended ProjectSettings models union with 'decomposition'; added maxConcurrentBeads field
- `packages/engine/src/gateway/types.ts` - PipelineStage union extended with 'decomposition'
- `packages/engine/src/gateway/gateway.ts` - decomposition entry added to STAGE_PREAMBLES
- `packages/engine/src/decomposition/types.ts` - All decomposition domain type interfaces
- `packages/engine/src/decomposition/index.ts` - Re-exports all domain types
- `packages/engine/src/index.ts` - Exports decomposition module
- `cauldron.config.ts` - decomposition model assignment: ['claude-sonnet-4-6', 'gpt-4.1']
- `packages/engine/src/gateway/__tests__/gateway.test.ts` - testConfig updated with decomposition key (auto-fix)

## Decisions Made

- Decomposition stage assigned to strong reasoning models (claude-sonnet-4-6, gpt-4.1) per D-02 — decomposition quality is critical path
- `version` defaults to 1 (not 0): first optimistic-concurrency increment goes to 2, making any accidentally unversioned rows identifiable
- `coversCriteria` stored as JSONB `string[]` (acceptance criterion ID references), not direct bead IDs — Plans 02/03 populate and validate coverage

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated gateway.test.ts testConfig to include decomposition key**
- **Found during:** Task 2 (gateway types extension)
- **Issue:** Extending PipelineStage made `Record<PipelineStage, string[]>` require a `decomposition` key. The test fixture `testConfig` defined only 4 stages and TypeScript TS2741 error blocked compilation.
- **Fix:** Added `decomposition: ['claude-sonnet-4-6', 'gpt-4.1']` to testConfig in gateway.test.ts
- **Files modified:** `packages/engine/src/gateway/__tests__/gateway.test.ts`
- **Verification:** `pnpm --filter @cauldron/engine exec tsc --noEmit` exits 0
- **Committed in:** d3535c3 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Necessary side-effect of extending PipelineStage. No scope creep.

## Issues Encountered

None - both packages compiled cleanly after auto-fix.

## User Setup Required

None - no external service configuration required. Migration 0005 will apply via `drizzle-kit migrate` when running against the dev database.

## Next Phase Readiness

- Plan 02 (decomposition agent): MoleculeSpec, BeadSpec, DecompositionResult types ready for structured output schema; GatewayConfig decomposition stage ready for model routing
- Plan 03 (DAG scheduler): version column and covers_criteria schema in place; BeadDispatchPayload and ClaimResult types defined for Inngest event coordination
- Both packages pass `tsc --noEmit` — no type drift to resolve

---
*Phase: 05-dag-decomposition-scheduler*
*Completed: 2026-03-26*
