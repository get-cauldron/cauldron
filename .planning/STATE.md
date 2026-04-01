---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Local Asset Generation & Style-Aware Seeds
status: executing
stopped_at: Completed 19-02-PLAN.md
last_updated: "2026-04-01T03:52:54.674Z"
last_activity: 2026-04-01
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 6
  completed_plans: 5
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-31)

**Core value:** User describes what they want; Cauldron autonomously designs, decomposes, implements, tests, evaluates, and evolves until the goal is met with humans steering at key decision points.
**Current focus:** Phase 19 — local-image-mcp-app-delivery

## Current Position

Phase: 19 (local-image-mcp-app-delivery) — EXECUTING
Plan: 3 of 3
Status: Ready to execute
Last activity: 2026-04-01

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 65 (v1.0 shipped)
- Average duration: Historical v1.0 data preserved in archived phase summaries
- Total execution time: Historical v1.0 data preserved in archived phase summaries

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1-17 (v1.0) | 65 | Historical | Historical |
| 18-20 (v1.1) | 0 | - | - |

**Recent Trend:**

- Last 5 plans: Historical v1.0 data
- Trend: Reset for new milestone

| Phase 18 P01 | 17 | 2 tasks | 8 files |
| Phase 18-async-asset-engine P02 | 8 | 2 tasks | 5 files |
| Phase 18-async-asset-engine P03 | 1010 | 2 tasks | 10 files |
| Phase 19-local-image-mcp-app-delivery P01 | 12 | 2 tasks | 10 files |
| Phase 19 P02 | 317 | 2 tasks | 4 files |

## Accumulated Context

### Decisions

- v1.1 stays local-first: image generation must run against a project-owned, gitignored FLUX.2 dev bundle
- Image generation remains async-only and apps consume it through a local MCP surface
- [Phase 18]: AssetOutputMetadata defined in schema file to avoid circular dependency between shared and engine packages
- [Phase 18]: Migration uses ALTER TYPE ADD VALUE for event_type enum extension — no drop/recreate, safe for existing DB
- [Phase 18-async-asset-engine]: Template path resolved relative to file location via fileURLToPath + resolve, not require.resolve (simpler, no package boundary needed)
- [Phase 18-async-asset-engine]: Numeric placeholders are quoted in JSON template and become unquoted after string replacement, preserving ComfyUI type expectations
- [Phase 18-async-asset-engine]: Reused cauldron-engine Inngest client from holdout/events.ts to avoid multiple client instances
- [Phase 18-async-asset-engine]: ComfyUI docker service has no profiles gate so it starts by default with docker compose up -d (D-06)
- [Phase 19-local-image-mcp-app-delivery]: bin field uses string form in MCP package.json so 'npx @get-cauldron/mcp' resolves to entry point without named key (per D-06)
- [Phase 19-local-image-mcp-app-delivery]: bootstrapMcp uses pino.destination({dest: 2}) for stderr-only logging — stdout is reserved as MCP JSON-RPC transport pipe
- [Phase 19-local-image-mcp-app-delivery]: bootstrapMcp only wires asset deps (no LLM gateway, scheduler, vault, evolution) — MCP server is asset-only
- [Phase 19]: listAssetJobs applies where clause before limit/offset to match Drizzle chain ordering — avoids TypeError on resolved query

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 18 needs a concrete runtime submission and observation contract for the chosen local execution path

## Session Continuity

Last session: 2026-04-01T03:52:54.672Z
Stopped at: Completed 19-02-PLAN.md
Resume file: None
