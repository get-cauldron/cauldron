---
phase: 21-v1.1-polish-integration-wiring-type-fixes
plan: "01"
subsystem: asset-pipeline
tags: [asset-jobs, mcp, database, inngest, event-sourcing]
dependency_graph:
  requires: [phase-18-asset-module, phase-19-mcp]
  provides: [asset-event-completeness, mcp-push-notifications, float-guidance-scale, robust-template-resolution]
  affects: [engine-asset, shared-schema, mcp-server]
tech_stack:
  added: []
  patterns: [callback-injection-for-cross-package-notifications, createRequire-for-robust-package-resolution]
key_files:
  created:
    - packages/shared/src/db/migrations/0014_strange_gamma_corps.sql
  modified:
    - packages/engine/src/asset/job-store.ts
    - packages/shared/src/db/schema/asset-job.ts
    - packages/engine/src/asset/events.ts
    - packages/mcp/src/server.ts
    - packages/engine/src/asset/comfyui-adapter.ts
decisions:
  - Callback injection pattern (onJobStatusChanged) for cross-package MCP notification without engine taking dependency on MCP
  - createRequire with monorepo-relative fallback for robust template resolution across packaging environments
metrics:
  duration: ~15 minutes
  completed: "2026-04-01"
  tasks: 2
  files_changed: 5
---

# Phase 21 Plan 01: v1.1 Polish — Integration Wiring & Type Fixes Summary

**One-liner:** Four targeted integration gap closures: asset_job_submitted event wiring, MCP push notification callback infrastructure, guidance_scale integer-to-real column migration, and createRequire-based template path resolution.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Wire asset_job_submitted event and fix guidance_scale column type | 759ac4e | job-store.ts, asset-job.ts, 0014 migration |
| 2 | Activate MCP push notifications and fix template path resolution | b4218fd | events.ts, server.ts, comfyui-adapter.ts |

## What Was Built

### Task 1

**asset_job_submitted event wiring (ASSET-03)**

`submitAssetJob` in `packages/engine/src/asset/job-store.ts` now calls `appendAssetEvent` with `type: 'asset_job_submitted'` immediately after a successful DB insert. This ensures SSE observers and event-replay subscribers see job creation events. The call is only on fresh inserts — the idempotency/duplicate path in the catch block does not fire the event.

**guidance_scale column type fix (ASSET-02, ASSET-04)**

Changed `guidanceScale: integer('guidance_scale')` to `guidanceScale: real('guidance_scale')` in `packages/shared/src/db/schema/asset-job.ts`. Added `real` to the import from `drizzle-orm/pg-core` (mirroring the pattern in `seed.ts`). Generated migration `0014_strange_gamma_corps.sql` containing:
```sql
ALTER TABLE "asset_jobs" ALTER COLUMN "guidance_scale" SET DATA TYPE real;
```

### Task 2

**MCP push notification callback infrastructure (MCP-03)**

Extended the `AssetDeps` interface in `packages/engine/src/asset/events.ts` with an optional `onJobStatusChanged?: (jobId: string) => void` callback. The `generateAssetHandler` now calls `onJobStatusChanged?.(jobId)` after each state-transition event:
- After `asset_job_active` (step 1 success)
- After `asset_job_failed` (all 3 catch blocks)
- After `asset_job_completed` (step 3 success)

In `packages/mcp/src/server.ts`, added `createJobStatusNotifier(server: McpServer): (jobId: string) => void` — a factory that returns a closure calling `notifyJobStatusChanged(server, jobId)`. The import of `notifyJobStatusChanged` was added from `./resources/job-status.js`. Callers (MCP index.ts or integration tests) can pass the notifier to `configureAssetDeps` as `onJobStatusChanged` to activate push notifications without the engine taking a direct import dependency on the MCP package.

**Robust template path resolution**

Replaced the hard-coded monorepo-relative `__dirname` path in `packages/engine/src/asset/comfyui-adapter.ts` with a `createRequire` strategy:

1. **Strategy 1 (standalone packaging):** `createRequire(import.meta.url)` resolves `@get-cauldron/shared/package.json` via Node's module resolution, then constructs the template path from the package root.
2. **Strategy 2 (monorepo dev):** Falls back to the original `dirname(fileURLToPath(import.meta.url))` relative path if strategy 1 throws.

## Verification

- `pnpm typecheck` — 7/7 tasks successful
- `pnpm build` — 5/5 tasks successful
- `pnpm test` — pre-existing failures in `perspectives.test.ts` (array ordering) and web `ExecutionPage` (tRPC mock) confirmed to exist before this plan; no regressions introduced
- All grep acceptance criteria confirmed

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all four integration gaps are fully wired. The `onJobStatusChanged` callback in `events.ts` is optional and will produce no notification if not provided, which is correct behavior for process isolation (Inngest handler vs MCP server running in separate processes).

## Self-Check: PASSED

- `packages/engine/src/asset/job-store.ts` — FOUND, contains `asset_job_submitted`
- `packages/shared/src/db/schema/asset-job.ts` — FOUND, contains `real('guidance_scale')`
- `packages/engine/src/asset/events.ts` — FOUND, contains `onJobStatusChanged`
- `packages/mcp/src/server.ts` — FOUND, contains `createJobStatusNotifier`
- `packages/engine/src/asset/comfyui-adapter.ts` — FOUND, contains `createRequire`
- `packages/shared/src/db/migrations/0014_strange_gamma_corps.sql` — FOUND
- Commits 759ac4e and b4218fd — FOUND in git log
