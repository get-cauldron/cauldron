---
phase: 09-cli
plan: 02
subsystem: cli
tags: [trpc, cli, commands, hono, chalk, ora, cli-table3]

# Dependency graph
requires:
  - phase: 09-cli-01
    provides: createCLIClient, CLIConfig, isServerRunning, startDevServer, output.ts utilities
  - phase: 08-web-dashboard
    provides: tRPC routers (projects, costs, evolution, interview, execution)

provides:
  - Refactored cli.ts with tRPC client bootstrap (server auto-start, API key provisioning)
  - 5 new commands: projects (list/create/archive), costs (3 tables), evolution (lineage + events), run (pipeline), [logs alias]
  - 8 existing commands refactored to tRPC client: interview, crystallize, seal, decompose, execute, status, kill, resolve
  - execution router extended with triggerDecomposition and triggerExecution mutations
  - execution_started event type added to eventTypeEnum (migration 0010)
  - Zero @cauldron/engine imports in any command file
  - All commands support --json flag and --project ID flag

affects:
  - phase: 09-cli-03
  - phase: 09-cli-04
  - dashboard (execution router extended)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "All CLI commands accept (client: CLIClient, args: string[], flags: { json: boolean; projectId?: string }) signature"
    - "Commands use tRPC client exclusively — zero direct DB or engine imports"
    - "Spinner from output.ts wraps all async tRPC calls for UX feedback"
    - "--json flag always outputs formatJson(result) before any human-readable output"
    - "triggerDecomposition/triggerExecution mutations emit events for Inngest async processing"

key-files:
  created:
    - packages/api/src/commands/projects.ts
    - packages/api/src/commands/costs.ts
    - packages/api/src/commands/evolution.ts
    - packages/api/src/commands/run.ts
    - packages/api/src/commands/projects.test.ts
    - packages/shared/src/db/migrations/0010_execution_started_event.sql
  modified:
    - packages/api/src/cli.ts
    - packages/api/src/commands/interview.ts
    - packages/api/src/commands/crystallize.ts
    - packages/api/src/commands/seal.ts
    - packages/api/src/commands/decompose.ts
    - packages/api/src/commands/execute.ts
    - packages/api/src/commands/status.ts
    - packages/api/src/commands/kill.ts
    - packages/api/src/commands/resolve.ts
    - packages/web/src/trpc/routers/execution.ts
    - packages/shared/src/db/schema/event.ts

key-decisions:
  - "triggerDecomposition reuses existing decomposition_started event type; triggerExecution adds new execution_started event type (migration 0010)"
  - "All commands use (client, args, flags) signature — flags.projectId takes precedence over env CAULDRON_PROJECT_ID"
  - "run.ts delegates to individual command functions to avoid logic duplication"
  - "decompose/execute use triggerDecomposition/triggerExecution mutations (async Inngest dispatch) — no engine-direct fallback per must_have constraint"
  - "interview.ts uses getTranscript polling loop instead of readline/FSM directly — respects tRPC-only constraint"

requirements-completed:
  - CLI-01
  - CLI-03

# Metrics
duration: 10min
completed: 2026-03-27
---

# Phase 09 Plan 02: CLI tRPC Refactor Summary

**Full CLI command layer refactored from engine-direct to tRPC client: 8 existing commands migrated, 5 new commands added (projects/costs/evolution/run/logs), execution router extended with async trigger mutations, zero @cauldron/engine imports in any command file.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-27T14:30:34Z
- **Completed:** 2026-03-27T14:40:48Z
- **Tasks:** 2
- **Files modified:** 22

## Accomplishments
- Rewrote cli.ts to bootstrap tRPC client with server auto-start, API key provisioning, and HZD branding
- Created 5 new commands: projects (list/create/archive), costs (3 breakdown tables), evolution (lineage + history), run (pipeline), logs (alias for status --logs)
- Refactored all 8 existing commands (interview, crystallize, seal, decompose, execute, status, kill, resolve) to use tRPC client exclusively
- Added triggerDecomposition and triggerExecution mutations to execution router with migration 0010 for execution_started event type
- Updated all 7 pre-existing test files to mock tRPC client instead of @cauldron/engine; added 7 new tests in projects.test.ts

## Task Commits

1. **Task 1: Add tRPC mutations for async triggers and refactor cli.ts router with new commands** - `ecdb89b` (feat)
2. **Task 2: Refactor 8 existing commands from engine-direct to tRPC client** - `d795d5d` (refactor)

## Files Created/Modified
- `packages/api/src/cli.ts` - Rewritten: tRPC client bootstrap, 15-command router, HZD banner, global --json/--project flags
- `packages/web/src/trpc/routers/execution.ts` - Added triggerDecomposition and triggerExecution mutations
- `packages/shared/src/db/schema/event.ts` - Added execution_started to eventTypeEnum
- `packages/shared/src/db/migrations/0010_execution_started_event.sql` - Migration for execution_started enum value
- `packages/api/src/commands/projects.ts` - New: list/create/archive via tRPC, colored table
- `packages/api/src/commands/costs.ts` - New: 3 breakdown tables (summary, by model, by stage)
- `packages/api/src/commands/evolution.ts` - New: seed lineage + evolution event timeline
- `packages/api/src/commands/run.ts` - New: sequential pipeline command with stage spinners
- `packages/api/src/commands/projects.test.ts` - New: 7 tests for tRPC client calls and JSON output
- `packages/api/src/commands/interview.ts` - Refactored: getTranscript polling loop via tRPC
- `packages/api/src/commands/crystallize.ts` - Refactored: getSummary/approveSummary via tRPC
- `packages/api/src/commands/seal.ts` - Refactored: getHoldouts/approveHoldout/sealHoldouts via tRPC
- `packages/api/src/commands/decompose.ts` - Refactored: triggerDecomposition mutation
- `packages/api/src/commands/execute.ts` - Refactored: triggerExecution mutation
- `packages/api/src/commands/status.ts` - Refactored: getProjectDAG/getBeadDetail via tRPC
- `packages/api/src/commands/kill.ts` - Refactored: respondToEscalation(abort) via tRPC
- `packages/api/src/commands/resolve.ts` - Refactored: respondToEscalation(action/guidance) via tRPC

## Decisions Made
- triggerDecomposition reuses existing `decomposition_started` event type; triggerExecution needed new `execution_started` type (migration 0010 added)
- run.ts delegates to individual command functions to avoid logic duplication
- decompose/execute use async trigger mutations (Inngest handles actual dispatch) — no engine-direct fallback per plan constraint
- interview.ts polls getTranscript between turns instead of maintaining local FSM state — respects tRPC-only constraint

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] execution_started missing from eventTypeEnum**
- **Found during:** Task 1 (adding triggerExecution mutation)
- **Issue:** execution_started event type needed for triggerExecution mutation but absent from enum
- **Fix:** Added execution_started to eventTypeEnum in schema.ts + migration 0010
- **Files modified:** packages/shared/src/db/schema/event.ts, packages/shared/src/db/migrations/0010_execution_started_event.sql, _journal.json
- **Verification:** Web typecheck passes with new enum value
- **Committed in:** ecdb89b (Task 1 commit)

**2. [Rule 1 - Bug] Pre-existing tests used old engine-direct command signatures**
- **Found during:** Task 2 (typecheck after refactoring)
- **Issue:** 7 test files in src/__tests__/ imported StatusDeps/KillDeps and called commands with 0 arguments — incompatible with new 3-argument tRPC signature
- **Fix:** Rewrote all 7 test files to mock tRPC client using same pattern as new projects.test.ts
- **Files modified:** all 7 files in packages/api/src/__tests__/
- **Verification:** 80 tests pass with zero failures
- **Committed in:** d795d5d (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 missing event type, 1 test signature incompatibility)
**Impact on plan:** Both auto-fixes required for correctness and typecheck. No scope creep.

## Issues Encountered
- TypeScript inferred `summaryResult` as `never` when using `let` + try/catch pattern in interview.ts — resolved by using explicit type annotation `let summaryResult: { summary: unknown; ... } | null = null` with type assertion on assignment

## Self-Check: PASSED

All created files confirmed present. Both task commits (ecdb89b, d795d5d) verified in git log.

## Next Phase Readiness
- All 15 CLI commands are routed through tRPC client
- Zero engine-direct imports in command layer — API boundary is clean
- Execution router ready for 09-03 (webhook + streaming)
- 80 tests passing

---
*Phase: 09-cli*
*Completed: 2026-03-27*
