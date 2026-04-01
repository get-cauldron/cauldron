---
phase: 20-operator-controls-end-to-end-validation
plan: 02
subsystem: asset
tags: [asset-pipeline, e2e-test, verify-cli, integration-test, style-provenance, operator-controls]

# Dependency graph
requires:
  - phase: 20-01
    provides: checkAssetMode, checkAssetConcurrency, AssetModeDisabledError, AssetConcurrencyLimitError, configureAssetDeps, generateAssetHandler
  - phase: 19-local-image-mcp-app-delivery
    provides: ComfyUI adapter, artifact writer, job-store operations

provides:
  - cauldron verify assets CLI command (5 sequential health checks, exits 0/1)
  - E2E integration test proving full asset pipeline: submit -> handler -> mock executor -> artifact -> completed state
  - Style/seed provenance E2E test: interview -> seed -> asset job -> delivery
  - Migration 0013 idempotency fix for integration test infrastructure

affects: [ci-gating, operator-onboarding, 21-style-aware-interview]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "bootstrap() direct pattern for CLI commands needing DB access without tRPC"
    - "AbortSignal.timeout(3000) for HTTP health checks in CLI commands"
    - "mockStep pattern: { run: async (_name, fn) => fn() } for testing Inngest handlers directly"
    - "tmpdir-based artifact root via mkdtemp + afterEach cleanup with rm(recursive:true)"
    - "extras field on asset jobs as provenance link: { seedId, interviewId, styleProvenance }"

key-files:
  created:
    - packages/cli/src/commands/verify.ts
    - packages/engine/src/asset/__tests__/e2e-pipeline.integration.test.ts
  modified:
    - packages/cli/src/cli.ts
    - packages/shared/src/db/migrations/0013_whole_daimon_hellstrom.sql

key-decisions:
  - "verify command uses bootstrap() directly (like health.ts) — not tRPC — to get real DB access for project settings queries"
  - "ComfyUI health check hits /system_stats with AbortSignal.timeout(3000) — same endpoint ComfyUI adapter uses"
  - "Style/seed provenance stored in job.extras.seedId and job.extras.styleProvenance — jobs table has no dedicated seedId column, extras JSONB is the right linkage"
  - "Migration 0013 fixed with IF NOT EXISTS guards to allow integration tests to run against DBs that already have migrations 0003-0012 applied"

patterns-established:
  - "CLI verify command pattern: sequential PASS/FAIL checks, early exit accumulation, exits 0 on all pass / 1 on any fail"
  - "Integration test pattern for asset handler: createTestDb + runMigrations + configureAssetDeps with mock executor + mockStep"

requirements-completed:
  - OPS-03

# Metrics
duration: 11min
completed: 2026-04-01
---

# Phase 20 Plan 02: CLI verify command and E2E integration test Summary

**`cauldron verify assets` CLI command and E2E integration test proving the full v1.1 asset pipeline including style/seed provenance from interview through artifact delivery**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-04-01 (epoch 1775056993)
- **Completed:** 2026-04-01
- **Tasks:** 2
- **Files created/modified:** 4

## Accomplishments

- Created `packages/cli/src/commands/verify.ts` with `verifyCommand` and `verifyAssets`
  - 5 sequential checks: project exists and settings readable, asset mode check, ComfyUI connectivity (system_stats endpoint, 3s timeout), DB asset_jobs count, settings summary table
  - Optional `--real-comfyui` flag for GPU-backed test job submission
  - PASS/FAIL output with actionable error messages; exits 0 when healthy, 1 on any failure
  - Uses `bootstrap()` directly for real DB access (not tRPC)
- Registered `verify` in `cli.ts` with early-return before `bootstrapClient()` (same pattern as `health`)
- Created 6-test E2E integration test at `packages/engine/src/asset/__tests__/e2e-pipeline.integration.test.ts`
  - Tests: full pipeline (submit->handle->completed), artifact file + sidecar written, disabled mode blocks (AssetModeDisabledError), paused mode returns without throw, concurrency limit blocks (AssetConcurrencyLimitError), full style/seed provenance path
  - Uses real Postgres, mock AssetExecutor, tmpdir artifacts, direct generateAssetHandler call with mockStep
  - All 6 tests pass
- Fixed migration 0013 to be idempotent when running against DBs that already have migrations 0003-0012 applied

## Task Commits

1. **Task 1: CLI verify assets command** - `9f03237` (feat)
2. **Task 2: E2E integration test + migration fix** - `169c3da` (feat)

## Files Created/Modified

- `packages/cli/src/commands/verify.ts` - New file with verifyCommand, verifyAssets, PASS/FAIL pattern, 5 sequential checks
- `packages/cli/src/cli.ts` - Added 'verify' to COMMANDS, import, early-return block, printUsage entry
- `packages/engine/src/asset/__tests__/e2e-pipeline.integration.test.ts` - 6 E2E integration tests covering full pipeline and style/seed provenance
- `packages/shared/src/db/migrations/0013_whole_daimon_hellstrom.sql` - Fixed duplicate CREATE TYPE and ALTER TYPE ADD VALUE to use IF NOT EXISTS guards

## Decisions Made

- Style/seed provenance is stored via `job.extras.seedId` and `job.extras.styleProvenance` (not a dedicated DB column) — the `extras` JSONB field is the right mechanism for linking asset jobs to seed context without schema changes.
- The provenance chain is: interview (has style hints captured during session) -> seed (has `evolutionContext.style` from interview) -> asset job (extras.seedId + extras.styleProvenance) -> artifact (sidecar includes job metadata).
- Migration 0013 was generated as a consolidation migration but was not idempotent for DBs that had applied 0003-0012 sequentially. The fix uses DO-block IF NOT EXISTS for enum creation and IF NOT EXISTS for ALTER TYPE ADD VALUE / CREATE TABLE / ADD COLUMN to make migrations safe to run regardless of prior state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed migration 0013 to be idempotent for integration test infrastructure**

- **Found during:** Task 2 (E2E integration test execution)
- **Issue:** Migration 0013 tried to `CREATE TYPE "public"."interview_mode"` and `"interview_status"` which already existed from migration 0003 on DBs that had gone through the full migration sequence. Also contained `ALTER TYPE ... ADD VALUE` statements for enum values already added by migrations 0005-0011, and `ALTER TABLE ... ADD COLUMN` for columns already added by 0005-0012. Running the integration test against a real DB that had migrations 0003-0012 applied caused `interview_mode already exists` error, making all integration tests skip.
- **Fix:** Replaced duplicate CREATE TYPE statements with DO-block `IF NOT EXISTS` guards. Changed all `ALTER TYPE ... ADD VALUE` to `ADD VALUE IF NOT EXISTS`. Changed all `CREATE TABLE` to `CREATE TABLE IF NOT EXISTS`. Changed all `ADD COLUMN` to `ADD COLUMN IF NOT EXISTS`. Used DO-block pattern for FK constraint additions to avoid constraint-already-exists errors.
- **Files modified:** `packages/shared/src/db/migrations/0013_whole_daimon_hellstrom.sql`
- **Commit:** `169c3da`

## Known Stubs

None — all checks in `verify.ts` are wired to real DB queries and live HTTP calls. The E2E test uses a mock executor (not a stub returning empty data) since it tests the integration between the handler orchestration and real DB operations.

## Self-Check: PASSED

- FOUND: packages/cli/src/commands/verify.ts
- FOUND: packages/engine/src/asset/__tests__/e2e-pipeline.integration.test.ts
- FOUND commit 9f03237 (Task 1: CLI verify command)
- FOUND commit 169c3da (Task 2: E2E integration test + migration fix)
