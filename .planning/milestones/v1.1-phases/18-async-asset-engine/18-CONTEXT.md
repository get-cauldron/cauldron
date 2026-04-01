# Phase 18: Async Asset Engine - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Cauldron gains a durable async job system for local image generation. Jobs persist in PostgreSQL, return handles immediately, support status observation via SSE, and integrate with Inngest for retry and timeout. The execution backend is pluggable, shipping first with a ComfyUI API adapter running in Docker via docker-compose.

This phase does NOT include: MCP surface for apps (Phase 19), operator controls/budgets (Phase 20), style-aware interview changes, or model acquisition tooling.

</domain>

<decisions>
## Implementation Decisions

### Job Lifecycle & States
- **D-01:** Mirror bead status pattern: pending -> claimed -> active -> completed/failed, plus canceled state
- **D-02:** Separate `asset_jobs` table (not reusing beads), but append to the shared `events` table for unified observability across code and asset work
- **D-03:** Canceled jobs are soft-deleted via status column (row preserved for audit trail)
- **D-04:** Add a priority column (default 0) for future use, but process FIFO initially

### Execution Backend
- **D-05:** Pluggable executor interface in TypeScript: `submitJob`, `checkStatus`, `getArtifact` methods. First adapter is ComfyUI API
- **D-06:** ComfyUI runs as a Docker container added to docker-compose.yml alongside Postgres/Redis/Inngest — always-on when dev infra is up
- **D-07:** Cauldron expects ComfyUI available at a configured URL (the docker-compose service). No dynamic process management

### ComfyUI Workflow Contract
- **D-08:** Default FLUX.2 dev workflow shipped as a JSON template with variable substitution (prompt, seed, dimensions, steps, guidance)
- **D-09:** Workflow template lives in `packages/shared/src/workflows/flux-dev.json` — accessible to engine and CLI

### Artifact Storage
- **D-10:** Generated images stored in project-local `.cauldron/artifacts/{jobId}/` directory (gitignored)
- **D-11:** Each artifact gets a JSON sidecar file with full provenance: prompt, model, seed, generation params, timestamp, job ID, executor adapter used
- **D-12:** No automatic cleanup — artifacts persist until operator manually removes them

### Observability & Progress
- **D-13:** DB status transitions drive observability. Leverage existing Postgres LISTEN/NOTIFY -> SSE pipeline (already built for bead status) to stream asset job updates to the dashboard

### Job Submission API Shape
- **D-14:** Minimal required fields: `projectId`, `prompt`. Optional: `negativePrompt`, `width`, `height`, `seed`, `steps`, `guidanceScale`, `idempotencyKey`. Extensible via JSONB `extras` column

### Retry & Idempotency
- **D-15:** Use Inngest built-in retry via `step.run()` with exponential backoff (max 3 attempts, configurable)
- **D-16:** Client-provided idempotency key. Duplicate keys within a window are rejected at submission time
- **D-17:** Configurable generation timeout with 5-minute default. Jobs exceeding timeout transition to failed with timeout reason

### Inngest Function Design
- **D-18:** Dedicated `asset/generate` Inngest function on the `cauldron-engine` client. Steps: submit-to-ComfyUI, poll-completion, artifact-collection
- **D-19:** New `packages/engine/src/asset/` submodule following established module pattern (types.ts, executor interface, ComfyUI adapter, events, __tests__/)

### Claude's Discretion
- Exact ComfyUI Docker image selection and configuration
- Internal polling interval for ComfyUI job completion within the Inngest step
- Error classification (transient vs permanent) for retry decisions
- JSONB `extras` schema shape for extensibility

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Patterns to Follow
- `packages/shared/src/db/schema/bead.ts` — Reference for status lifecycle pattern to mirror
- `packages/shared/src/db/schema/` — All schema files for table conventions (uuid PK, timestamps, enums)
- `packages/engine/src/execution/` — Bead execution module as architectural parallel (runner, events, handler)
- `packages/engine/src/holdout/events.ts` — Inngest function registration pattern for `cauldron-engine` client

### Integration Points
- `packages/cli/src/inngest-serve.ts` — Where new Inngest functions get registered on the Hono server
- `packages/web/src/app/api/events/[projectId]/route.ts` — SSE endpoint that will need to include asset job events
- `packages/web/src/inngest/client.ts` — Web-side Inngest client (may need event type additions)
- `docker-compose.yml` — Where ComfyUI service will be added

### Conventions
- `.planning/codebase/CONVENTIONS.md` — Naming, module structure, import patterns
- `.planning/codebase/ARCHITECTURE.md` — System overview, entity relationships, lifecycle states

No external specs — ComfyUI API is documented at the ComfyUI project but no local spec files exist.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Bead status enum and lifecycle transitions — pattern to mirror for asset_jobs
- Event store (append/replay/snapshot) — shared event stream for asset job events
- Postgres LISTEN/NOTIFY -> SSE pipeline — reuse for asset job status streaming
- Inngest `step.run()` / `step.waitForEvent()` patterns — proven durable execution
- Drizzle migration infrastructure — for new asset_jobs table

### Established Patterns
- Engine submodule structure: types.ts, primary logic, helpers, errors.ts, __tests__/
- Factory functions: `create*` prefix for module initialization
- Drizzle pgEnums for status columns
- JSONB columns for flexible metadata (see project.settings, bead.metadata)
- Optimistic concurrency via version column (bead claiming pattern)

### Integration Points
- CLI Hono server (:3001) serves engine Inngest functions — new asset function registers here
- docker-compose.yml defines dev infrastructure — ComfyUI service added here
- Web tRPC routers — may need an asset router for dashboard integration (Phase 19+ concern)

</code_context>

<specifics>
## Specific Ideas

- ComfyUI as docker-compose service means generation is available whenever `docker compose up -d` runs — same developer experience as Postgres/Redis
- The pluggable executor interface should be clean enough that a diffusers-based Python adapter could slot in later without changing the job system
- Provenance JSON sidecars make artifacts self-describing even outside Cauldron (e.g., if someone browses the artifacts directory directly)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 18-async-asset-engine*
*Context gathered: 2026-03-31*
