---
phase: 19-local-image-mcp-app-delivery
plan: 01
subsystem: infra
tags: [mcp, typescript, pino, drizzle, inngest, comfyui, asset-generation]

# Dependency graph
requires:
  - phase: 18-async-asset-engine
    provides: configureAssetDeps, createComfyUIExecutor, inngest client from engine
  - phase: 1-foundation
    provides: db, ensureMigrations, projects table from shared package

provides:
  - "@get-cauldron/mcp workspace package with types, defaults, project detection, bootstrap"
  - "IntendedUse enum mapping semantic use cases to image dimension/step defaults"
  - "findProjectRoot walks filesystem for cauldron.config.ts or .cauldron/ markers"
  - "bootstrapMcp wires asset deps with pino on stderr (stdout reserved for JSON-RPC)"

affects:
  - 19-02  # MCP tool handlers depend on these foundation types
  - 19-03  # MCP server entry point uses bootstrap and project-detector

# Tech tracking
tech-stack:
  added:
    - "@modelcontextprotocol/sdk ^1.29.0 (MCP protocol implementation)"
    - "@get-cauldron/mcp new workspace package"
  patterns:
    - "pino.destination({dest: 2}) for MCP stderr logging — never stdout"
    - "intendedUse enum drives smart image dimension/step defaults"
    - "Project root detection via upward filesystem walk from cwd"

key-files:
  created:
    - packages/mcp/package.json
    - packages/mcp/tsconfig.json
    - packages/mcp/vitest.config.ts
    - packages/mcp/src/types.ts
    - packages/mcp/src/defaults.ts
    - packages/mcp/src/project-detector.ts
    - packages/mcp/src/bootstrap.ts
    - packages/mcp/src/__tests__/defaults.test.ts
    - packages/mcp/src/__tests__/project-detector.test.ts
  modified:
    - pnpm-lock.yaml

key-decisions:
  - "bin field uses string form './dist/index.js' so 'npx @get-cauldron/mcp' resolves to the entry point (per D-06)"
  - "Logger uses pino.destination({dest: 2, sync: false}) — stderr-only, never stdout which is MCP JSON-RPC pipe"
  - "bootstrapMcp only wires asset deps — no LLM gateway, scheduler, vault, or evolution (MCP server is asset-only)"
  - "resolveProjectId falls back to most recently created project when .cauldron/project-id file absent (local dev assumption)"

patterns-established:
  - "MCP package mirrors CLI bootstrap pattern but scoped to asset pipeline only"
  - "IntendedUse defaults follow square roots: icons/avatars at 512, most at 1024, background at 1920x1080"

requirements-completed:
  - MCP-02

# Metrics
duration: 12min
completed: 2026-03-31
---

# Phase 19 Plan 01: MCP Package Foundation Summary

**@get-cauldron/mcp workspace package scaffolded with IntendedUse smart defaults, cauldron project root detection, and stderr-safe bootstrap wiring asset deps to ComfyUI**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-31T21:46:27Z
- **Completed:** 2026-03-31T21:58:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- New `@get-cauldron/mcp` pnpm workspace package linked with `@modelcontextprotocol/sdk` and engine/shared workspace deps
- `IntendedUse` enum with 6 values maps to concrete `width/height/steps` defaults; `composePrompt` prepends style guidance
- `findProjectRoot` walks filesystem upward from cwd finding `cauldron.config.ts` or `.cauldron/` markers
- `bootstrapMcp` wires DB, ComfyUI executor, and `configureAssetDeps` with pino logging explicitly on stderr (fd 2) to preserve stdout for MCP JSON-RPC

## Task Commits

Each task was committed atomically:

1. **Task 1: Create MCP package scaffold with types and defaults** - `89b0b3c` (feat)
2. **Task 2: Create project detector and bootstrap module** - `39efb96` (feat)

## Files Created/Modified

- `packages/mcp/package.json` - Package manifest with `bin: ./dist/index.js` (string form for `npx @get-cauldron/mcp`)
- `packages/mcp/tsconfig.json` - Extends root tsconfig, excludes test files from emit
- `packages/mcp/vitest.config.ts` - Unit test config matching project pattern
- `packages/mcp/src/types.ts` - `IntendedUse`, `GenerateImageInput`, `CheckJobStatusInput`, `GetArtifactInput`, `ListJobsInput`
- `packages/mcp/src/defaults.ts` - `getDefaultsForUse` and `composePrompt` exported functions
- `packages/mcp/src/project-detector.ts` - `findProjectRoot` (filesystem walk) and `resolveProjectId` (DB lookup)
- `packages/mcp/src/bootstrap.ts` - `bootstrapMcp` wiring asset deps with stderr pino logger
- `packages/mcp/src/__tests__/defaults.test.ts` - 12 tests covering all 6 intendedUse values + composePrompt
- `packages/mcp/src/__tests__/project-detector.test.ts` - 7 tests covering both marker types and parent directory walk
- `pnpm-lock.yaml` - Updated with @modelcontextprotocol/sdk dependency

## Decisions Made

- `bin` uses string form `"./dist/index.js"` rather than object form — npm maps package name itself as the command, enabling `npx @get-cauldron/mcp`
- Pino logger uses `pino.destination({ dest: 2, sync: false })` to force output to stderr (fd 2) — stdout is the JSON-RPC transport for MCP stdio and must remain clean
- `bootstrapMcp` deliberately excludes `loadConfig`, `LLMGateway`, `configureSchedulerDeps`, `configureVaultDeps`, `configureEvolutionDeps` — MCP server only needs asset pipeline
- `resolveProjectId` falls back to querying most recently created project when `.cauldron/project-id` file is absent (single-project local dev assumption per research)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Task 2 (MCP tool handlers) can now import `GenerateImageInput`, `IntendedUse`, `getDefaultsForUse`, `composePrompt`, `findProjectRoot`, `bootstrapMcp`
- Task 3 (MCP server entry point) can use `bootstrapMcp` and `findProjectRoot` to initialize the server
- All 19 unit tests pass; typecheck clean

---
*Phase: 19-local-image-mcp-app-delivery*
*Completed: 2026-03-31*
