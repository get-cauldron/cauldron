---
phase: 18-async-asset-engine
plan: "03"
subsystem: asset
tags: [inngest, asset-generation, comfyui, docker, durable-execution]
dependency_graph:
  requires: ["18-01", "18-02"]
  provides: ["asset/generate Inngest function", "ComfyUI docker service", "bootstrap asset wiring"]
  affects: ["packages/engine", "packages/cli", "docker-compose.yml"]
tech_stack:
  added: []
  patterns: ["module-level deps with configure*Deps pattern", "3-step durable Inngest pipeline", "pollUntilDone extracted helper"]
key_files:
  created:
    - packages/engine/src/asset/events.ts
    - packages/engine/src/asset/index.ts
    - packages/engine/src/asset/__tests__/events.test.ts
  modified:
    - packages/engine/src/index.ts
    - packages/cli/src/inngest-serve.ts
    - packages/cli/src/bootstrap.ts
    - docker-compose.yml
    - .gitignore
    - packages/engine/tsconfig.json
    - packages/engine/src/asset/__tests__/job-store.test.ts
decisions:
  - "Reused cauldron-engine Inngest client from holdout/events.ts (no second client instance)"
  - "pollUntilDone extracted as helper function to keep step 2 readable (<50 lines)"
  - "ComfyUI service has no profiles gate - starts by default with docker compose up -d (D-06)"
  - "Fixed pre-existing tsconfig wiring test exclusion to unblock build"
metrics:
  duration_seconds: 1010
  completed_date: "2026-03-31T22:48:02Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 7
---

# Phase 18 Plan 03: Inngest Asset Pipeline Wiring Summary

**One-liner:** Durable 3-step Inngest asset/generate function (submit->poll->collect) wired into CLI server with ComfyUI docker service and artifact directory gitignoring.

## What Was Built

### Task 1: Inngest asset/generate function and module barrel

`packages/engine/src/asset/events.ts` implements the full durable generation pipeline:

- **`configureAssetDeps({ db, logger, executor, artifactsRoot })`** — module-level dependency injection following the `configureVaultDeps` pattern from holdout/events.ts
- **`generateAssetHandler`** — extracted for testability, orchestrates 3 Inngest steps:
  - Step 1 `submit-to-comfyui`: `getAssetJob` → `claimJob` (pending→claimed, D-01) → `updateJobStatus('active')` → `executor.submitJob` → `appendAssetEvent('asset_job_active')`
  - Step 2 `poll-completion`: `pollUntilDone` helper polls `executor.checkStatus` every 3s with 5-minute timeout. Throws `NonRetriableError` on timeout (D-17)
  - Step 3 `collect-artifacts`: `executor.getArtifact` → `writeArtifact` → `completeJob` → `appendAssetEvent('asset_job_completed')`
  - Error handling: each step catches errors, calls `failJob` + `appendAssetEvent('asset_job_failed')`, rethrows for Inngest retry
- **`handleAssetGenerate`** — Inngest function with id `asset/generate`, trigger `asset/generate.requested`, retries: 3 (D-15)
- Reuses the `cauldron-engine` Inngest client from `holdout/events.ts` — no second client

`packages/engine/src/asset/index.ts` barrel exports all asset submodule symbols.

`packages/engine/src/index.ts` updated to export `./asset/index.js`.

16 unit tests cover all 3 steps, error handling, `NonRetriableError` on timeout, step name ordering, and step count.

**SSE pipeline confirmed:** The existing SSE route at `packages/web/src/app/api/events/[projectId]/route.ts` polls the shared events table by `sequenceNumber` and `projectId` without filtering by event type. Asset events appended via `appendAssetEvent` are automatically delivered to SSE subscribers. No modification needed.

### Task 2: CLI server, bootstrap, docker-compose, gitignore

- `packages/cli/src/inngest-serve.ts`: Added `handleAssetGenerate` to imports and `ENGINE_FUNCTIONS` array (6 functions total, was 5)
- `packages/cli/src/bootstrap.ts`: Added `configureAssetDeps` and `createComfyUIExecutor` imports; wires asset deps after existing configure* calls using `COMFYUI_URL` env var (default `http://localhost:8188`) and `{projectRoot}/.cauldron/artifacts` root
- `docker-compose.yml`: Added `comfyui` service using `yanwk/comfyui-boot:latest` on port 8188 with GPU device reservations (best-effort) and healthcheck. No `profiles:` key — starts by default with `docker compose up -d` per D-06. Added `comfyui_data:` volume.
- `.gitignore`: Added `.cauldron/` entry at project-root level covering any artifact directory (D-10)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bug] Fixed pre-existing job-store.test.ts TypeScript error**
- **Found during:** Task 2 typecheck run
- **Issue:** `Parameters<typeof claimJob>[1]` should be `[0]` (db is first parameter, not second)
- **Fix:** Changed index from `[1]` to `[0]` in both test cases in `job-store.test.ts`
- **Files modified:** `packages/engine/src/asset/__tests__/job-store.test.ts`
- **Commit:** dc79a9e

**2. [Rule 3 - Bug] Fixed pre-existing tsconfig rootDir error blocking build**
- **Found during:** Task 2 typecheck run
- **Issue:** `src/**/*.wiring.test.ts` imports from `../../../test-harness/` which violates `rootDir: ./src` in engine tsconfig, causing `tsc` build to fail
- **Fix:** Added `"exclude": ["src/**/*.wiring.test.ts"]` to `packages/engine/tsconfig.json`
- **Files modified:** `packages/engine/tsconfig.json`
- **Commit:** dc79a9e

**3. [Rule 1 - Bug] Fixed events.test.ts mock objects missing schema fields**
- **Found during:** Task 2 typecheck run
- **Issue:** `mockJob` and derived mocks were missing `priority` (integer, default 0) and `executorAdapter` (text, default 'comfyui') fields present in the actual Drizzle schema
- **Fix:** Added both fields to mock objects in events.test.ts
- **Files modified:** `packages/engine/src/asset/__tests__/events.test.ts`
- **Commit:** dc79a9e

## Acceptance Criteria Check

- [x] `packages/engine/src/asset/events.ts` contains `export function configureAssetDeps`
- [x] `packages/engine/src/asset/events.ts` contains `export async function generateAssetHandler`
- [x] `packages/engine/src/asset/events.ts` contains `export const handleAssetGenerate`
- [x] `packages/engine/src/asset/events.ts` contains `from '../holdout/events.js'` (shared Inngest client)
- [x] `packages/engine/src/asset/events.ts` contains `NonRetriableError`
- [x] `packages/engine/src/asset/events.ts` contains `'asset/generate'` (function id)
- [x] `packages/engine/src/asset/events.ts` contains `retries: 3`
- [x] `packages/engine/src/asset/events.ts` contains `300_000` (5 min timeout)
- [x] `packages/engine/src/asset/events.ts` contains `3_000` (poll interval)
- [x] `packages/engine/src/asset/events.ts` contains `claimJob` (D-01 claimed state transition)
- [x] `packages/engine/src/asset/index.ts` contains `export * from './events.js'`
- [x] `packages/engine/src/index.ts` contains `export * from './asset/index.js'`
- [x] `packages/engine/src/asset/__tests__/events.test.ts` contains `generateAssetHandler`
- [x] All 16 unit tests pass
- [x] `packages/cli/src/inngest-serve.ts` contains `handleAssetGenerate` in imports
- [x] `packages/cli/src/inngest-serve.ts` contains `handleAssetGenerate` in ENGINE_FUNCTIONS array
- [x] `packages/cli/src/bootstrap.ts` contains `configureAssetDeps`
- [x] `packages/cli/src/bootstrap.ts` contains `createComfyUIExecutor`
- [x] `packages/cli/src/bootstrap.ts` contains `COMFYUI_URL`
- [x] `packages/cli/src/bootstrap.ts` contains `.cauldron`
- [x] `docker-compose.yml` contains `comfyui:`
- [x] `docker-compose.yml` contains `yanwk/comfyui-boot`
- [x] `docker-compose.yml` contains `8188:8188`
- [x] `docker-compose.yml` does NOT contain `profiles:` under comfyui (per D-06)
- [x] `docker-compose.yml` contains `comfyui_data:`
- [x] `.gitignore` contains `.cauldron/`
- [x] `pnpm typecheck` exits 0
- [x] `pnpm build` exits 0
- [x] `docker compose config` validates

## Known Stubs

None — all integration points are fully wired. The ComfyUI adapter reads from a real ComfyUI HTTP API and the job store uses real Drizzle queries. Generation will work when `docker compose up -d comfyui` is running and a FLUX.2 model bundle is present (covered in Phase 19).

## Self-Check: PASSED
