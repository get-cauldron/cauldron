---
phase: 02-llm-gateway
plan: 01
subsystem: database, api
tags: [drizzle, postgres, llm, gateway, ai-sdk, anthropic, openai, google, zod, pino, typescript]

# Dependency graph
requires:
  - phase: 01-persistence-foundation
    provides: Drizzle schema patterns, pgTable/pgEnum conventions, migration infrastructure, beads/projects/events tables

provides:
  - llm_usage table with 3 performance indexes (project+created, bead, project+cycle)
  - projects.settings JSONB column for per-project model override config
  - event_type enum extended with 4 gateway event types
  - PipelineStage and ProviderFamily type constraints
  - GatewayCallOptions, GatewayObjectOptions, GatewayCallResult, UsageRecord interfaces
  - GatewayExhaustedError, BudgetExceededError, DiversityViolationError error classes
  - MODEL_FAMILY_MAP (10 models across anthropic/openai/google)
  - resolveModel() factory mapping model IDs to AI SDK LanguageModel instances
  - MODEL_PRICING table with per-token costs for all 10 models
  - calculateCostCents() utility function
  - GatewayConfig type, defineConfig(), loadConfig() config system
  - cauldron.config.ts with default model chains per pipeline stage
  - Drizzle migration 0002_material_ikaris.sql

affects: [02-llm-gateway-plan-02, 03-interview-agent, 04-holdout-vault, 05-dag-scheduler, 06-parallel-execution]

# Tech tracking
tech-stack:
  added:
    - "ai@^6.0.138 — Vercel AI SDK for LanguageModel/LanguageModelUsage types"
    - "@ai-sdk/anthropic@^3.0.64 — Anthropic provider (Claude models)"
    - "@ai-sdk/openai@^3.0.48 — OpenAI provider (GPT models)"
    - "@ai-sdk/google@^3.0.53 — Google provider (Gemini models)"
    - "pino@^10.3.1 — Structured logging (added to engine, not yet wired)"
    - "zod@^4.3.6 — Runtime schema validation (used in GatewayObjectOptions type)"
    - "@types/node@^25.5.0 — Node.js type declarations for node:path usage"
  patterns:
    - "Provider factory pattern: MODEL_FAMILY_MAP + resolveModel() decouples model ID strings from AI SDK instantiation"
    - "Static pricing table: MODEL_PRICING maps model IDs to cents-per-million-token rates for cost tracking"
    - "Config loader: defineConfig() for type safety at definition site, loadConfig() for dynamic import at runtime"
    - "Error class hierarchy: Named error subclasses with typed public readonly properties for structured catch handling"

key-files:
  created:
    - packages/shared/src/db/schema/llm-usage.ts
    - packages/engine/src/gateway/types.ts
    - packages/engine/src/gateway/errors.ts
    - packages/engine/src/gateway/providers.ts
    - packages/engine/src/gateway/pricing.ts
    - packages/engine/src/gateway/config.ts
    - packages/engine/src/gateway/index.ts
    - packages/shared/src/db/migrations/0002_material_ikaris.sql
    - cauldron.config.ts
  modified:
    - packages/shared/src/db/schema/project.ts
    - packages/shared/src/db/schema/event.ts
    - packages/shared/src/db/schema/index.ts
    - packages/shared/src/types/index.ts
    - packages/engine/src/index.ts
    - packages/engine/package.json
    - packages/engine/tsconfig.json

key-decisions:
  - "All 10 models in MODEL_FAMILY_MAP match CLAUDE.md recommended stack exactly (claude-sonnet-4-6, claude-opus-4-5, claude-haiku-4-5, gpt-4o, gpt-4o-mini, gpt-4.1, gpt-4.1-mini, gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash)"
  - "GatewayConfig type exported both from config.ts (interface) and index.ts (re-export) — not as a value export, just type"
  - "loadConfig uses dynamic import() — config path must be resolvable at runtime; not validated at typecheck"
  - "cauldron.config.ts uses holdout: ['gpt-4o', 'gemini-2.5-pro'] (no Anthropic) to enforce cross-model diversity by default"
  - "pino added to dependencies now; logging not yet wired — will be used in Plan 02 gateway implementation"

patterns-established:
  - "PipelineStage union type: constrains all gateway callers to 'interview' | 'holdout' | 'implementation' | 'evaluation'"
  - "Node16 moduleResolution: all relative imports in engine use .js extensions"

requirements-completed: [LLM-01, LLM-02, LLM-03, LLM-05]

# Metrics
duration: 3min
completed: 2026-03-26
---

# Phase 02 Plan 01: LLM Gateway Foundation Summary

**Drizzle schema for llm_usage + project settings JSONB, gateway type contracts, provider factory resolving 10 models across 3 AI SDK providers, static pricing table, error classes, and cauldron.config.ts with default model chains**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-26T00:09:25Z
- **Completed:** 2026-03-26T00:12:17Z
- **Tasks:** 2
- **Files modified:** 14 (9 created, 5 modified)

## Accomplishments

- Created llm_usage Drizzle table with all D-20 columns and 3 composite indexes; generated migration 0002_material_ikaris.sql
- Added settings JSONB column to projects table for per-project model overrides (D-09); extended event_type enum with 4 gateway event types (D-15/D-19)
- Built complete gateway type surface: PipelineStage, ProviderFamily, GatewayCallOptions/ObjectOptions, GatewayCallResult, UsageRecord
- Implemented provider factory with MODEL_FAMILY_MAP (10 models) and resolveModel() using ai-sdk/anthropic, openai, google
- Created static pricing table for all 10 models with calculateCostCents() utility
- Defined GatewayConfig/defineConfig/loadConfig config system; cauldron.config.ts provides default per-stage model chains
- Three named error classes with typed public properties: GatewayExhaustedError, BudgetExceededError, DiversityViolationError

## Task Commits

Each task was committed atomically:

1. **Task 1: Database schema changes** - `703ab79` (feat)
2. **Task 2: Gateway type contracts, provider factory, config, pricing, errors** - `dac1f6b` (feat)

## Files Created/Modified

- `packages/shared/src/db/schema/llm-usage.ts` - llm_usage pgTable with 3 indexes, LlmUsage/NewLlmUsage types
- `packages/shared/src/db/schema/project.ts` - Added settings JSONB column + ProjectSettings interface
- `packages/shared/src/db/schema/event.ts` - Added 4 gateway event types to eventTypeEnum
- `packages/shared/src/db/schema/index.ts` - Re-export llm-usage.js barrel
- `packages/shared/src/types/index.ts` - Re-export LlmUsage, NewLlmUsage, ProjectSettings
- `packages/shared/src/db/migrations/0002_material_ikaris.sql` - Generated migration SQL
- `packages/engine/src/gateway/types.ts` - PipelineStage, ProviderFamily, all call/result interfaces
- `packages/engine/src/gateway/errors.ts` - GatewayExhaustedError, BudgetExceededError, DiversityViolationError
- `packages/engine/src/gateway/providers.ts` - MODEL_FAMILY_MAP, getProviderFamily, resolveModel
- `packages/engine/src/gateway/pricing.ts` - MODEL_PRICING table, calculateCostCents
- `packages/engine/src/gateway/config.ts` - GatewayConfig interface, defineConfig, loadConfig
- `packages/engine/src/gateway/index.ts` - Barrel re-exports for all gateway symbols
- `packages/engine/src/index.ts` - Updated to re-export gateway
- `packages/engine/package.json` - Added exports field + AI SDK dependencies
- `packages/engine/tsconfig.json` - Added types: ["node"] for node:path
- `cauldron.config.ts` - Default model chains for all 4 pipeline stages

## Decisions Made

- `cauldron.config.ts` omits Anthropic from holdout stage by default to enforce cross-model diversity (holdout uses gpt-4o + gemini-2.5-pro; implementation uses claude-sonnet-4-6)
- `loadConfig` uses dynamic `import()` — suitable for runtime use; not statically analyzed at typecheck time
- `GatewayConfig` exported as type-only from index.ts barrel (was a value export of an interface in config.ts — corrected to use `export type` in barrel)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added @types/node + tsconfig types field**
- **Found during:** Task 2 (gateway/config.ts creation)
- **Issue:** `import path from 'node:path'` failed with TS2591 "Cannot find name 'node:path'" because engine package had no node type declarations
- **Fix:** `pnpm add -D @types/node`; added `"types": ["node"]` to packages/engine/tsconfig.json compilerOptions
- **Files modified:** packages/engine/package.json, packages/engine/tsconfig.json
- **Verification:** `pnpm --filter @cauldron/engine run typecheck` exits 0
- **Committed in:** `dac1f6b` (Task 2 commit)

**2. [Rule 1 - Bug] Corrected GatewayConfig barrel export**
- **Found during:** Task 2 (gateway/index.ts creation)
- **Issue:** Plan spec had `export { GatewayConfig, defineConfig, loadConfig }` in index.ts — but GatewayConfig is an interface, not a value; cannot be in a value export without `export type`
- **Fix:** Split into `export { defineConfig, loadConfig }` (values) and `export type { GatewayConfig }` (type)
- **Files modified:** packages/engine/src/gateway/index.ts
- **Verification:** TypeScript compilation succeeds; GatewayConfig importable as type
- **Committed in:** `dac1f6b` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for correct compilation. No scope creep.

## Issues Encountered

None beyond the two auto-fixed deviations above.

## User Setup Required

None — no external service configuration required for type contracts and schema definitions. API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY) will be required when the gateway implementation runs in Plan 02.

## Next Phase Readiness

- Plan 02 (gateway implementation) can now import all types from `@cauldron/engine/gateway`
- Migration 0002_material_ikaris.sql ready to apply when database is running
- cauldron.config.ts provides system defaults; per-project overrides via projects.settings JSONB

## Self-Check: PASSED

All created files verified present on disk. Both task commits (703ab79, dac1f6b) confirmed in git log. Both typechecks (shared, engine) exit 0.

---
*Phase: 02-llm-gateway*
*Completed: 2026-03-26*
