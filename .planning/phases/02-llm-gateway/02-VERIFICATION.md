---
phase: 02-llm-gateway
verified: 2026-03-26T18:48:00Z
status: passed
score: 20/20 must-haves verified
re_verification: false
---

# Phase 02: LLM Gateway Verification Report

**Phase Goal:** Every pipeline stage can call any supported LLM provider through a single typed interface, with automatic failover and full token cost visibility.
**Verified:** 2026-03-26T18:48:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | PipelineStage type constrains callers to 'interview' \| 'holdout' \| 'implementation' \| 'evaluation' | VERIFIED | `gateway/types.ts` line 4 exports exact union |
| 2  | llm_usage table exists in DB schema with all columns and 3 indexes | VERIFIED | `schema/llm-usage.ts` — pgTable with 12 cols, 3 composite indexes; migration 0002 applies it |
| 3  | projects table has a settings JSONB column for per-project model overrides | VERIFIED | `schema/project.ts` line 12: `settings: jsonb('settings').$type<ProjectSettings>()` |
| 4  | event_type enum includes all 4 gateway event types | VERIFIED | `schema/event.ts` lines 15–19: gateway_call_completed, gateway_failover, gateway_exhausted, budget_exceeded |
| 5  | GatewayConfig exported and cauldron.config.ts provides system defaults | VERIFIED | `config.ts` exports interface; `cauldron.config.ts` at project root has all 4 stages |
| 6  | Provider factory resolves model IDs to AI SDK LanguageModel instances | VERIFIED | `providers.ts` — MODEL_FAMILY_MAP (10 models), resolveModel() dispatches to anthropic/openai/google |
| 7  | Price table maps all model IDs to input/output cost per token | VERIFIED | `pricing.ts` — MODEL_PRICING covers all 10 models; calculateCostCents() rounds correctly |
| 8  | Single gateway.streamText() call routes to correct provider via stage | VERIFIED | `gateway.ts` — resolveModelChain() merges per-project + config defaults, delegates to executeWithFailover |
| 9  | Single gateway.generateText() call routes correctly | VERIFIED | `gateway.ts` line 136 — full implementation with budget check + failover |
| 10 | generateObject() and streamObject() route via Zod schema | VERIFIED | `gateway.ts` lines 170, 200 — both wired to executeWithFailover with schema passthrough |
| 11 | Primary 429/5xx triggers one retry then failover to next provider | VERIFIED | `failover.ts` lines 97–121 — shouldRetry(), sleep(backoffMs(0)), one retry, then next model |
| 12 | After 3 consecutive failures circuit breaker opens and skips that provider | VERIFIED | `circuit-breaker.ts` — FAILURE_THRESHOLD=3, isOpen() returns true when OPEN; failover skips |
| 13 | Holdout-stage calls with same provider family as implementer rejected | VERIFIED | `gateway.ts` lines 106–109 — enforceDiversity() throws DiversityViolationError before executeWithFailover |
| 14 | Holdout-stage failover skips providers from same family as implementer | VERIFIED | `failover.ts` lines 51–63 — filterDiverseModels() applied when stage='holdout' |
| 15 | Stage-specific system prompt preamble prepended to messages | VERIFIED | `gateway.ts` — STAGE_PREAMBLES constant, buildSystemPrompt() prepends to caller's system string |
| 16 | Per-project model overrides from DB merge onto config-file defaults | VERIFIED | `gateway.ts` resolveModelChain(): `this.projectSettings?.models?.[stage] ?? this.config.models[stage]` |
| 17 | All providers exhausted throws GatewayExhaustedError | VERIFIED | `failover.ts` line 139: throws GatewayExhaustedError after chain exhaustion |
| 18 | Budget check queries cumulative cost before each LLM call | VERIFIED | `budget.ts` — COALESCE(SUM(costCents)) query; called in all 4 gateway methods (lines 101, 138, 172, 202) |
| 19 | Startup key validation pings each configured provider | VERIFIED | `validation.ts` — deduplicates by family, pings with maxOutputTokens:1, maxRetries:0 |
| 20 | 45 tests across 6 files all pass | VERIFIED | `pnpm --filter @cauldron/engine run test -- --run` exits 0; 45 passed |

**Score:** 20/20 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/shared/src/db/schema/llm-usage.ts` | llm_usage table with 3 indexes, LlmUsage/NewLlmUsage types | VERIFIED | Exists, substantive (25 lines), exported from schema/index.ts |
| `packages/engine/src/gateway/types.ts` | PipelineStage, ProviderFamily, GatewayCallOptions | VERIFIED | All 4 types exported |
| `packages/engine/src/gateway/config.ts` | GatewayConfig, defineConfig, loadConfig | VERIFIED | All 3 exported |
| `packages/engine/src/gateway/providers.ts` | MODEL_FAMILY_MAP, resolveModel | VERIFIED | 10 models, 3 providers |
| `packages/engine/src/gateway/errors.ts` | GatewayExhaustedError, BudgetExceededError, DiversityViolationError | VERIFIED | All 3 classes with typed public properties |
| `cauldron.config.ts` | Default model chains per pipeline stage | VERIFIED | All 4 stages, holdout avoids anthropic by design |
| `packages/engine/src/gateway/gateway.ts` | LLMGateway with 4 API methods | VERIFIED | Full implementation, 292 lines |
| `packages/engine/src/gateway/circuit-breaker.ts` | CircuitBreaker class | VERIFIED | CLOSED/OPEN/HALF_OPEN states, FAILURE_THRESHOLD=3 |
| `packages/engine/src/gateway/diversity.ts` | enforceDiversity, filterDiverseModels | VERIFIED | Both exported |
| `packages/engine/src/gateway/failover.ts` | executeWithFailover | VERIFIED | classifyError, shouldRetry, backoff, chain walking |
| `packages/engine/src/gateway/budget.ts` | checkBudget | VERIFIED | COALESCE SUM query, throws BudgetExceededError |
| `packages/engine/src/gateway/validation.ts` | validateProviderKeys | VERIFIED | Pings per family, 401/403=invalid, other=inconclusive |
| `packages/engine/vitest.config.ts` | Vitest config discovering src/**/*.test.ts | VERIFIED | Exists, correct glob |
| `packages/engine/src/gateway/__tests__/*.test.ts` (6 files) | 45 tests total | VERIFIED | 8+10+8+7+6+6=45, all pass |
| `packages/shared/src/db/migrations/0002_material_ikaris.sql` | Migration for llm_usage, settings col, event enum | VERIFIED | All 3 DDL operations present |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `schema/index.ts` | `schema/llm-usage.ts` | `export * from './llm-usage.js'` | WIRED | Line 7 of schema/index.ts |
| `gateway/providers.ts` | `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google` | import + instantiation | WIRED | Lines 1–3; resolveModel dispatches to each |
| `gateway/gateway.ts` | `gateway/failover.ts` | all 4 methods delegate to executeWithFailover | WIRED | Lines 116, 153, 182, 212 |
| `gateway/failover.ts` | `gateway/circuit-breaker.ts` | circuitBreaker.isOpen() check | WIRED | Line 71 of failover.ts |
| `gateway/failover.ts` | `gateway/diversity.ts` | filterDiverseModels | WIRED | Line 5 import + line 52 call |
| `gateway/gateway.ts` | `ai` (Vercel AI SDK) | streamText, generateText, generateObject, streamObject imports | WIRED | Lines 2–7 of gateway.ts |
| `gateway/gateway.ts` | `gateway/budget.ts` | checkBudget in all 4 public methods | WIRED | Lines 101, 138, 172, 202 |
| `gateway/budget.ts` | `schema/llm-usage.ts` | COALESCE(SUM(costCents)) query | WIRED | Line 17 of budget.ts |
| `engine/src/index.ts` | `gateway/index.ts` | `export * from './gateway/index.js'` | WIRED | Line 2 |
| `shared/src/types/index.ts` | `schema/llm-usage.ts` | re-export LlmUsage, NewLlmUsage | WIRED | Line 19 of types/index.ts |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `gateway.ts` writeUsage | promptTokens, completionTokens, costCents | LanguageModelUsage from AI SDK onFinish/result.usage | Yes — live token counts from real API responses | FLOWING |
| `budget.ts` checkBudget | currentCents | `COALESCE(SUM(llmUsage.costCents), 0)` from DB | Yes — real DB aggregate query | FLOWING |
| `gateway.ts` recordFailoverEventAsync | stage, fromModel, reason | FailoverAttempt from executeWithFailover | Yes — real error metadata from provider call | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 45 unit tests all pass | `pnpm --filter @cauldron/engine run test -- --run` | 6 files, 45 tests, 0 failures | PASS |
| Engine typecheck clean | `pnpm --filter @cauldron/engine run typecheck` | exit 0 | PASS |
| Shared typecheck clean | `pnpm --filter @cauldron/shared run typecheck` | exit 0 | PASS |
| Gateway module exports LLMGateway | grep in index.ts | `export { LLMGateway }` on line 8 | PASS |
| budget.ts queries DB (not static return) | grep for SUM in budget.ts | `COALESCE(SUM(${llmUsage.costCents}), 0)` | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| LLM-01 | 02-01, 02-02 | Vercel AI SDK integrated as unified multi-provider interface (Anthropic, OpenAI, Google) | SATISFIED | providers.ts imports all 3 @ai-sdk packages; LLMGateway dispatches to all 3 |
| LLM-02 | 02-01, 02-02 | Default model assignments per pipeline stage | SATISFIED | cauldron.config.ts + GatewayConfig.models covers all 4 stages |
| LLM-03 | 02-01, 02-03 | Per-project model configuration overrides stored in project settings | SATISFIED | projects.settings JSONB; resolveModelChain() merges per-project over defaults |
| LLM-04 | 02-01, 02-02, 02-03 | Provider failover: primary fails → fall back to secondary | SATISFIED | executeWithFailover() walks chain with retry; 8 failover tests passing |
| LLM-05 | 02-01, 02-02, 02-03 | Token usage tracking per bead, per cycle, per project | SATISFIED | llm_usage table with 3 indexes; writeUsage() inserts per call; checkBudget() aggregates by project |
| LLM-06 | 02-01, 02-02, 02-03 | Cross-model diversity: holdout provider != implementer provider | SATISFIED | enforceDiversity() at call time; filterDiverseModels() during failover; 10 diversity tests passing |

All 6 requirements (LLM-01 through LLM-06) fully satisfied. Zero orphaned requirements.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `gateway/gateway.ts` lines 99, 136, 200 | `Promise<any>` return type with eslint-disable | Info | Known deviation: AI SDK v6 exports `Output` as a value namespace, making return types unnameable; documented in SUMMARY as intentional workaround |

No blockers. The `Promise<any>` annotations are a known AI SDK v6 interop limitation, not a stub or missing implementation.

---

### Human Verification Required

None. All goal-critical behaviors are either covered by passing unit tests or verifiable statically through code inspection.

The following behaviors would require a live environment (API keys + DB) to fully exercise but are outside the scope of unit testing:
1. Real provider failover with actual 429 responses from OpenAI/Anthropic/Google
2. Budget enforcement against a real PostgreSQL aggregate query at scale
3. Startup key validation pinging real provider endpoints

These are correctly covered by unit tests with mocked dependencies per the project's testing philosophy.

---

### Gaps Summary

No gaps. All 20 observable truths verified across all 4 levels (existence, substance, wiring, data-flow). Both packages typecheck clean. 45/45 tests pass. All 6 phase requirements satisfied.

---

_Verified: 2026-03-26T18:48:00Z_
_Verifier: Claude (gsd-verifier)_
