---
phase: 15-wire-holdout-generation-fix-cli-run
plan: 01
subsystem: api
tags: [holdout, vault, crystallize, cli, trpc, engine]

# Dependency graph
requires:
  - phase: 14-wire-interview-start-fix-seed-crystallization-path
    provides: crystallizeSeed routed through event store and immutability guard
  - phase: 04-holdout-vault
    provides: generateHoldoutScenarios and createVault engine functions
  - phase: 09-cli
    provides: crystallize.ts and run.ts CLI commands
provides:
  - Holdout scenario generation wired into approveSummary tRPC mutation
  - Vault populated after crystallization via createVault
  - crystallizeCommand returns seedId on success
  - runCommand propagates seedId from crystallize to seal stage
affects: [16-wire-decompose-execute-pipeline, testing, e2e]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Separate try/catch for non-critical post-crystallization side effects (holdout generation) so mutation success is not gated on optional work"
    - "CLI pipeline commands propagate state via return values, not shared mutable scope outside the function"

key-files:
  created: []
  modified:
    - packages/web/src/trpc/routers/interview.ts
    - packages/cli/src/commands/crystallize.ts
    - packages/cli/src/commands/run.ts

key-decisions:
  - "Holdout generation failure is caught and logged separately from ImmutableSeedError — seed crystallization must not be rolled back due to LLM/budget errors in holdout generation"
  - "crystallizeCommand return type changed to Promise<{ seedId: string } | undefined> — both JSON and human-readable success paths return seedId"
  - "runCommand Seal stage injects --approve-all automatically — pipeline mode is non-interactive"
  - "Guard in Seal stage throws clear error if seedId is missing — prevents silent failure when crystallize did not run"

patterns-established:
  - "Non-blocking post-mutation side effects: wrap in separate try/catch, log on error, do not re-throw"
  - "CLI pipeline stages communicate via captured return values from preceding stage commands"

requirements-completed: [HOLD-01, HOLD-02, HOLD-03, HOLD-05, LLM-06, WEB-05, CLI-01]

# Metrics
duration: 10min
completed: 2026-03-27
---

# Phase 15 Plan 01: Wire Holdout Generation and Fix CLI Run Summary

**Holdout vault wired into approveSummary mutation via generateHoldoutScenarios/createVault, and cauldron run seedId propagated from crystallize to seal stage via --seed-id injection**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-27T21:05:00Z
- **Completed:** 2026-03-27T21:15:08Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- approveSummary tRPC mutation now calls generateHoldoutScenarios after crystallizeSeed succeeds, then persists scenarios via createVault — vault is always populated after crystallization
- Holdout generation failure is isolated in its own try/catch so LLM/budget errors don't break the mutation; seed remains crystallized and seedId is returned
- crystallizeCommand return type changed from void to `Promise<{ seedId: string } | undefined>` — both success paths (JSON and human-readable) return seedId
- runCommand Crystallize stage captures the returned seedId; Seal stage injects `--seed-id <id> --approve-all` into sealCommand args
- Guard throws "No seedId from crystallize stage — cannot seal" before seal stage runs if seedId is missing

## Task Commits

1. **Task 1: Wire holdout generation into approveSummary tRPC mutation** - `64642fa` (feat)
2. **Task 2: Fix crystallize return type and runCommand seedId propagation** - `5b4f271` (feat)

## Files Created/Modified

- `packages/web/src/trpc/routers/interview.ts` - Added generateHoldoutScenarios and createVault imports and calls inside approveSummary, with isolated try/catch for holdout errors
- `packages/cli/src/commands/crystallize.ts` - Changed return type to `Promise<{ seedId: string } | undefined>`, added return statements in both success paths
- `packages/cli/src/commands/run.ts` - Added `let seedId`, captures from crystallizeCommand result, injects `--seed-id` and `--approve-all` into sealCommand args, guards against missing seedId

## Decisions Made

- Holdout generation failure is wrapped in a separate try/catch from ImmutableSeedError — the seed is already crystallized when holdout generation runs, so a generator failure (LLM timeout, budget exceeded, model error) should not invalidate the crystallization. The user can retry sealing separately.
- `--approve-all` is auto-injected by runCommand because the pipeline is non-interactive. Manual scenario approval is only for the `cauldron seal` command used standalone.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

Pre-existing build failure in `/api/events/[projectId]` route (unrelated to this plan's changes). Confirmed pre-existing via git stash test. Does not affect unit tests or typecheck. Documented as out-of-scope per deviation rules scope boundary.

## Known Stubs

None — all wiring connects real engine functions to real DB and real gateway.

## Next Phase Readiness

- Vault will now be populated after crystallization — getHoldouts will return non-empty scenarios
- sealHoldouts should succeed when called after approveSummary
- cauldron run pipeline no longer exits at seal stage with "Error: --seed-id is required"
- Phase 16 can proceed to wire decompose/execute pipeline stages

---
*Phase: 15-wire-holdout-generation-fix-cli-run*
*Completed: 2026-03-27*
