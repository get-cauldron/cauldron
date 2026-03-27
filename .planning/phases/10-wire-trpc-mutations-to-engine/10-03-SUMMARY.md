---
phase: 10-wire-trpc-mutations-to-engine
plan: "03"
subsystem: engine/interview
tags: [integration-test, interview-fsm, real-db, gap-closure]
dependency_graph:
  requires: ["10-01", "10-02"]
  provides: ["fsm-sendAnswer-integration-test"]
  affects: ["packages/engine"]
tech_stack:
  added: []
  patterns: ["real-db integration test", "mock LLM gateway with call-sequence stubs"]
key_files:
  created:
    - packages/engine/src/interview/__tests__/fsm-sendAnswer.integration.test.ts
  modified: []
key_decisions:
  - "Mock gateway uses mockResolvedValueOnce call-sequence ordering (1 scorer + 3 perspectives + 1 ranker = 5 calls) rather than prompt inspection — simpler and sufficient for the fixed call sequence"
  - "GatewayConfig mock requires all 7 PipelineStage keys (including context_assembly and conflict_resolution) — Record<PipelineStage, string[]> is a strict type"
metrics:
  duration: "5min"
  completed: "2026-03-27T16:53:36Z"
  tasks_completed: 1
  files_changed: 1
---

# Phase 10 Plan 03: FSM SendAnswer Integration Test Summary

DB-backed integration test proving InterviewFSM.submitAnswer path end-to-end: answer submitted to real Postgres interview row, FSM scores via mocked LLM gateway, next question returned as TurnResult, DB state updated.

## What Was Built

Single integration test file `packages/engine/src/interview/__tests__/fsm-sendAnswer.integration.test.ts` with two test cases:

1. **"inserts turn and returns TurnResult with nextQuestion when threshold not met"** — submits an answer with mocked scores at 0.5 overall (below 0.8 threshold). Asserts: `turn.turnNumber === 1`, `scores` shape correct, `nextQuestion` not null, `thresholdMet === false`. Also asserts DB: `turnCount === 1`, `currentAmbiguityScore` populated, `transcript` length 1.

2. **"transitions interview to reviewing phase when clarity threshold is met"** — submits with mocked scores at 0.9 overall (above 0.8 threshold). Asserts: `thresholdMet === true`, `nextQuestion === null`. Also asserts DB: `phase === 'reviewing'`, `turnCount === 1`.

## Test Architecture

- **Real DB**: `createTestDb` / `runMigrations` / `truncateAll` from `packages/engine/src/__tests__/setup.ts` (engine's own setup utility that sets `DATABASE_URL` before any `@cauldron/shared` import)
- **Real FSM**: `new InterviewFSM(testDb.db, mockGateway, mockConfig, mockLogger)` — no class mock
- **Mock gateway**: `vi.fn()` with `mockResolvedValueOnce` for the expected 5-call sequence: 1 scorer + 3 perspective (researcher/simplifier/breadth-keeper for turn 0) + 1 ranker
- **Mock responses**: Vercel AI SDK `{ object: ... }` shape, matching how scorer/perspectives/ranker destructure the response

## Deviations from Plan

**1. [Rule 1 - Bug] GatewayConfig requires all 7 PipelineStage keys**
- **Found during:** Task 1 typecheck
- **Issue:** Initial mock only provided 5 keys; `Record<PipelineStage, string[]>` requires all 7 including `context_assembly` and `conflict_resolution`
- **Fix:** Added the two missing stage keys to the mock config
- **Files modified:** `packages/engine/src/interview/__tests__/fsm-sendAnswer.integration.test.ts`
- **Commit:** 44f170c (same commit as the file creation)

## Verification

```
Test Files  3 passed (3)
      Tests  6 passed (6)
```

The 6 tests are: 2 new (this plan) + 2 from concurrent-claim.integration.test.ts + 2 from key-isolation.integration.test.ts.

Typecheck: `pnpm --filter @cauldron/engine exec tsc --noEmit` — passed with no errors.

## Known Stubs

None. The integration test makes real DB assertions.

## Self-Check: PASSED

- File exists: `packages/engine/src/interview/__tests__/fsm-sendAnswer.integration.test.ts` — FOUND
- Commit exists: `44f170c` — FOUND
