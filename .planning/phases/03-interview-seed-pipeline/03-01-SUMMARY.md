---
phase: 03-interview-seed-pipeline
plan: 01
subsystem: database
tags: [drizzle, postgres, interview, schema, migration, trigger, types, gateway]

# Dependency graph
requires:
  - phase: 01-persistence-foundation
    provides: seeds table, projects table, Drizzle schema patterns, migration infrastructure
  - phase: 02-llm-gateway
    provides: GatewayConfig interface, PipelineStage type, cauldron.config.ts defineConfig pattern
provides:
  - interviews table in PostgreSQL with status, mode, transcript JSONB, ambiguity scores history, turn count
  - BEFORE UPDATE trigger enforcing seed immutability once crystallized
  - InterviewTurn, AmbiguityScores, PerspectiveName, SeedSummary, OntologySchema types in @cauldron/engine
  - GatewayConfig extended with optional perspectiveModels and scoringModel fields
  - cauldron.config.ts with per-perspective model assignments and gpt-4o-mini scoring model
affects: [03-interview-seed-pipeline, 04-holdout-vault, 05-dag-scheduler, 06-execution-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Drizzle pgEnum for PostgreSQL enum types with TypeScript union inference
    - Migration SQL manually created with breakpoint markers (--> statement-breakpoint) for Drizzle Kit migrator compatibility
    - BEFORE UPDATE trigger function pattern for immutability enforcement at DB layer
    - Optional config fields on GatewayConfig for progressive feature enablement

key-files:
  created:
    - packages/shared/src/db/schema/interview.ts
    - packages/shared/src/db/migrations/0003_interview_seed_guard.sql
    - packages/engine/src/interview/types.ts
    - packages/engine/src/interview/index.ts
  modified:
    - packages/shared/src/db/schema/seed.ts
    - packages/shared/src/db/schema/index.ts
    - packages/shared/src/types/index.ts
    - packages/shared/src/db/__tests__/setup.ts
    - packages/engine/src/gateway/config.ts
    - packages/engine/src/index.ts
    - cauldron.config.ts
    - packages/shared/src/db/migrations/meta/_journal.json

key-decisions:
  - "Migration created manually (not via db:generate) — parallel execution context has no live DB connection; SQL follows Drizzle Kit format with --> statement-breakpoint markers"
  - "interview.ts exported BEFORE seed.js in schema/index.ts — avoids circular reference since seed.ts imports from interview.ts"
  - "truncateAll order: seeds before interviews — seeds.interviewId FK requires interviews to exist first on restore"
  - "perspectiveModels uses Partial<Record<string, string>> not Partial<Record<PerspectiveName, string>> to keep GatewayConfig in gateway package without engine-layer type leaking back"

patterns-established:
  - "Schema FK circular avoidance: dependent schema files exported before their dependents in index.ts"
  - "Immutability at DB layer: BEFORE UPDATE trigger raises ImmutableSeedError — belt-and-suspenders with app-level guard"
  - "Interview domain types scoped to packages/engine/src/interview/ subdirectory, not mixed with gateway"

requirements-completed: [INTV-01, INTV-05, SEED-02, SEED-03]

# Metrics
duration: 12min
completed: 2026-03-26
---

# Phase 03 Plan 01: Interview & Seed Schema Foundation Summary

**PostgreSQL interviews table with status/mode/transcript/ambiguity-score columns, seed crystallization BEFORE UPDATE trigger, full interview domain type system (InterviewTurn, AmbiguityScores, SeedSummary), and GatewayConfig extended for per-perspective model routing**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-26T02:00:00Z
- **Completed:** 2026-03-26T02:12:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Created interviews table Drizzle schema with all D-01 columns (interviewStatusEnum, interviewModeEnum, transcript/ambiguityScoresHistory JSONB, turnCount, phase text, completedAt)
- Created migration 0003_interview_seed_guard.sql with interviews DDL, FK from seeds.interviewId, project_id index, and seed immutability BEFORE UPDATE trigger
- Added FK reference from seeds.interviewId to interviews.id in Drizzle schema
- Defined all interview domain types: PerspectiveName, InterviewPhase, InterviewMode, InterviewTurn, AmbiguityScores, PerspectiveCandidate, RankedQuestion, SeedSummary, OntologySchema, TurnResult, EarlyCrystallizationWarning, PerspectiveActivation
- Extended GatewayConfig with optional perspectiveModels and scoringModel fields
- Updated cauldron.config.ts with default per-perspective model assignments and gpt-4o-mini scoring model

## Task Commits

Each task was committed atomically:

1. **Task 1: interviews table schema, seed immutability trigger, and migration** - `b46bcd7` (feat)
2. **Task 2: interview domain types, gateway config extension, cauldron.config update** - `d27f517` (feat)

## Files Created/Modified

- `packages/shared/src/db/schema/interview.ts` - interviews pgTable with interviewStatusEnum and interviewModeEnum
- `packages/shared/src/db/schema/seed.ts` - Added FK reference seeds.interviewId -> interviews.id
- `packages/shared/src/db/schema/index.ts` - Added interview.js re-export (before seed.js to avoid circular ref)
- `packages/shared/src/types/index.ts` - Added Interview/NewInterview type exports
- `packages/shared/src/db/__tests__/setup.ts` - Updated truncateAll to include interviews table
- `packages/shared/src/db/migrations/0003_interview_seed_guard.sql` - DDL + seed immutability trigger
- `packages/shared/src/db/migrations/meta/_journal.json` - Added 0003_interview_seed_guard migration entry
- `packages/engine/src/interview/types.ts` - All interview domain types
- `packages/engine/src/interview/index.ts` - Barrel re-export for interview module
- `packages/engine/src/gateway/config.ts` - GatewayConfig extended with perspectiveModels? and scoringModel?
- `packages/engine/src/index.ts` - Added interview module re-export
- `cauldron.config.ts` - Per-perspective model assignments and scoringModel: 'gpt-4o-mini'

## Decisions Made

- Migration created manually rather than via `db:generate` — parallel execution context has no live DB; SQL follows Drizzle Kit breakpoint format
- `interview.ts` exported before `seed.ts` in `schema/index.ts` because `seed.ts` imports from `interview.ts` — avoids circular resolution
- `perspectiveModels` typed as `Partial<Record<string, string>>` not `Partial<Record<PerspectiveName, string>>` — keeps gateway config from leaking engine types; Plans 02/03 can add stricter validation at call sites
- `truncateAll` order: seeds before interviews, because seeds.interviewId is an FK referencing interviews — CASCADE on interviews table would break seeds first

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Data layer contracts established: Plans 02 and 03 can now implement interview orchestration logic against these types and schema
- interviews table DDL ready to apply via migration when Docker Compose DB is available
- All types importable from `@cauldron/engine` at the paths Plans 02/03 expect
- Seed immutability enforced at DB layer via trigger — app-level guard in Plans 02/03 is belt-and-suspenders only

---
*Phase: 03-interview-seed-pipeline*
*Completed: 2026-03-26*
