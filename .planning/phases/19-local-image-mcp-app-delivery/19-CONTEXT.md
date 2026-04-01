# Phase 19: Local Image MCP & App Delivery - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Cauldron exposes its async asset generation system (built in Phase 18) through a stable MCP (Model Context Protocol) tool surface. Apps and build agents can submit structured asset requests, check job status, retrieve artifacts, and receive completed images delivered to their workspace — all without coupling directly to ComfyUI.

This phase does NOT include: operator controls or budgets (Phase 20), style-aware interview changes, model acquisition tooling, or dashboard UI for asset management.

</domain>

<decisions>
## Implementation Decisions

### MCP Server Architecture
- **D-01:** Standalone stdio MCP server process — not embedded in CLI Hono server. Launched by clients (Claude Code, Cursor, etc.) via their MCP configuration
- **D-02:** New `@get-cauldron/mcp` package in the monorepo. Depends on engine + shared. Has its own bin entry for stdio launch
- **D-03:** Uses `@modelcontextprotocol/sdk` (official MCP TypeScript SDK) for protocol framing, tool registration, and JSON-RPC transport
- **D-04:** MCP server imports engine functions directly (submitAssetJob, getAssetJob, etc.) and the shared DB layer — calls through engine API, not HTTP to CLI server. Requires bootstrap wiring similar to how CLI does it
- **D-05:** Requires Inngest dev server running for generation. MCP sends Inngest events to trigger generation (same flow as CLI/web)
- **D-06:** Registered as `npx @get-cauldron/mcp` (or `pnpm` equivalent) bin entry for MCP client configuration
- **D-07:** Auto-detects project from cwd — scans upward for project markers (cauldron.config.ts, .cauldron/). Resolves projectId from DB. Falls back to error if not in a Cauldron project

### MCP Tools
- **D-08:** Four MCP tools exposed: `generate-image`, `check-job-status`, `get-artifact`, `list-jobs`
- **D-09:** `generate-image` — submits async generation, returns job handle immediately
- **D-10:** `check-job-status` — returns status enum, timestamps, and estimated progress (based on elapsed time vs typical generation time)
- **D-11:** `get-artifact` — returns file path + provenance metadata, with optional base64 image data if client requests it via a flag
- **D-12:** `list-jobs` — returns last 50 jobs across all projects by default, filterable by status, with project name in each result. Simple offset pagination

### MCP Notification Resource
- **D-13:** Expose an MCP resource for job status subscriptions. Clients that support resource subscriptions can watch for status changes instead of polling

### Asset Request Contract
- **D-14:** Extended request fields beyond Phase 18 base: `styleGuidance` (free-text style direction), `referenceImages` (array of file paths), `intendedUse` (enum: hero-image, icon, texture, avatar, background, other), `destination` (target delivery path)
- **D-15:** `styleGuidance` is a separate field composed into the prompt by the MCP layer (prepend/append). Both values stored separately in provenance for clean content/style separation
- **D-16:** Smart defaults from `intendedUse` — e.g., icon → 512x512 + higher steps, hero-image → 1024x768 + standard steps. User can override any default

### Artifact Delivery
- **D-17:** Copy-based delivery — completed image copied from `.cauldron/artifacts/{jobId}/` to destination path. Both copies exist; artifact dir is source of truth, destination is the deliverable
- **D-18:** Provenance JSON sidecar stays in `.cauldron/artifacts/{jobId}/` only — not copied to destination. Keeps destination clean
- **D-19:** Create destination directory recursively (mkdir -p) if it doesn't exist
- **D-20:** Delivery happens automatically when a job with a destination completes — the Inngest function's collect-artifacts step also copies to destination. No second call needed

### Claude's Discretion
- MCP tool description text and parameter descriptions (should be clear enough for LLM tool-use)
- Exact style composition strategy (prepend vs append vs template)
- Estimated progress calculation method (simple elapsed/typical ratio is fine)
- Internal polling interval for estimated progress
- Resource subscription implementation details for notification

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 18 Asset System (dependency)
- `packages/engine/src/asset/types.ts` — AssetExecutor interface, AssetJobParams, ArtifactSidecar types
- `packages/engine/src/asset/job-store.ts` — submitAssetJob, getAssetJob, claimJob, completeJob, failJob, cancelJob
- `packages/engine/src/asset/events.ts` — Inngest handleAssetGenerate function, configureAssetDeps
- `packages/engine/src/asset/artifact-writer.ts` — writeArtifact function
- `packages/engine/src/asset/comfyui-adapter.ts` — createComfyUIExecutor factory
- `packages/shared/src/db/schema/asset-job.ts` — asset_jobs table schema

### Integration Points
- `packages/cli/src/bootstrap.ts` — Bootstrap pattern for wiring engine deps (reference for MCP bootstrap)
- `packages/cli/src/inngest-serve.ts` — Inngest function registration pattern
- `packages/shared/src/db/schema/index.ts` — Schema exports
- `packages/engine/src/asset/index.ts` — Asset module barrel export

### Conventions
- `.planning/codebase/CONVENTIONS.md` — Naming, module structure, import patterns
- `.planning/codebase/ARCHITECTURE.md` — System overview, entity relationships

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 18 job-store functions (submitAssetJob, getAssetJob, etc.) — direct import for MCP tool handlers
- Phase 18 artifact-writer (writeArtifact) — reuse for delivery, extend for destination copy
- Bootstrap pattern from CLI (configureAssetDeps) — mirror for MCP server startup
- Inngest event sending pattern — reuse for triggering generation from MCP

### Established Patterns
- Engine submodule structure: types.ts, primary logic, helpers, errors.ts, __tests__/
- Factory functions: `create*` prefix for module initialization
- Drizzle ORM queries for DB access
- Zod schemas for input validation

### Integration Points
- MCP server needs its own bootstrap to wire DB, logger, Inngest client, and asset deps
- delivery feature needs to hook into the Inngest collect-artifacts step (extend events.ts or add post-completion handler)
- Project auto-detection needs to query projects table by matching cwd markers

</code_context>

<specifics>
## Specific Ideas

- The MCP server should feel like a first-class Cauldron tool — clean tool descriptions that LLMs can understand and use effectively
- Smart defaults from intendedUse make it easy for agents to request "give me an icon" without knowing optimal generation params
- Resource subscriptions for job status are forward-looking — not all MCP clients support them yet, but the infrastructure should be there
- Auto-detection from cwd matches how developers actually work — you're in a project directory, tools should just know

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 19-local-image-mcp-app-delivery*
*Context gathered: 2026-03-31*
