# Phase 20: Operator Controls & End-to-End Validation - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Operators can configure, constrain, and prove the full local asset workflow on a per-project basis. This includes project-level settings for asset generation (runtime paths, mode, concurrency limits), a two-layer config system (config file defaults + CLI runtime overrides), and end-to-end verification that proves the complete path from style capture through seed persistence through async generation to delivered local assets.

This phase does NOT include: remote/cloud generation backends, web dashboard settings UI, model acquisition tooling, or style-aware interview changes.

</domain>

<decisions>
## Implementation Decisions

### Asset Settings Shape
- **D-01:** Nested `asset` object in `ProjectSettings`: `{ asset: { mode, runtimeUrl, artifactsRoot, maxConcurrentJobs } }`. Keeps asset config grouped and extensible without crowding top-level settings.
- **D-02:** Mode enum for enable/disable: `asset.mode: 'active' | 'paused' | 'disabled'`. Active runs jobs normally, paused accepts jobs but queues them (doesn't dispatch to executor), disabled rejects job submission outright with a clear error.
- **D-03:** Acquisition mode is `local-only` for v1.1. Only use the locally running ComfyUI. Fail if not available. No remote/cloud fallback code paths.

### Budget & Limits
- **D-04:** No monetary budget for asset generation — local ComfyUI has no per-job cost. The existing LLM budget system is unrelated to asset generation.
- **D-05:** `asset.maxConcurrentJobs` limits how many jobs run simultaneously. Prevents GPU overload on local hardware. Enforcement at job submission or dispatch time.

### E2E Validation
- **D-06:** Both integration test suite AND CLI verification command. Integration tests for CI, CLI command for operator setup validation.
- **D-07:** Full pipeline E2E: interview with style hints → crystallize seed (style persisted) → submit asset job referencing seed style → generation → artifact delivery. Proves the complete v1.1 story end-to-end.
- **D-08:** Dual executor paths: mock executor for standard CI (no GPU required), optional flag to run against real ComfyUI for full validation. Mock proves wiring, real ComfyUI proves actual generation.
- **D-09:** CLI command: `cauldron verify` (top-level) with `cauldron verify assets` subcommand for targeted asset path verification. Extensible for future verification checks.

### CLI/API Surface
- **D-10:** Two-layer config: `cauldron.config.ts` sets project defaults (version-controlled), CLI commands override per-project in DB at runtime. DB values take precedence over config file.
- **D-11:** CLI commands: `cauldron config set asset.mode active`, `cauldron config set asset.maxConcurrentJobs 2`, etc. Reads/writes ProjectSettings JSONB in projects table.

### Claude's Discretion
- Exact enforcement point for maxConcurrentJobs (submission vs dispatch)
- Mock executor implementation details for CI tests
- CLI verify command output format and verbosity levels
- Default values for asset settings when not explicitly configured
- Error message wording when mode is disabled/paused

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Settings & Budget Infrastructure
- `packages/shared/src/db/schema/project.ts` — ProjectSettings interface, projects table with JSONB settings column
- `packages/engine/src/gateway/budget.ts` — checkBudget() pattern for pre-call enforcement (reference for concurrency enforcement)
- `packages/engine/src/gateway/config.ts` — GatewayConfig, loadConfig(), cauldron.config.ts loading pattern
- `packages/engine/src/gateway/gateway.ts` — How projectSettings overrides config defaults (lines 128-130)

### Asset System (Phase 18-19)
- `packages/engine/src/asset/job-store.ts` — submitAssetJob, listAssetJobs, job lifecycle functions
- `packages/engine/src/asset/events.ts` — handleAssetGenerate Inngest function, configureAssetDeps, collect-artifacts step with delivery
- `packages/engine/src/asset/comfyui-adapter.ts` — createComfyUIExecutor (pluggable executor interface)
- `packages/engine/src/asset/types.ts` — AssetExecutor interface, AssetJobParams
- `packages/mcp/src/tools/generate-image.ts` — MCP tool that calls submitAssetJob + inngest.send
- `packages/mcp/src/bootstrap.ts` — bootstrapMcp, configureAssetDeps wiring

### CLI Patterns
- `packages/cli/src/bootstrap.ts` — Bootstrap wiring pattern (configureAssetDeps already called here)
- `packages/cli/src/inngest-serve.ts` — ENGINE_FUNCTIONS array, Hono server setup

### Conventions
- `.planning/codebase/CONVENTIONS.md` — Naming, module structure, import patterns
- `.planning/codebase/ARCHITECTURE.md` — System overview, entity relationships

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ProjectSettings` interface with JSONB column — extend with nested `asset` object
- `checkBudget()` pattern — reference for pre-dispatch concurrency check
- `loadConfig()` — already loads cauldron.config.ts, extend GatewayConfig with asset defaults
- CLI command infrastructure — existing commands as pattern for `config set` and `verify`

### Established Patterns
- JSONB settings with TypeScript interface overlay (ProjectSettings)
- Config file defaults overridden by DB values (budgetLimitCents pattern)
- Factory functions with dependency injection (configureAssetDeps)
- Inngest step.run() for durable execution with retry
- Integration tests using Docker Postgres on :5433

### Integration Points
- `ProjectSettings` interface needs `asset` property added
- `GatewayConfig` may need `asset` defaults section for cauldron.config.ts
- Job submission (submitAssetJob) needs mode + concurrency enforcement
- MCP tools need to check mode before accepting requests
- CLI needs new `config` and `verify` command groups

</code_context>

<specifics>
## Specific Ideas

- The mode enum (active/paused/disabled) gives operators nuanced control — paused is useful during maintenance or when GPU is needed for other work
- Two-layer config means teams can version-control sensible defaults while individual operators adjust at runtime
- Full pipeline E2E test proves the entire v1.1 value proposition in one test: style → seed → generation → delivery
- Mock executor in CI means E2E tests run fast and don't need GPU hardware

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 20-operator-controls-end-to-end-validation*
*Context gathered: 2026-04-01*
