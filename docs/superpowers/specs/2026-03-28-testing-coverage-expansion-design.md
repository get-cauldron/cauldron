# Testing Coverage Expansion Design

**Date:** 2026-03-28
**Status:** Approved
**Context:** Manual testing revealed the interview phase is impassable — mix of crashes, incorrect behavior, and UI state issues. Existing 95 tests (81 unit, 7 integration, 1 wiring, 6 E2E) haven't caught these bugs because heavy mocking hides integration issues.

## Strategy

**Approach:** Flow-traced wiring tests as the primary bug-finding layer, organized by user journey through the pipeline. Each pipeline stage gets a dedicated wiring test file exercising every tRPC procedure and meaningful state transition. Targeted unit tests backfill where wiring tests reveal complex internal logic.

**Execution order:**
1. Interview flow wiring tests (deep — this is the blocker)
2. Remaining pipeline stage wiring tests (execution, evolution, projects, costs)
3. Targeted unit tests for gateway, decomposition algorithms, scoring

**Infrastructure:** Leverage existing test-harness (`createTestContext`, `createScriptedGateway`, fixtures). Expand with new gateway scripts and fixture factories for downstream stages.

## Test File Structure

### Wiring Tests (tRPC → Engine → DB, mocked LLM)

```
packages/web/src/trpc/routers/__tests__/
  interview.wiring.test.ts        ← EXISTS (expand significantly)
  execution.wiring.test.ts        ← NEW
  evolution.wiring.test.ts        ← NEW
  projects.wiring.test.ts         ← NEW
  costs.wiring.test.ts            ← NEW

packages/engine/src/__tests__/
  interview-fsm.wiring.test.ts    ← NEW (engine-level FSM edge cases)
  decomposition.wiring.test.ts    ← NEW
  holdout.wiring.test.ts          ← NEW
  gateway.wiring.test.ts          ← NEW
```

### Targeted Unit Tests

```
packages/engine/src/gateway/__tests__/
  circuit-breaker.test.ts         ← NEW
  failover.test.ts                ← NEW
  budget.test.ts                  ← NEW

packages/engine/src/decomposition/__tests__/
  validator.test.ts               ← EXISTS (expand)
  scheduler.test.ts               ← EXISTS (expand)

packages/engine/src/interview/__tests__/
  scorer.test.ts                  ← EXISTS (expand)
```

### Test-Harness Additions

```
packages/test-harness/src/
  scripts/
    interview-turn.ts             ← EXISTS
    decomposition-turn.ts         ← NEW
    holdout-generation.ts         ← NEW
  fixtures.ts                     ← EXPAND (bead, beadEdge, holdoutVault, llmUsage)
```

---

## Section 1: Interview Flow Tests (Priority 1)

### Expand `interview.wiring.test.ts`

#### FSM State Transition Edge Cases
- Submit answer when interview is paused → should error or resume
- Submit answer when phase is `reviewing` → should reject
- Double `startInterview` for same project → should resume existing, not create duplicate
- `requestEarlyCrystallization` when score is low → should return warning with gap info
- `approveSummary` when phase is still `gathering` → should reject
- `rejectSummary` then immediately `sendAnswer` → should work (back to gathering flow)

#### Scoring & Perspective Boundaries
- Score lands exactly at 0.8 threshold → should auto-transition to reviewing
- Score at 0.79 → should stay in gathering
- Score regression > 0.3 between turns → should trigger anomaly retry
- Brownfield mode → should score 4 dimensions instead of 3
- Empty transcript (first turn) → scoring with no prior context

#### Multi-Turn Flows
- Full 3+ turn interview through to crystallization (the real user journey)
- Interview where user picks freeform text alongside MC option
- Perspective activation changes as scores move through early/mid/late bands (overall < 0.4, 0.4-0.7, ≥ 0.7)

#### Holdout Lifecycle
- Generate → approve some, reject some → regenerate rejected → seal
- Seal with fewer than 5 approved scenarios → should fail
- Double-seal attempt → should reject
- Approve holdout that's already approved → test reveals actual behavior, codify as regression test

### New `interview-fsm.wiring.test.ts` (Engine-Level)

Tests FSM directly (not through tRPC) for edge cases awkward to reach via the router:
- Mode auto-detection (greenfield vs brownfield based on git history)
- `pause()` → `startOrResume()` round-trip preserves state
- `abandon()` → subsequent `startOrResume()` creates new interview
- `generateSummary()` with various transcript lengths
- `approveAndCrystallize()` with parentSeedId for evolution versioning

---

## Section 2: Remaining Pipeline Stage Wiring Tests (Priority 2)

### `execution.wiring.test.ts`
- `triggerDecomposition` → verify beads + edges created in DB, DAG is valid
- `getDAG` / `getProjectDAG` → returns correct bead graph structure
- `getBeadDetail` → returns spec, logs, code changes from events
- `triggerExecution` → dispatches Inngest events for ready beads only
- `getPipelineStatus` → reflects actual bead states (pending, running, done, failed)
- `respondToEscalation` → records event, verify bead state updated
- Decompose with no seed → should error
- Decompose already-decomposed seed → should reject or handle gracefully

### `evolution.wiring.test.ts`
- `getSeedLineage` → returns ordered parent chain
- `getEvolutionHistory` → returns convergence signals, lateral thinking events
- `getConvergenceForSeed` → returns cost data, convergence state
- Lineage with no parent → single-element chain
- Multiple evolution generations → correct ordering

### `projects.wiring.test.ts`
- Full CRUD: create → list → byId → updateSettings → archive → delete
- Archive prefixes name with `[archived]`, still appears in list
- Delete sets `deletedAt` timestamp, excluded from list
- `updateSettings` with budget → verify persisted
- Create with duplicate name → test reveals actual behavior, codify as regression test

### `costs.wiring.test.ts`
- `getProjectSummary` with no LLM usage → returns zeros
- `getByModel` / `getByStage` / `getByCycle` → correct grouping after seeded usage rows
- `getTopBeads` with limit → respects limit, ordered by cost descending

### Test-Harness Additions for Pipeline Stages
- `decompositionScript(opts)` — gateway script for 2-pass decomposition (molecule hierarchy + bead breakdown)
- `holdoutGenerationScript(opts)` — gateway script for holdout scenario generation
- `fixtures.bead({ seedId, status?, spec? })` — bead factory
- `fixtures.beadEdge({ fromId, toId })` — edge factory
- `fixtures.holdoutVault({ seedId, scenarios? })` — vault factory
- `fixtures.llmUsage({ projectId, model?, stage?, cost? })` — usage factory for cost tests

---

## Section 3: Targeted Unit Tests (Priority 3)

### Gateway: `circuit-breaker.test.ts`
- CLOSED → OPEN after failure threshold reached
- OPEN → HALF_OPEN after cooldown expires
- HALF_OPEN → CLOSED on success / back to OPEN on failure
- Boundary: cooldown expires at exact millisecond
- Concurrent calls during HALF_OPEN → only one probe allowed
- Multiple providers tracked independently

### Gateway: `failover.test.ts`
- Error classification: rate_limit, auth, server, timeout → correct retry decisions
- Exponential backoff timing: 1s, 2s, 4s progression
- Model chain exhaustion → clear error surfaced to caller
- Mixed error types across providers in sequence
- Circuit breaker integration (skips providers in OPEN state)

### Gateway: `budget.test.ts`
- Token budget enforcement per individual call
- Cumulative budget tracking across multiple calls
- Budget exhaustion → rejects call before hitting provider
- Concurrent budget checks → no overspend race condition

### Decomposition: Expand `validator.test.ts`
- Cycle detection: simple cycle (A→B→A), multi-node cycle (A→B→C→A), diamond DAG (valid, not a cycle), self-referencing bead
- Token budget: bead exactly at limit (pass), bead 1 token over (fail)
- Coverage: overlapping acceptance criteria, partial coverage gap, complete coverage

### Decomposition: Expand `scheduler.test.ts`
- Topological order with multiple valid orderings → deterministic output
- Single bead with no dependencies → scheduled immediately
- Deep chain (A→B→C→D) → correct sequential order
- Wide fan-out (A→B,C,D all parallel) → all scheduled at same level

### Scoring: Expand `scorer.test.ts`
- `computeWeightedScore` boundary values: all zeros, all ones, mixed dimensions
- Greenfield vs brownfield weight differences produce different scores for same inputs
- `validateScoreRules` regression detection at exactly 0.3 drop threshold
- Brownfield scores with missing `contextClarity` → error handling

---

## Success Criteria

1. Interview flow is exercisable end-to-end via wiring tests (multi-turn → crystallization → holdout seal)
2. Every tRPC procedure across all 5 routers has at least one wiring test
3. Every FSM state transition (interview, holdout vault) has explicit test coverage
4. Gateway state machine (circuit breaker) has full unit test coverage
5. All tests run in CI: `pnpm test:wiring` passes with real Postgres on :5433
6. Bugs surfaced by new tests are documented and fixed before tests are marked passing

## Estimated Test Count

| Category | New Tests | Expanded Tests |
|----------|-----------|---------------|
| Interview wiring (tRPC) | ~20 | ~8 existing |
| Interview wiring (engine) | ~10 | — |
| Execution wiring | ~8 | — |
| Evolution wiring | ~5 | — |
| Projects wiring | ~6 | — |
| Costs wiring | ~5 | — |
| Gateway unit | ~15 | — |
| Decomposition unit | — | ~10 existing |
| Scoring unit | — | ~6 existing |
| **Total** | **~69** | **~24 expanded** |
