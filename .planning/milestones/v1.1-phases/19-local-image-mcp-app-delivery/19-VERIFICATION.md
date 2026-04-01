---
phase: 19-local-image-mcp-app-delivery
verified: 2026-03-31T22:26:00Z
status: passed
score: 10/10 must-haves verified
re_verification: false
---

# Phase 19: Local Image MCP App Delivery — Verification Report

**Phase Goal:** Apps and build agents consume local asset generation through a stable MCP contract and receive deliverable artifacts with provenance.
**Verified:** 2026-03-31T22:26:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Plans 01 + 02 + 03 combined)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | MCP package exists as a valid pnpm workspace member with correct dependencies | ✓ VERIFIED | `packages/mcp/package.json` has `@get-cauldron/mcp`, bin, all workspace deps; `pnpm-workspace.yaml` includes `packages/*` |
| 2 | intendedUse enum maps to concrete width/height/steps defaults that downstream tools consume | ✓ VERIFIED | `defaults.ts` exports `getDefaultsForUse` with all 6 cases; generate-image.ts calls it; generate-image.test.ts verifies icon=512×512×30 |
| 3 | Project root detection walks upward from cwd and finds cauldron.config.ts or .cauldron/ | ✓ VERIFIED | `project-detector.ts` lines 24–35 walk filesystem with both marker checks; 7 passing unit tests |
| 4 | Bootstrap wires DB, logger, executor, artifactsRoot, and Inngest client identically to CLI bootstrap | ✓ VERIFIED | `bootstrap.ts` calls `ensureMigrations`, `createComfyUIExecutor`, `configureAssetDeps`; pino on fd 2 (stderr) |
| 5 | Asset jobs can be listed with optional status filter and pagination | ✓ VERIFIED | `listAssetJobs` in `job-store.ts` with innerJoin, orderBy desc, limit/offset; 5 passing tests |
| 6 | Completed jobs with a destination in extras automatically copy the image to that path | ✓ VERIFIED | `events.ts` lines 219–227: extracts `extras.destination`, mkdir+copyFile; 3 passing tests (Tests 16–18) |
| 7 | Provenance sidecar is NOT copied to destination | ✓ VERIFIED | `copyFile` called once (image only); events.test.ts Test 17 asserts `copyFile` called exactly once with destination as target (not `.meta.json`) |
| 8 | MCP server starts on stdio transport and responds to tool/list and tool/call requests | ✓ VERIFIED | `index.ts` uses `StdioServerTransport` + `server.connect(transport)`; `createMcpServer` registers all 4 tools; dist/index.js has shebang, passes syntax check |
| 9 | generate-image tool returns a job handle with jobId and status immediately without blocking | ✓ VERIFIED | `handleGenerateImage` calls `submitAssetJob` (returns handle), fires `inngest.send`, returns immediately; 7 passing unit tests |
| 10 | get-artifact returns file path and provenance metadata, optionally with base64 image data | ✓ VERIFIED | `get-artifact.ts` reads dir, excludes `.meta.json`, reads sidecar, builds response with filePath + provenance; base64 conditional at line 101 |

**Score:** 10/10 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/mcp/package.json` | Package manifest with bin and workspace deps | ✓ VERIFIED | `"bin": "./dist/index.js"` (string form), `@modelcontextprotocol/sdk ^1.29.0`, workspace deps present |
| `packages/mcp/src/types.ts` | MCP-layer input types and intendedUse enum | ✓ VERIFIED | Exports `INTENDED_USES`, `IntendedUse`, `GenerateImageInput`, `CheckJobStatusInput`, `GetArtifactInput`, `ListJobsInput` |
| `packages/mcp/src/defaults.ts` | Smart defaults from intendedUse | ✓ VERIFIED | Exports `getDefaultsForUse` (6 cases + default) and `composePrompt` |
| `packages/mcp/src/project-detector.ts` | Project root detection from cwd | ✓ VERIFIED | Exports `findProjectRoot` and `resolveProjectId`; both marker checks present |
| `packages/mcp/src/bootstrap.ts` | MCP server dependency wiring | ✓ VERIFIED | Exports `bootstrapMcp`; calls `ensureMigrations`, `configureAssetDeps`, pino to fd 2 |
| `packages/engine/src/asset/job-store.ts` | listAssetJobs query function | ✓ VERIFIED | Exports `listAssetJobs`, `ListAssetJobsOptions`, `AssetJobWithProject` with innerJoin and pagination |
| `packages/engine/src/asset/events.ts` | Extended collect-artifacts with destination copy | ✓ VERIFIED | Contains `extras.destination` extraction, `mkdir`, `copyFile` — sidecar excluded |
| `packages/mcp/src/server.ts` | MCP server factory with all tools registered | ✓ VERIFIED | Exports `createMcpServer`; registers all 4 tools + job-status resource |
| `packages/mcp/src/index.ts` | Entry point bootstraps and connects to stdio | ✓ VERIFIED | `#!/usr/bin/env node` shebang, `StdioServerTransport`, no `console.log` calls |
| `packages/mcp/src/tools/generate-image.ts` | generate-image MCP tool handler | ✓ VERIFIED | Exports `registerGenerateImageTool` + `handleGenerateImage`; calls `submitAssetJob` and `inngest.send` |
| `packages/mcp/src/tools/check-job-status.ts` | check-job-status MCP tool handler | ✓ VERIFIED | Exports `registerCheckJobStatusTool` + `handleCheckJobStatus`; elapsed-based progress with 95% cap |
| `packages/mcp/src/tools/get-artifact.ts` | get-artifact MCP tool handler | ✓ VERIFIED | Exports `registerGetArtifactTool`; readdir + .meta.json exclusion; sidecar read; optional base64 |
| `packages/mcp/src/tools/list-jobs.ts` | list-jobs MCP tool handler | ✓ VERIFIED | Exports `registerListJobsTool`; calls `listAssetJobs`; truncates prompt to 80 chars |
| `packages/mcp/src/resources/job-status.ts` | MCP resource for job status subscriptions | ✓ VERIFIED | Exports `registerJobStatusResource` + `notifyJobStatusChanged`; uses `ResourceTemplate` with `cauldron://jobs/{jobId}/status` |
| `packages/mcp/dist/index.js` | Compiled bin entry point | ✓ VERIFIED | Exists, has shebang, passes Node.js syntax check |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/mcp/src/bootstrap.ts` | `packages/engine/src/asset/events.ts` | `configureAssetDeps()` call | ✓ WIRED | Line 57: `configureAssetDeps({ db, logger, executor, artifactsRoot })` |
| `packages/mcp/src/bootstrap.ts` | `packages/shared/src/db/client.ts` | `ensureMigrations` import | ✓ WIRED | Line 14: `import { db, ensureMigrations } from '@get-cauldron/shared'`; line 45: `await ensureMigrations()` |
| `packages/engine/src/asset/events.ts` | `node:fs/promises` | `copyFile + mkdir` for destination delivery | ✓ WIRED | Line 2: `import { copyFile, mkdir } from 'node:fs/promises'`; lines 222–224: `mkdir` + `copyFile` called |
| `packages/engine/src/asset/job-store.ts` | `packages/shared/src/db/schema/asset-job.ts` | Drizzle query on assetJobs | ✓ WIRED | `assetJobs` imported from `@get-cauldron/shared`; `listAssetJobs` queries it with innerJoin |
| `packages/mcp/src/tools/generate-image.ts` | `packages/engine/src/asset/job-store.ts` | `submitAssetJob()` call | ✓ WIRED | Line 3: import; line 40: `await submitAssetJob(...)` |
| `packages/mcp/src/tools/generate-image.ts` | Inngest | `inngest.send()` for `asset/generate.requested` | ✓ WIRED | Line 63: `await deps.inngest.send({ name: 'asset/generate.requested', ... })` |
| `packages/mcp/src/tools/list-jobs.ts` | `packages/engine/src/asset/job-store.ts` | `listAssetJobs()` call | ✓ WIRED | Line 3: `import { listAssetJobs } from '@get-cauldron/engine'`; line 30: `await listAssetJobs(...)` |
| `packages/mcp/src/index.ts` | `packages/mcp/src/bootstrap.ts` | `bootstrapMcp()` call | ✓ WIRED | Line 4: import; line 19: `await bootstrapMcp(projectRoot)` |
| `packages/mcp/src/server.ts` | All 4 tool handlers + resource | `register*Tool/Resource` calls | ✓ WIRED | Lines 23–27: all 5 register calls in `createMcpServer` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `generate-image.ts` handler | `handle` (job handle) | `submitAssetJob` → DB INSERT | Real DB insert via Drizzle + idempotency | ✓ FLOWING |
| `list-jobs.ts` handler | `results` (job list) | `listAssetJobs` → DB SELECT with innerJoin | Real DB query, ordered, paginated | ✓ FLOWING |
| `check-job-status.ts` handler | `job` (job row) | `getAssetJob` → DB SELECT by ID | Real DB query returning full row | ✓ FLOWING |
| `get-artifact.ts` handler | `imageFilename`, `provenance` | `readdir` + `readFile` from artifact path stored in DB | Real filesystem reads from DB-backed artifact path | ✓ FLOWING |
| `events.ts` collect-artifacts | `destination` | `job.extras.destination` from DB row | Extracted from real job record; `copyFile` writes to real path | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| MCP package tests pass (34 tests) | `pnpm -F @get-cauldron/mcp test` | 34 passed, 4 test files | ✓ PASS |
| Asset job-store tests pass (includes listAssetJobs) | `vitest run src/asset/__tests__/job-store.test.ts` | 38 passed | ✓ PASS |
| Asset events tests pass (includes destination delivery) | `vitest run src/asset/__tests__/events.test.ts` | 38 passed | ✓ PASS |
| dist/index.js is valid Node.js with shebang | `node --check dist/index.js` | exit 0 | ✓ PASS |
| defaults module exports correct functions | `node -e "require('./dist/defaults.js')"` | `function function` | ✓ PASS |
| Engine asset module exports `listAssetJobs` | `engine/src/asset/index.ts` re-exports `job-store.js` | Confirmed in `asset/index.ts` | ✓ PASS |

Note: The engine test suite has 5 pre-existing failures in `perspectives.test.ts` (4 failures) and `merge-queue.test.ts` (1 failure) — both documented in 19-02-SUMMARY.md as pre-existing and out-of-scope for this phase.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MCP-01 | Plan 03 | Cauldron exposes a local image-generation MCP surface backed by the project-owned FLUX.2 dev runtime | ✓ SATISFIED | `@get-cauldron/mcp` package with `McpServer`, 4 tools, `StdioServerTransport`, connects to ComfyUI via engine |
| MCP-02 | Plans 01, 03 | Apps and build agents can request assets with structured inputs including prompt, style guidance, references, aspect/size, destination, and intended use | ✓ SATISFIED | `GenerateImageInput` in types.ts covers all fields; generate-image tool schema exposes all via Zod; `intendedUse`, `styleGuidance`, `destination`, `referenceImages` all wired |
| MCP-03 | Plans 02, 03 | MCP responses return job identifiers and retrieval handles suitable for async workflows | ✓ SATISFIED | generate-image returns `{ jobId, status, duplicate }`; check-job-status returns timestamps + progress; list-jobs returns paginated handles; get-artifact returns filePath + provenance |
| MCP-04 | Plans 02, 03 | Completed generations can be written into the target app workspace or a declared artifact directory with provenance metadata attached | ✓ SATISFIED | `extras.destination` delivery in collect-artifacts step; sidecar `.meta.json` written to artifact dir; get-artifact returns provenance sidecar; destination dir created recursively |

All 4 requirements are satisfied. No orphaned requirements found — all MCP-01 through MCP-04 were claimed across Plans 01–03 and all have implementation evidence.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `index.ts` line 43 | Comment text contains "console.log" | ℹ️ Info | None — this is a warning comment, not an actual call. No `console.log(...)` call exists in any MCP source file. |

No blocker or warning anti-patterns found. All tool handlers return real content, all data flows are wired, no placeholder returns.

---

### Human Verification Required

#### 1. End-to-End MCP Client Interaction

**Test:** Configure a real MCP client (Claude Desktop or similar) with `npx @get-cauldron/mcp` as the server. Call `generate-image` with `{ "prompt": "a red circle", "intendedUse": "icon" }`.
**Expected:** Client receives a JSON response with `jobId` and `status: "pending"` within ~2 seconds. `check-job-status` returns increasing `estimatedProgress`. After ComfyUI completes, `get-artifact` returns a `filePath` pointing to an actual PNG and a provenance sidecar.
**Why human:** Requires running ComfyUI + Inngest dev server + live MCP client. Cannot verify the stdio JSON-RPC framing or ComfyUI integration programmatically in a static check.

#### 2. Destination Delivery End-to-End

**Test:** Call `generate-image` with `{ "prompt": "test", "destination": "/tmp/cauldron-test/output.png" }`. After job completes, check that `/tmp/cauldron-test/output.png` exists and `/tmp/cauldron-test/output.png.meta.json` does NOT exist.
**Expected:** Image file present at destination; no sidecar at destination; sidecar still present in `.cauldron/artifacts/{jobId}/`.
**Why human:** Requires live ComfyUI + Inngest processing pipeline.

#### 3. stderr-only Logging in stdio Transport

**Test:** Start the MCP server with a known-invalid project root to force an early error. Capture both stdout and stderr separately.
**Expected:** Error message appears only on stderr; stdout remains empty (or contains only valid JSON-RPC framing).
**Why human:** Requires OS-level stream capture to verify stdout purity.

---

### Gaps Summary

No gaps. All phase artifacts are present, substantive, wired, and data flows are connected. The three items above require human verification with a running ComfyUI environment but represent integration behavior rather than code gaps.

---

_Verified: 2026-03-31T22:26:00Z_
_Verifier: Claude (gsd-verifier)_
