---
phase: 19-local-image-mcp-app-delivery
plan: "03"
subsystem: mcp
tags: [mcp, asset-generation, stdio, tools, resources]
dependency_graph:
  requires:
    - 19-01  # types, defaults, project-detector, bootstrap
    - 19-02  # listAssetJobs
  provides:
    - complete @get-cauldron/mcp package with all 4 tools and stdio entry point
  affects:
    - packages/mcp (primary deliverable)
tech_stack:
  added:
    - "@modelcontextprotocol/sdk McpServer + StdioServerTransport"
  patterns:
    - "register*Tool(server, deps) pattern for testable tool handlers"
    - "handleXxx(params, deps) extracted for unit-testable handler bodies"
    - "readdir + .meta.json exclusion for image filename discovery"
key_files:
  created:
    - packages/mcp/src/tools/generate-image.ts
    - packages/mcp/src/tools/check-job-status.ts
    - packages/mcp/src/tools/get-artifact.ts
    - packages/mcp/src/tools/list-jobs.ts
    - packages/mcp/src/resources/job-status.ts
    - packages/mcp/src/server.ts
    - packages/mcp/src/index.ts
    - packages/mcp/src/__tests__/generate-image.test.ts
    - packages/mcp/src/__tests__/check-job-status.test.ts
  modified: []
decisions:
  - "Extracted handleGenerateImage and handleCheckJobStatus as exported functions to enable unit testing without needing McpServer instance"
  - "Used readdir + filter(not .meta.json) pattern to find image filename without hardcoding ComfyUI output names"
  - "notifyJobStatusChanged uses (server as unknown as {...}) cast instead of (server as any) for stricter TypeScript"
metrics:
  duration_seconds: 420
  completed_date: "2026-04-01"
  tasks_completed: 2
  files_created: 9
  files_modified: 0
---

# Phase 19 Plan 03: MCP Server — Tools, Resource, and Entry Point Summary

**One-liner:** Complete @get-cauldron/mcp package with four MCP tools (generate-image, check-job-status, get-artifact, list-jobs), job-status resource subscription, stdio entry point, and 34 passing unit tests.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create MCP tool handlers, resource, server factory, and entry point | e39c161 | 7 files created |
| 2 | Create unit tests for tool handlers and run full regression | f6ff563 | 2 test files created |

## What Was Built

### Tool Handlers

**generate-image** (`packages/mcp/src/tools/generate-image.ts`): Submits async image generation jobs. Calls `submitAssetJob` to create a DB record, then fires `asset/generate.requested` via Inngest. Applies `getDefaultsForUse` for smart dimension/step defaults based on `intendedUse`. Stores `styleGuidance`, `originalPrompt`, `destination`, and `referenceImages` in job extras for provenance. Returns job handle immediately with duplicate detection.

**check-job-status** (`packages/mcp/src/tools/check-job-status.ts`): Returns status, timestamps, artifact path, and estimated progress. Completed jobs return 100%, failed/canceled return null, active/pending jobs compute `min(95, elapsed_ms / 120_000 * 100)`.

**get-artifact** (`packages/mcp/src/tools/get-artifact.ts`): Reads the artifact directory, finds the image file by excluding `.meta.json` sidecar files, reads and parses the provenance sidecar, returns file path and metadata. Optionally base64-encodes the image when `includeBase64` is true.

**list-jobs** (`packages/mcp/src/tools/list-jobs.ts`): Wraps `listAssetJobs` with project name join. Maps results to a compact shape with prompt truncated to 80 chars.

### Resource

**job-status** (`packages/mcp/src/resources/job-status.ts`): Registers `cauldron://jobs/{jobId}/status` resource template. `notifyJobStatusChanged` is exported for callers to push update notifications after job state transitions.

### Server Factory

**createMcpServer** (`packages/mcp/src/server.ts`): Creates McpServer instance, registers all four tools and the resource. Returns server for connection by the entry point.

### Entry Point

**index.ts** (`packages/mcp/src/index.ts`): Stdio MCP server entry point with `#!/usr/bin/env node` shebang. Auto-detects project root via `findProjectRoot`, bootstraps DB/logger/inngest, resolves project ID, checks Inngest health (non-blocking warning), creates server, connects to StdioServerTransport. All logging goes to stderr — stdout is reserved for JSON-RPC.

### Tests

**generate-image.test.ts**: 7 tests covering icon defaults, styleGuidance composition, destination in extras, originalPrompt tracking, inngest.send call, duplicate flag, and dimension overrides.

**check-job-status.test.ts**: 7 tests covering completed (100%), failed (null), canceled (null), active (elapsed-based), capped at 95%, and not-found cases.

## Verification Results

- `pnpm -F @get-cauldron/mcp test` — 34 tests passing (4 test files)
- `pnpm -F @get-cauldron/mcp typecheck` — 0 type errors
- `pnpm -F @get-cauldron/mcp build` — builds to dist/index.js
- `pnpm typecheck` — all 7 packages pass
- `pnpm build` — full monorepo builds successfully
- `pnpm test` — MCP and engine unit tests pass (shared integration tests skip: require Docker :5433 not running — pre-existing)

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Notes

- The `(server as any)` cast in job-status.ts was changed to `(server as unknown as {...})` for stricter TypeScript compliance (Rule 2 — correctness).
- Shared package test failures (`pnpm test` aggregate run) are pre-existing integration test failures requiring Docker Postgres on :5433, unrelated to this plan's changes.

## Self-Check: PASSED

Files created:
- packages/mcp/src/tools/generate-image.ts — FOUND
- packages/mcp/src/tools/check-job-status.ts — FOUND
- packages/mcp/src/tools/get-artifact.ts — FOUND
- packages/mcp/src/tools/list-jobs.ts — FOUND
- packages/mcp/src/resources/job-status.ts — FOUND
- packages/mcp/src/server.ts — FOUND
- packages/mcp/src/index.ts — FOUND
- packages/mcp/src/__tests__/generate-image.test.ts — FOUND
- packages/mcp/src/__tests__/check-job-status.test.ts — FOUND

Commits:
- e39c161 — FOUND
- f6ff563 — FOUND
