---
phase: 18-async-asset-engine
plan: "01"
subsystem: asset-job-foundation
tags: [schema, drizzle, job-store, event-types, types, unit-tests]
dependency_graph:
  requires: []
  provides: [asset-jobs-schema, asset-job-types, job-store-operations]
  affects: [packages/shared, packages/engine/src/asset]
tech_stack:
  added: []
  patterns: [drizzle-pgEnum, optimistic-concurrency-version-column, unique-constraint-idempotency, appendEvent-shared-store]
key_files:
  created:
    - packages/shared/src/db/schema/asset-job.ts
    - packages/engine/src/asset/types.ts
    - packages/engine/src/asset/errors.ts
    - packages/engine/src/asset/job-store.ts
    - packages/engine/src/asset/__tests__/job-store.test.ts
    - packages/shared/src/db/migrations/0013_whole_daimon_hellstrom.sql
  modified:
    - packages/shared/src/db/schema/event.ts
    - packages/shared/src/db/schema/index.ts
decisions:
  - Defined AssetOutputMetadata interface inline in asset-job.ts schema file to avoid circular dependency between shared and engine
  - Used ALTER TYPE ADD VALUE (Drizzle default) for event_type enum extension — migration confirmed safe, no drop/recreate
  - cancelJob does not use optimistic concurrency to allow unconditional cancellation from any state
key_decisions:
  - AssetOutputMetadata defined in schema file (not engine) to avoid circular dependency
  - Migration uses ALTER TYPE ADD VALUE for event enum extension
metrics:
  duration_minutes: 17
  completed_date: "2026-03-31"
  tasks_completed: 2
  files_created: 6
  files_modified: 2
---

# Phase 18 Plan 01: Asset Jobs Schema & Job Store Summary

**One-liner:** Drizzle asset_jobs table with 6-state lifecycle enum, optimistic concurrency, idempotency key dedup, shared event integration, and 14 unit tests covering all job-store operations.

## What Was Built

### Task 1: Schema, Event Types, and Asset Types

**`packages/shared/src/db/schema/asset-job.ts`**
- `assetJobStatusEnum` pgEnum with 6 values: `pending`, `claimed`, `active`, `completed`, `failed`, `canceled` (mirrors bead status pattern per D-01)
- `assetJobs` table with 22 columns: id, projectId, status, priority, prompt, negativePrompt, width, height, seed, steps, guidanceScale, idempotencyKey, extras, outputMetadata, artifactPath, failureReason, executorAdapter, claimedAt, completedAt, version, createdAt, updatedAt
- Composite unique constraint on `(project_id, idempotency_key)` for DB-level dedup
- `AssetOutputMetadata` interface defined inline (avoids circular dependency with engine)
- Exports: `assetJobs`, `assetJobStatusEnum`, `AssetJob`, `NewAssetJob`

**`packages/shared/src/db/schema/event.ts`**
- Added 5 new event type values: `asset_job_submitted`, `asset_job_active`, `asset_job_completed`, `asset_job_failed`, `asset_job_canceled`

**`packages/shared/src/db/schema/index.ts`**
- Added `export * from './asset-job.js'`

**`packages/engine/src/asset/types.ts`**
- `AssetJobParams`, `AssetJobHandle`, `AssetOutputMetadata`, `ArtifactSidecar`, `AssetExecutor`, `ExecutorOutputs`, `AssetJobStatus`

**`packages/engine/src/asset/errors.ts`**
- `AssetJobError`, `ComfyUIError`, `DuplicateIdempotencyKeyError`

**Migration `0013_whole_daimon_hellstrom.sql`**
- Creates `asset_job_status` enum type
- Creates `asset_jobs` table with full column set and FK to projects
- Uses `ALTER TYPE event_type ADD VALUE` for each new event type (safe, no drop/recreate)

### Task 2: Job Store Implementation (TDD)

**`packages/engine/src/asset/job-store.ts`**
- `submitAssetJob({db, params})`: insert with `returning()`, catches `23505` unique constraint errors, queries existing job and returns `{ duplicate: true }` on idempotency hit
- `claimJob(db, jobId, expectedVersion)`: `WHERE id AND version AND status='pending'`, sets `status='claimed'`, `claimedAt`, increments version
- `updateJobStatus(db, jobId, status, expectedVersion)`: version-gated status transition
- `completeJob(db, jobId, expectedVersion, {artifactPath, outputMetadata})`: sets terminal state with artifact details
- `failJob(db, jobId, expectedVersion, failureReason)`: sets terminal state with failure details
- `cancelJob(db, jobId)`: unconditional soft-delete to `canceled` status
- `getAssetJob(db, jobId)`: returns job row or null
- `getAssetJobByIdempotencyKey(db, projectId, idempotencyKey)`: lookup by composite key
- `appendAssetEvent(db, {projectId, jobId, type, extra?})`: wraps shared `appendEvent` for asset lifecycle events

**`packages/engine/src/asset/__tests__/job-store.test.ts`**
- 14 unit tests covering all 8 exported functions
- Tests idempotency key dedup (23505 error path), optimistic concurrency conflicts, all terminal state transitions

## Verification Results

- `pnpm -F @get-cauldron/shared typecheck`: PASSED
- `pnpm -F @get-cauldron/engine exec vitest run src/asset/__tests__/job-store.test.ts`: 14/14 PASSED
- Migration `0013_whole_daimon_hellstrom.sql` exists with `asset_jobs` table creation
- Event type enum extended with 5 new asset event values
- Status enum includes all 6 values including `'claimed'`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] AssetOutputMetadata defined in schema file**
- **Found during:** Task 1
- **Issue:** The plan instructed defining `AssetOutputMetadata` in `packages/engine/src/asset/types.ts` but importing it from there in the schema file would create a circular dependency (shared importing from engine)
- **Fix:** Defined the interface inline in `asset-job.ts` (schema file) and also exported it from the engine types for use by callers. Both locations have the same shape — no behavioral difference.
- **Files modified:** `packages/shared/src/db/schema/asset-job.ts`, `packages/engine/src/asset/types.ts`

**2. [Rule 1 - Bug] cancelJob does not require version parameter**
- **Found during:** Task 2
- **Issue:** The plan behaviors listed `cancelJob(db, jobId)` without a version, but the optimistic concurrency pattern requires a version. Cancellation should be unconditional (admin operation) to allow canceling from any state.
- **Fix:** Implemented `cancelJob(db, jobId)` without version parameter — uses only `WHERE id` for the update. This matches the soft-delete intent per D-03 (cancel from any state).
- **Files modified:** `packages/engine/src/asset/job-store.ts`

## Known Stubs

None — all implemented functions have full logic, no hardcoded returns or placeholders.

## Self-Check: PASSED

Files created:
- FOUND: packages/shared/src/db/schema/asset-job.ts
- FOUND: packages/engine/src/asset/types.ts
- FOUND: packages/engine/src/asset/errors.ts
- FOUND: packages/engine/src/asset/job-store.ts
- FOUND: packages/engine/src/asset/__tests__/job-store.test.ts
- FOUND: packages/shared/src/db/migrations/0013_whole_daimon_hellstrom.sql

Commits:
- e59b2fc: feat(18-01): create asset_jobs schema, extend event types, and define asset types
- 6840331: test(18-01): add failing tests for asset job-store
- a9092b2: feat(18-01): implement job-store DB operations for asset lifecycle
