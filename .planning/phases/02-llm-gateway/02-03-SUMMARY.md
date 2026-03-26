---
phase: 02-llm-gateway
plan: 03
subsystem: testing
tags: [vitest, drizzle-orm, llm-gateway, circuit-breaker, budget, validation, failover, diversity, pricing]

requires:
  - phase: 02-02
    provides: LLMGateway class, failover, circuit-breaker, diversity, pricing, all gateway modules

provides:
  - Budget enforcement (checkBudget) blocking LLM calls when project cost meets or exceeds limit
  - Startup API key validation (validateProviderKeys) pinging each provider family once at construction
  - LLMGateway.create() static factory with optional key validation
  - Full unit test suite: 45 tests across 6 files covering all gateway modules
affects:
  - 03-interview
  - 04-holdout-vault
  - 05-dag-scheduler

tech-stack:
  added: [drizzle-orm (added to engine package direct dependency)]
  patterns:
    - "Budget check: checkBudget() queries COALESCE(SUM(cost_cents)) before every LLM call"
    - "Key validation: one ping per provider family, 401/403 = invalid, other errors = inconclusive"
    - "TDD: tests written alongside implementation, mocked at module boundaries"
    - "Gateway test isolation: vi.mock('ai') + vi.mock('@cauldron/shared') enables unit testing without DB"

key-files:
  created:
    - packages/engine/vitest.config.ts
    - packages/engine/src/gateway/budget.ts
    - packages/engine/src/gateway/validation.ts
    - packages/engine/src/gateway/__tests__/budget.test.ts
    - packages/engine/src/gateway/__tests__/circuit-breaker.test.ts
    - packages/engine/src/gateway/__tests__/diversity.test.ts
    - packages/engine/src/gateway/__tests__/failover.test.ts
    - packages/engine/src/gateway/__tests__/pricing.test.ts
    - packages/engine/src/gateway/__tests__/gateway.test.ts
  modified:
    - packages/engine/src/gateway/gateway.ts
    - packages/engine/src/gateway/index.ts
    - packages/engine/package.json

key-decisions:
  - "drizzle-orm added to engine package directly: budget.ts needs eq/sql operators; re-exporting from shared would create tight coupling; direct dependency is cleaner"
  - "Budget check accepts limitCents parameter: override logic (projectSettings vs config default) lives in gateway.ts, checkBudget itself is a pure query function"
  - "validateProviderKeys treats non-401/403 errors as inconclusive (valid=true with warning): network timeouts and rate limits during startup should not block gateway construction"

patterns-established:
  - "Module mocking pattern: vi.mock('@cauldron/shared') with minimal stub objects for unit tests"
  - "Failover test pattern: makeMockDb(currentCents) factory for budget-sensitive gateway tests"

requirements-completed:
  - LLM-03
  - LLM-04
  - LLM-05
  - LLM-06

duration: 4min
completed: 2026-03-26
---

# Phase 02 Plan 03: Budget Enforcement, Key Validation, and Gateway Test Suite Summary

**Budget check on every LLM call via COALESCE(SUM) query, startup API key ping per provider family, and 45-test gateway suite covering circuit breaker, diversity, failover, pricing, and integration**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-26T00:24:55Z
- **Completed:** 2026-03-26T00:28:15Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- Budget enforcement (D-23): `checkBudget()` queries cumulative `cost_cents` via Drizzle SUM before every LLM call in all 4 public gateway methods; throws `BudgetExceededError` when at or over limit
- Startup key validation (D-12): `validateProviderKeys()` deduplicates by provider family, pings each with `maxOutputTokens: 1, maxRetries: 0`; 401/403 = invalid, other errors = inconclusive (key may be valid)
- `LLMGateway.create()` static factory method validates keys before returning instance
- 45 unit tests across 6 files: all pass, typecheck passes

## Task Commits

1. **Task 1: Vitest config, budget enforcement, key validation** - `33fe367` (feat)
2. **Task 2: Comprehensive gateway test suite** - `d1b3294` (test)

## Files Created/Modified

- `packages/engine/vitest.config.ts` — Vitest config discovering `src/**/*.test.ts`
- `packages/engine/src/gateway/budget.ts` — `checkBudget(db, projectId, limitCents)` with COALESCE SUM query
- `packages/engine/src/gateway/validation.ts` — `validateProviderKeys(configuredModels, logger)` startup ping
- `packages/engine/src/gateway/gateway.ts` — budget check added to all 4 public methods; `static async create()` factory
- `packages/engine/src/gateway/index.ts` — exports `checkBudget`, `validateProviderKeys`, `ValidationResult`
- `packages/engine/package.json` — added `drizzle-orm` as direct dependency
- `packages/engine/src/gateway/__tests__/budget.test.ts` — 6 tests: below/at/above limit, no usage, override
- `packages/engine/src/gateway/__tests__/circuit-breaker.test.ts` — 8 tests: state transitions with fake timers
- `packages/engine/src/gateway/__tests__/diversity.test.ts` — 8 tests: violation detection and family filtering
- `packages/engine/src/gateway/__tests__/failover.test.ts` — 8 tests: success path, 429, retry (D-14), exhaustion, circuit skip, holdout filtering, FailoverAttempt recording
- `packages/engine/src/gateway/__tests__/pricing.test.ts` — 7 tests: cost calculation accuracy, MODEL_PRICING completeness
- `packages/engine/src/gateway/__tests__/gateway.test.ts` — 6 integration tests: routing, diversity enforcement, budget blocking, usage recording, settings override

## Decisions Made

- `drizzle-orm` added to engine package as a direct dependency — `budget.ts` needs `eq` and `sql` operators; importing through `@cauldron/shared` would require re-exporting primitives which creates leaky coupling
- `checkBudget` accepts `limitCents` as a parameter rather than reading projectSettings internally — keeps the function pure and testable; the override resolution (`projectSettings?.budgetLimitCents ?? config.budget.defaultLimitCents`) belongs in `gateway.ts`
- `validateProviderKeys` treats non-auth errors as inconclusive rather than failures — network timeouts during startup should not block gateway construction; only explicit 401/403 indicates an invalid key

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added drizzle-orm to engine package dependencies**
- **Found during:** Task 1 (budget.ts creation)
- **Issue:** `budget.ts` imports `eq` and `sql` from `drizzle-orm`, but the engine package only had `@cauldron/shared` (which has `drizzle-orm` internally). TypeScript typecheck failed with `Cannot find module 'drizzle-orm'`
- **Fix:** Ran `pnpm --filter @cauldron/engine add drizzle-orm`; removed unnecessary `drizzle-orm` mock from `budget.test.ts`
- **Files modified:** `packages/engine/package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter @cauldron/engine run typecheck` exits 0
- **Committed in:** `33fe367` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking dependency)
**Impact on plan:** Necessary correctness fix. No scope creep.

## Issues Encountered

None — budget mock pattern (`makeMockDb(currentCents)`) and `vi.mock('@cauldron/shared')` worked cleanly for all gateway integration tests without requiring a real database.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 02 (LLM Gateway) is complete: all modules implemented, tested, and validated
- `LLMGateway` is ready for consumption by interview (Phase 03), holdout (Phase 04), and implementation (Phase 06) stages
- Budget enforcement and key validation are wired and tested — downstream phases can rely on these safety checks being present at gateway construction

---
*Phase: 02-llm-gateway*
*Completed: 2026-03-26*

## Self-Check: PASSED

- All 9 created files confirmed present on disk
- Both task commits (33fe367, d1b3294) confirmed in git log
