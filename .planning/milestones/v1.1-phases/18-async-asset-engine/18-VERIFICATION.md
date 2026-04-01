---
phase: 18-async-asset-engine
verified: 2026-03-31T17:07:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
---

# Phase 18: Async Asset Engine Verification Report

**Phase Goal:** Local image generation runs as a durable async job system rather than a blocking CLI or web request.
**Verified:** 2026-03-31T17:07:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

#### Plan 01 Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Submitting a generation request returns a jobId immediately without blocking | VERIFIED | `submitAssetJob` inserts via Drizzle with `returning()` and returns a handle immediately; no generation logic, no polling |
| 2 | A submitted job can be retrieved at any later time showing its current status | VERIFIED | `getAssetJob(db, jobId)` returns the full job row or null |
| 3 | Duplicate idempotency keys are rejected and return the existing job instead of creating a new one | VERIFIED | `submitAssetJob` catches `err.code === '23505'`, queries by `(projectId, idempotencyKey)`, returns `{ duplicate: true }` |
| 4 | Job status transitions are recorded and retrievable (pending -> claimed -> active -> completed/failed/canceled) | VERIFIED | `claimJob` (pending→claimed), `updateJobStatus` (claimed→active), `completeJob`/`failJob`/`cancelJob` all use optimistic concurrency with version increment |
| 5 | Completed or failed jobs retain prompt params, artifact path, output metadata, and failure reason for later review | VERIFIED | schema has `artifactPath`, `outputMetadata` (JSONB), `failureReason`, full prompt params columns; `completeJob` writes all fields |

#### Plan 02 Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 6 | ComfyUI adapter can submit a workflow, poll for completion, and fetch the resulting image | VERIFIED | `createComfyUIExecutor` implements all three `AssetExecutor` methods; 21 passing unit tests with mocked fetch |
| 7 | Artifact writer saves image files and JSON sidecar with full provenance to the correct directory | VERIFIED | `writeArtifact` creates `{artifactsRoot}/{jobId}/`, writes image buffer and `.meta.json` with 2-space indented `ArtifactSidecar`; 8 passing tests |
| 8 | FLUX.2 dev workflow template exists with variable substitution placeholders | VERIFIED | `packages/shared/src/workflows/flux-dev.json` has 7 placeholders: `{{PROMPT}}`, `{{NEGATIVE_PROMPT}}`, `{{SEED}}`, `{{STEPS}}`, `{{WIDTH}}`, `{{HEIGHT}}`, `{{GUIDANCE_SCALE}}`; contains `CLIPTextEncode`, `KSampler`, `SaveImage` nodes |

#### Plan 03 Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 9 | Inngest asset/generate function is registered and discoverable by the Inngest dev server | VERIFIED | `handleAssetGenerate` registered with id `asset/generate`, trigger `asset/generate.requested`, retries: 3; added to `ENGINE_FUNCTIONS` in `inngest-serve.ts` |
| 10 | The function executes the 3-step pipeline: submit-to-comfyui, poll-completion, collect-artifacts | VERIFIED | `generateAssetHandler` runs 3 named `step.run()` calls in sequence; 16 passing unit tests confirm each step's behavior |
| 11 | Job status transitions are recorded as events in the shared events table | VERIFIED | `appendAssetEvent` wraps shared `appendEvent`; events appended at `asset_job_active`, `asset_job_completed`, `asset_job_failed` in `events.ts` |
| 12 | ComfyUI service is available in docker-compose alongside existing services | VERIFIED | `docker-compose.yml` line 68: `comfyui:` with `yanwk/comfyui-boot:latest`, port `8188:8188`, healthcheck; no `profiles:` gate — starts by default with `docker compose up -d` |
| 13 | Generation artifacts directory is gitignored | VERIFIED | `.gitignore` line 25: `.cauldron/` — project-root level entry covers `{projectRoot}/.cauldron/artifacts/` |

**Score: 13/13 truths verified**

---

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `packages/shared/src/db/schema/asset-job.ts` | VERIFIED | Exports `assetJobStatusEnum` (6-value enum inc. `claimed`), `assetJobs` table (22 columns), `AssetJob`, `NewAssetJob`, `AssetOutputMetadata`; composite unique on `(project_id, idempotency_key)` |
| `packages/engine/src/asset/types.ts` | VERIFIED | Exports `AssetJobParams`, `AssetJobHandle`, `AssetOutputMetadata`, `ArtifactSidecar`, `AssetExecutor`, `ExecutorOutputs`, `AssetJobStatus` (includes `claimed`) |
| `packages/engine/src/asset/errors.ts` | VERIFIED | Exports `AssetJobError`, `ComfyUIError`, `DuplicateIdempotencyKeyError` |
| `packages/engine/src/asset/job-store.ts` | VERIFIED | Exports `submitAssetJob`, `claimJob`, `updateJobStatus`, `completeJob`, `failJob`, `cancelJob`, `getAssetJob`, `getAssetJobByIdempotencyKey`, `appendAssetEvent`; imports `appendEvent` from shared; checks `23505` for idempotency |
| `packages/engine/src/asset/__tests__/job-store.test.ts` | VERIFIED | 489 lines, 14 passing tests covering all job-store operations |
| `packages/engine/src/asset/comfyui-adapter.ts` | VERIFIED | `createComfyUIExecutor` factory; POSTs to `/prompt`, GETs `/history/:id`, GETs `/view?filename=...`; implements `AssetExecutor`; loads `flux-dev.json` template once at creation |
| `packages/engine/src/asset/artifact-writer.ts` | VERIFIED | `writeArtifact` with `mkdir({recursive:true})`, two `writeFile` calls, `JSON.stringify(sidecar, null, 2)`, `.meta.json` suffix |
| `packages/shared/src/workflows/flux-dev.json` | VERIFIED | Contains `CLIPTextEncode`, `{{PROMPT}}`, `{{SEED}}` and all 7 variable placeholders; valid JSON (quoted numeric placeholders for safe substitution) |
| `packages/engine/src/asset/__tests__/comfyui-adapter.test.ts` | VERIFIED | 274 lines, 21 passing tests with mocked fetch |
| `packages/engine/src/asset/__tests__/artifact-writer.test.ts` | VERIFIED | 197 lines, 8 passing tests with mocked `node:fs/promises` |
| `packages/engine/src/asset/events.ts` | VERIFIED | `configureAssetDeps`, `generateAssetHandler`, `handleAssetGenerate`; reuses cauldron-engine Inngest client; `NonRetriableError` on timeout; `300_000` (5 min), `3_000` (poll interval); `claimJob` for pending→claimed |
| `packages/engine/src/asset/index.ts` | VERIFIED | Barrel exports all 6 submodule files |
| `packages/engine/src/index.ts` | VERIFIED | Line 9: `export * from './asset/index.js'` |
| `packages/cli/src/inngest-serve.ts` | VERIFIED | `handleAssetGenerate` in imports and in `ENGINE_FUNCTIONS` array (6 functions, was 5) |
| `packages/cli/src/bootstrap.ts` | VERIFIED | `configureAssetDeps` and `createComfyUIExecutor` wired; reads `COMFYUI_URL` env var; `artifactsRoot` set to `{projectRoot}/.cauldron/artifacts` |
| `docker-compose.yml` | VERIFIED | `comfyui:` service with `yanwk/comfyui-boot:latest`, `8188:8188`, GPU device reservations (best-effort), healthcheck, `comfyui_data:` volume; no `profiles:` gate |
| `packages/shared/src/db/migrations/0013_whole_daimon_hellstrom.sql` | VERIFIED | Migration file creates `asset_job_status` enum, `asset_jobs` table; extends `event_type` with 5 new `ALTER TYPE ADD VALUE` statements |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `job-store.ts` | `shared/schema/asset-job.ts` | Drizzle queries on `assetJobs` | WIRED | `import { assetJobs } from '@get-cauldron/shared'`; all CRUD operations use Drizzle query builder on this table |
| `job-store.ts` | `shared/db/event-store.ts` | `appendEvent` call | WIRED | `import { appendEvent } from '@get-cauldron/shared'`; `appendAssetEvent` wraps it correctly |
| `comfyui-adapter.ts` | `asset/types.ts` | implements `AssetExecutor` | WIRED | Return type of `createComfyUIExecutor` satisfies `AssetExecutor`; all 3 methods (`submitJob`, `checkStatus`, `getArtifact`) implemented |
| `comfyui-adapter.ts` | `shared/workflows/flux-dev.json` | `loadWorkflowTemplate` reads via path relative to `import.meta.url` | WIRED | `resolve(__dirname, '../../../shared/src/workflows/flux-dev.json')` loads template at executor creation |
| `artifact-writer.ts` | `asset/types.ts` | writes `ArtifactSidecar` JSON | WIRED | `import type { ArtifactSidecar } from './types.js'`; sidecar parameter typed and written via `JSON.stringify` |
| `events.ts` | `comfyui-adapter.ts` | `createComfyUIExecutor` called in `configureAssetDeps` wiring | WIRED | `bootstrap.ts` creates executor via `createComfyUIExecutor` and passes it to `configureAssetDeps({ executor })` |
| `events.ts` | `job-store.ts` | `claimJob`, `updateJobStatus`, `completeJob`, `failJob`, `appendAssetEvent` | WIRED | All five functions imported and called in `generateAssetHandler` across the 3 steps |
| `cli/inngest-serve.ts` | `engine/asset/events.ts` | `handleAssetGenerate` in `ENGINE_FUNCTIONS` | WIRED | Import confirmed line 10; `ENGINE_FUNCTIONS` array confirmed line 23 |
| `cli/bootstrap.ts` | `engine/asset/events.ts` | `configureAssetDeps({db, logger, executor, artifactsRoot})` | WIRED | Import confirmed line 25-26; call confirmed lines 65-69 |

---

### Data-Flow Trace (Level 4)

The asset pipeline is infrastructure code (Inngest function + DB job store) rather than a UI component that renders dynamic data. The critical data flows are:

| Flow | Source | Produces Real Data | Status |
|------|--------|--------------------|--------|
| `submitAssetJob` → DB insert | Drizzle `.insert(assetJobs).values(...).returning()` | Yes — inserts actual row, returns generated UUID | FLOWING |
| `claimJob` → DB update | Drizzle `.update(assetJobs).set({status:'claimed',...}).where(...)` | Yes — version-gated update with optimistic concurrency | FLOWING |
| `executor.submitJob` → ComfyUI `/prompt` | HTTP POST to configurable `baseUrl` | Yes — returns real `prompt_id` from ComfyUI response | FLOWING (requires live ComfyUI) |
| `writeArtifact` → filesystem | `mkdir` + two `writeFile` calls | Yes — writes real bytes to `{artifactsRoot}/{jobId}/` | FLOWING |
| `completeJob` → DB update | Drizzle `.update(assetJobs).set({status:'completed', artifactPath, outputMetadata,...})` | Yes — stores real artifact path and output metadata | FLOWING |
| Asset events → shared events table | `appendEvent(db, {type:'asset_job_*', ...})` | Yes — real rows in events table, no type filter in SSE route | FLOWING |

No hollow props or disconnected data sources detected.

---

### Behavioral Spot-Checks

| Behavior | Method | Result | Status |
|----------|--------|--------|--------|
| All 14 job-store tests pass | `pnpm exec vitest run src/asset/__tests__/job-store.test.ts` | 14/14 passed | PASS |
| All 16 events (pipeline) tests pass | `pnpm exec vitest run src/asset/__tests__/events.test.ts` | 16/16 passed | PASS |
| All 21 ComfyUI adapter tests pass | `pnpm exec vitest run src/asset/__tests__/comfyui-adapter.test.ts` | 21/21 passed | PASS |
| All 8 artifact writer tests pass | `pnpm exec vitest run src/asset/__tests__/artifact-writer.test.ts` | 8/8 passed | PASS |
| Full typecheck passes | `pnpm typecheck` | 6/6 packages clean | PASS |
| ComfyUI in docker-compose without profiles gate | Check `docker-compose.yml` for `profiles:` | Not found — service starts by default | PASS |

Note: Pre-existing failures in `perspectives.test.ts` (5 tests) and `merge-queue.test.ts` are unrelated to Phase 18 and were present before this phase began (documented in Plan 02 summary).

---

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| ASSET-01 | 18-01, 18-03 | Image generation requests persist as async jobs with queued, running, succeeded, failed, and canceled states | SATISFIED | `assetJobStatusEnum` has 6 states (pending/claimed/active/completed/failed/canceled); Inngest function manages full lifecycle |
| ASSET-02 | 18-01, 18-03 | Initiating generation returns a durable job handle immediately instead of blocking until the image is ready | SATISFIED | `submitAssetJob` returns `{jobId, status, duplicate}` immediately; generation dispatched as Inngest durable job |
| ASSET-03 | 18-02, 18-03 | Generation progress and completion can be observed independently of the initiating CLI or web request | SATISFIED | Asset events appended to shared `events` table; SSE route confirmed (in Plan 03 SSE verification note) to deliver all event types without filtering |
| ASSET-04 | 18-01, 18-02 | Completed jobs persist prompt inputs, output metadata, artifact locations, and failure diagnostics for review and reuse | SATISFIED | `asset_jobs` table has `prompt`, `negativePrompt`, `width`, `height`, `seed`, `steps`, `guidanceScale`, `outputMetadata` (JSONB), `artifactPath`, `failureReason`; `ArtifactSidecar` JSON on disk |
| ASSET-05 | 18-01, 18-03 | Asset jobs support retry and idempotency controls so duplicate calls do not trigger uncontrolled reruns | SATISFIED | `handleAssetGenerate` has `retries: 3` (Inngest); `submitAssetJob` handles `23505` unique constraint for idempotency key dedup; optimistic concurrency (`version` column) prevents duplicate state transitions |

All 5 ASSET requirements claimed across the 3 plans are satisfied. No orphaned requirements detected.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `comfyui-adapter.ts` | 8 | `TODO(phase-19): validate workflow node IDs against running ComfyUI instance` | Info | Intentional — workflow template node IDs need validation against a physical ComfyUI+FLUX.2 install. Phase 19 is dedicated to this validation. Not a blocker for the async pipeline architecture. |

No blockers or warnings. The single TODO is a documented forward-reference for external hardware validation, not a code quality gap.

---

### Human Verification Required

#### 1. End-to-End Generation with Live ComfyUI

**Test:** Start `docker compose up -d`, load a FLUX.2 dev model bundle into ComfyUI, run `cauldron` CLI, trigger an `asset/generate.requested` Inngest event with a valid `jobId` and `projectId`.
**Expected:** The Inngest dashboard shows the 3-step function running; `.cauldron/artifacts/{jobId}/` directory is created with an image file and `.meta.json` sidecar; `asset_jobs` row transitions through `pending → claimed → active → completed`; asset events appear in the SSE stream.
**Why human:** Requires live ComfyUI + GPU + FLUX.2 model weights; cannot run in a static code analysis environment.

#### 2. SSE Stream Delivery of Asset Events

**Test:** Open a browser to the web dashboard, watch the SSE event stream for a project, trigger asset generation.
**Expected:** `asset_job_active`, `asset_job_completed` events appear in real-time in the SSE stream without page refresh.
**Why human:** Requires running Next.js dev server + live Postgres LISTEN/NOTIFY; SSE behavior is real-time and not statically verifiable.

---

### Gaps Summary

No gaps. All 13 observable truths verified, all 9 required artifacts pass all four verification levels (exists, substantive, wired, data-flowing), all 9 key links confirmed wired, all 5 ASSET requirements satisfied with implementation evidence.

---

_Verified: 2026-03-31T17:07:00Z_
_Verifier: Claude (gsd-verifier)_
