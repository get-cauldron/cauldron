---
phase: 10-wire-trpc-mutations-to-engine
verified: 2026-03-27T17:15:00Z
status: passed
score: 4/4 success criteria verified
re_verification: true
  previous_status: gaps_found
  previous_score: 3/4
  gaps_closed:
    - "Integration test demonstrates: answer submitted -> FSM scores -> next question generated"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Full interview flow in browser"
    expected: "Open chat UI, submit answer, verify the scoring runs and a next question appears in the conversation — no error, no stall"
    why_human: "Requires running Next.js + Inngest dev server with valid API keys (OpenAI/Anthropic). Cannot verify programmatically without the full stack up."
---

# Phase 10: Wire tRPC Write Mutations to Engine — Verification Report

**Phase Goal:** tRPC write mutations actually invoke the engine functions they represent — interview advances, holdouts encrypt, decomposition triggers — restoring the write path that Phase 9 refactoring broke.
**Verified:** 2026-03-27T17:15:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (Plan 10-03)

## Goal Achievement

### Observable Truths (Success Criteria from ROADMAP.md)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `interview.sendAnswer` invokes `InterviewFSM.submitAnswer()` — interview advances past first turn | VERIFIED | `interview.ts` line 115: `new InterviewFSM(ctx.db, gateway, config, logger)` + `fsm.submitAnswer(...)` — no DB-only stub remains |
| 2 | `interview.sealHoldouts` calls `sealVault()` — ciphertext/iv/authTag columns populated after sealing | VERIFIED | `interview.ts` lines 438-439: `approveScenarios` + `sealVault` — direct `db.update().set({ status: 'sealed' })` bypass is gone |
| 3 | `execution.triggerDecomposition` invokes `runDecomposition()` with correct Inngest client | VERIFIED | `execution.ts` lines 86-90: `runDecomposition({ db, gateway, inngest: engineInngest, seed, projectId })` — engine Inngest client (id: `cauldron-engine`) confirmed |
| 4 | Integration test demonstrates: answer submitted -> FSM scores -> next question generated | VERIFIED | `packages/engine/src/interview/__tests__/fsm-sendAnswer.integration.test.ts` — 2 test cases with real Postgres + real InterviewFSM (no FSM mock). Commit: 44f170c. Test output: 6/6 passing across 3 integration test files. |

**Score:** 4/4 success criteria verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/web/src/trpc/engine-deps.ts` | Lazy engine dep factory (gateway, config, logger) | VERIFIED | 83 lines; exports `getEngineDeps`, `resetEngineDeps`, `makeConsoleLogger`; module-level caching; `validateKeys: false` |
| `packages/web/src/trpc/init.ts` | Extended tRPC context with `getEngineDeps` | VERIFIED | Line 4: import from `./engine-deps.js`; line 8: `getEngineDeps` in returned context |
| `packages/web/src/trpc/routers/interview.ts` | `sendAnswer` wired to `InterviewFSM`; `sealHoldouts` wired to `sealVault` | VERIFIED | Lines 5, 114-120, 438-439 — all wiring present; old stubs removed |
| `packages/web/src/trpc/routers/execution.ts` | `triggerDecomposition` wired to `runDecomposition` | VERIFIED | Lines 6, 67, 86-90 — engine Inngest client aliased as `engineInngest` |
| `packages/web/src/trpc/routers/__tests__/interview-engine.test.ts` | Unit tests for sendAnswer FSM wiring | VERIFIED | 5 test cases covering constructor args, response shape, phase transition, error paths |
| `packages/web/src/trpc/routers/__tests__/seal-decompose-engine.test.ts` | Unit tests for sealHoldouts + triggerDecomposition | VERIFIED | 9 test cases (5 seal + 4 decompose) |
| `packages/engine/src/interview/__tests__/fsm-sendAnswer.integration.test.ts` | DB-backed integration test for InterviewFSM.submitAnswer | VERIFIED | 215 lines; 2 test cases; real Postgres DB; real InterviewFSM; mock gateway only; asserts TurnResult shape + DB state change |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `interview.ts` | `@cauldron/engine InterviewFSM` | `import { InterviewFSM }` + `new InterviewFSM(ctx.db, gateway, config, logger)` | WIRED | Line 5 import; line 115 instantiation; line 116 `fsm.submitAnswer()` call |
| `init.ts` | `engine-deps.ts` | `import { getEngineDeps }` in context factory | WIRED | Line 4 import; line 8 included in returned context object |
| `interview.ts` | `@cauldron/engine approveScenarios + sealVault` | `import { approveScenarios, sealVault }` + calls in `sealHoldouts` | WIRED | Line 5 import; lines 438-439 call both functions per entry |
| `execution.ts` | `@cauldron/engine runDecomposition` | `import { runDecomposition }` + call in `triggerDecomposition` | WIRED | Line 6 import; lines 86-90 call with full options |
| `execution.ts` | `@cauldron/engine inngest` (cauldron-engine client) | `import { inngest as engineInngest }` + passed to `runDecomposition` | WIRED | Line 6 import alias; line 89 `inngest: engineInngest` |
| `fsm-sendAnswer.integration.test.ts` | `packages/engine/src/interview/fsm.ts` | `new InterviewFSM(testDb.db, mockGateway, mockConfig, mockLogger)` | WIRED | Line 16 import; lines 140-145 instantiation; lines 147-149 `fsm.submitAnswer()` call |
| `fsm-sendAnswer.integration.test.ts` | `packages/engine/src/__tests__/setup.ts` | `createTestDb, runMigrations, truncateAll` | WIRED | Line 14 import from `../../__tests__/setup.js`; used in `beforeAll`, `afterEach`, `afterAll` |

### Data-Flow Trace (Level 4)

These mutations are write-path procedures that delegate to engine functions — they do not render dynamic data, so Level 4 (data-flow to rendering) is not applicable. The relevant trace is that each mutation's result comes from the engine function it invokes, not a hardcoded value.

| Mutation | Engine Function | Returns Engine Output | Status |
|----------|----------------|----------------------|--------|
| `sendAnswer` | `fsm.submitAnswer()` | `result.turn`, `result.scores`, `result.nextQuestion`, `result.thresholdMet` | FLOWING — all return fields come directly from `TurnResult` |
| `sealHoldouts` | `approveScenarios()` + `sealVault()` | `{ seedId, sealedCount }` | FLOWING — `sealedCount` is count of approved entries iterated |
| `triggerDecomposition` | `runDecomposition()` | `{ success: true, message }` | FLOWING — synchronous call; static success message is intentional |

The integration test (Plan 10-03) now provides direct evidence for `sendAnswer` data flow: the test passes a real answer to a real DB interview row, receives a real `TurnResult` from `InterviewFSM.submitAnswer`, and asserts that `result.scores.goalClarity`, `result.nextQuestion`, `result.turn.turnNumber`, and `result.thresholdMet` are all populated from the FSM — not hardcoded.

### Behavioral Spot-Checks

| Behavior | Check | Result | Status |
|----------|-------|--------|--------|
| `packages/web` TypeScript compiles | `pnpm --filter @cauldron/web exec tsc --noEmit` | exit 0, no output | PASS |
| `packages/engine` TypeScript compiles | `pnpm --filter @cauldron/engine exec tsc --noEmit` | exit 0, no output | PASS |
| Integration test file matches include pattern | filename ends in `.integration.test.ts`; config: `src/**/*.integration.test.ts` | pattern matches | PASS |
| Integration test uses real FSM (not mocked) | `grep -c "new InterviewFSM" fsm-sendAnswer.integration.test.ts` | 2 | PASS |
| Integration test uses real DB (not mocked) | `grep -c "vi.mock.*@cauldron/shared" fsm-sendAnswer.integration.test.ts` | 0 | PASS |
| Integration test asserts DB state | `grep -c "turnCount" fsm-sendAnswer.integration.test.ts` | 4 | PASS |
| Commit 44f170c exists | `git log --oneline -5` | 44f170c present | PASS |

Live integration test run (from SUMMARY 10-03): `Test Files 3 passed (3), Tests 6 passed (6)` — 2 new tests (this plan) + 4 from existing integration test files.

### Requirements Coverage

All 15 requirement IDs from plan frontmatters are cross-referenced below. No orphaned requirements detected.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INTV-01 | 10-01 | Interview begins with multi-perspective panel question generation | SATISFIED | `InterviewFSM.submitAnswer()` runs perspective panel; wired in `sendAnswer`; integration test exercises this path with 3 perspective calls |
| INTV-02 | 10-01 | MC answer suggestions generated per question | SATISFIED | `TurnResult.nextQuestion.mcOptions` returned in `sendAnswer` response; integration test asserts `mcOptions` is a non-empty array |
| INTV-03 | 10-01 | Ambiguity scoring computed after each response | SATISFIED | `TurnResult.scores` (AmbiguityScores) returned from FSM; integration test asserts all score fields are numbers |
| INTV-04 | 10-01 | Interview continues until ambiguity score <= 0.2 (>= 80% clarity) | SATISFIED | `TurnResult.thresholdMet` drives `phase` transition in sendAnswer; integration test case 2 proves phase transitions to `reviewing` when threshold met |
| INTV-05 | 10-01 | Brownfield variant with adjusted weights | SATISFIED | `InterviewFSM` handles brownfield mode internally; wiring is mode-agnostic |
| INTV-06 | 10-01 | Structured summary presented for review before crystallization | SATISFIED | `getSummary` + `approveSummary` procedures exist in `interview.ts`; FSM path for real content is restored |
| INTV-07 | 10-01 | User approves summary before seed generation | SATISFIED | `approveSummary` mutation guards on `phase === 'reviewing'` and inserts seed |
| HOLD-03 | 10-02 | Approved holdout tests encrypted at rest using AES-256-GCM | SATISFIED | `sealVault()` from engine executes AES-256-GCM encryption; direct DB status bypass removed |
| HOLD-04 | 10-02 | Encryption key stored in env var inaccessible to agent processes | SATISFIED | `sealVault()` uses `HOLDOUT_ENCRYPTION_KEY` env var internally; tRPC mutation passes no key |
| HOLD-05 | 10-02 | Holdout tests remain sealed during execution/evolution cycles | SATISFIED | `sealHoldouts` calls engine crypto layer; sealed vault rows get ciphertext/iv/authTag columns |
| DAG-01 | 10-02 | Seed acceptance criteria decomposed into molecules and beads | SATISFIED | `runDecomposition()` executes the two-pass LLM decomposer pipeline; called from `triggerDecomposition` |
| DAG-02 | 10-02 | Each bead sized to fit one context window (~200k tokens) | SATISFIED | `runDecomposition()` includes size validation via `validateBeadSizes` at decomposition time |
| DAG-03 | 10-02 | Bead size validated at decomposition time | SATISFIED | `runDecomposition()` calls `validateDAG()` which includes size checks |
| DAG-04 | 10-02 | Four dependency types supported | SATISFIED | Decomposition pipeline and DAG schema support all dependency types |
| DAG-05 | 10-02 | Parallel-by-default execution | SATISFIED | `runDecomposition()` calls Inngest dispatch which enables concurrent bead execution |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `packages/web/src/trpc/routers/execution.ts` | `triggerExecution` mutation (line 98-111) is still a DB-only event append with no engine call | Info | Out of scope for Phase 10; not listed in the phase goal. Not a blocker. |

No placeholders, TODO comments, or stub returns found in Phase 10 files. Integration test does not mock the DB or the InterviewFSM class.

### Human Verification Required

#### 1. Full Interview Flow in Browser

**Test:** Start dev environment (`docker compose up`, `pnpm dev`, `pnpm inngest:dev`). Open the web dashboard, create a project, navigate to the interview chat UI. Submit an answer to the first question.
**Expected:** The LLM scoring runs, a TurnResult is returned, and the next question appears in the chat. No error toast, no stall on the loading state.
**Why human:** Requires running Next.js + Inngest dev server with valid API keys (OpenAI/Anthropic). Cannot verify programmatically without the full stack up.

---

## Re-verification Summary

**Previous status:** gaps_found (3/4 criteria)
**Current status:** passed (4/4 criteria)

**Gap closed:** The single failing criterion — "Integration test demonstrates: answer submitted -> FSM scores -> next question generated" — is now satisfied by `packages/engine/src/interview/__tests__/fsm-sendAnswer.integration.test.ts` (commit 44f170c).

The integration test satisfies all acceptance criteria from Plan 10-03:
- File exists at the correct path with the `.integration.test.ts` suffix matching `vitest.integration.config.ts` include pattern
- Contains `new InterviewFSM` (count: 2) — real FSM, not mocked
- Contains `createTestDb` (count: 3) — real DB setup from `packages/engine/src/__tests__/setup.ts`
- Does NOT contain `vi.mock('@cauldron/shared')` (count: 0) — no DB mock
- Asserts DB state change: `turnCount`, `currentAmbiguityScore`, `transcript` length
- Asserts TurnResult shape: `turn.turnNumber`, `scores`, `nextQuestion`, `thresholdMet`
- Two test cases: normal flow (threshold not met, nextQuestion returned) and high-score flow (threshold met, phase transitions to `reviewing`)
- SUMMARY 10-03 reports: 6/6 integration tests passing across 3 files

**No regressions detected:** Both `@cauldron/web` and `@cauldron/engine` typecheck clean after Plan 10-03.

**Remaining human-only item:** Full browser flow test (unchanged from initial verification — this is expected and not a gap).

---

_Verified: 2026-03-27T17:15:00Z_
_Verifier: Claude (gsd-verifier)_
