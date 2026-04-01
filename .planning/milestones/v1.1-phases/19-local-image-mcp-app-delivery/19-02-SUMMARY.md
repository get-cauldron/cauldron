---
phase: 19-local-image-mcp-app-delivery
plan: "02"
subsystem: engine/asset
tags: [asset-jobs, job-listing, destination-delivery, drizzle, fs]
dependency_graph:
  requires: []
  provides:
    - listAssetJobs (paginated job query with project join)
    - destination delivery in collect-artifacts step
  affects:
    - packages/engine/src/asset/job-store.ts
    - packages/engine/src/asset/events.ts
tech_stack:
  added: []
  patterns:
    - Drizzle innerJoin with select shape for multi-table query
    - node:fs/promises copyFile + mkdir for artifact delivery
key_files:
  created: []
  modified:
    - packages/engine/src/asset/job-store.ts
    - packages/engine/src/asset/__tests__/job-store.test.ts
    - packages/engine/src/asset/events.ts
    - packages/engine/src/asset/__tests__/events.test.ts
decisions:
  - listAssetJobs applies where clause before limit/offset to match Drizzle chain ordering
  - status filter branching avoids unnecessary .where() call when no filter provided
metrics:
  duration: 317s
  completed: "2026-04-01T03:52:08Z"
  tasks_completed: 2
  files_changed: 4
---

# Phase 19 Plan 02: Asset Job Listing and Destination Delivery Summary

**One-liner:** Paginated `listAssetJobs` query with project name join, plus automatic image copy to `extras.destination` after artifact write (sidecar excluded per D-18).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add listAssetJobs query function to job-store | 4a8a880 | job-store.ts, job-store.test.ts |
| 2 | Extend collect-artifacts step with destination delivery | 61cf7ab | events.ts, events.test.ts |

## What Was Built

### Task 1: listAssetJobs

Added to `packages/engine/src/asset/job-store.ts`:

- `ListAssetJobsOptions` interface: optional `status`, `limit` (default 50), `offset` (default 0)
- `AssetJobWithProject` interface: `job` (full assetJobs row) + `projectName` string
- `listAssetJobs(db, options)` function:
  - Builds select with `{ job: assetJobs, projectName: projects.name }`
  - `innerJoin(projects, eq(assetJobs.projectId, projects.id))`
  - `orderBy(desc(assetJobs.createdAt))`
  - Applies `where(eq(assetJobs.status, status))` before `limit/offset` when status is provided
  - Returns `Promise<AssetJobWithProject[]>`

Added imports: `desc` from `drizzle-orm`, `projects` from `@get-cauldron/shared`, `AssetJobStatus` from `./types.js`.

5 test cases cover: default pagination, status filter, limit/offset forwarding, no-where-clause without filter, innerJoin and orderBy calls.

### Task 2: Destination Delivery

Extended `packages/engine/src/asset/events.ts` collect-artifacts step:

- Added `import { copyFile, mkdir } from 'node:fs/promises'`
- Added `import { dirname, join } from 'node:path'`
- After `writeArtifact()`, extracts `extras.destination` from job
- If set: creates destination dir recursively with `mkdir(dirname(destination), { recursive: true })`
- Copies image with `copyFile(join(artifactPath, image.filename), destination)`
- Sidecar (`.meta.json`) is NOT copied — artifact directory remains source of truth (D-18)

3 test cases: delivery with destination set (verifies mkdir + copyFile args), sidecar exclusion (copyFile called exactly once, not for .meta.json), no-copy when destination absent.

The test file mocks `node:fs/promises` with `vi.mock()` to avoid actual filesystem calls.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Drizzle query chain ordering for status filter**
- **Found during:** Task 1 GREEN phase
- **Issue:** Initial implementation called `.where()` on the result of `.offset()` (already resolved), causing "query.where is not a function" TypeError
- **Fix:** Restructured to apply `.where()` before `.limit().offset()` in the chain — matches actual Drizzle API ordering
- **Files modified:** packages/engine/src/asset/job-store.ts
- **Commit:** 4a8a880

## Known Stubs

None — both functions are fully wired.

## Pre-existing Test Failures (Out of Scope)

The following test failures exist in the engine package prior to this plan and are unrelated:
- `src/interview/__tests__/perspectives.test.ts` — 4 tests failing (array ordering issue in selectActivePerspectives)
- `src/execution/__tests__/merge-queue.test.ts` — 1 test failing (removeWorktree call tracking)

These are logged to `deferred-items.md` for tracking.

## Self-Check: PASSED

Files created/modified:
- [x] FOUND: packages/engine/src/asset/job-store.ts
- [x] FOUND: packages/engine/src/asset/__tests__/job-store.test.ts
- [x] FOUND: packages/engine/src/asset/events.ts
- [x] FOUND: packages/engine/src/asset/__tests__/events.test.ts

Commits:
- [x] FOUND: 4a8a880 feat(19-02): add listAssetJobs paginated query function with project join
- [x] FOUND: 61cf7ab feat(19-02): extend collect-artifacts step with destination delivery
