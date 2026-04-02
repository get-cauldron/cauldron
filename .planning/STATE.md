---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Architectural Hardening
status: executing
stopped_at: Completed 23-fk-cascade-strategy/23-01-PLAN.md
last_updated: "2026-04-02T01:41:20.239Z"
last_activity: 2026-04-02
progress:
  total_phases: 8
  completed_phases: 1
  total_plans: 4
  completed_plans: 3
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-31)

**Core value:** User describes what they want; Cauldron autonomously designs, decomposes, implements, tests, evaluates, and evolves until the goal is met with humans steering at key decision points.
**Current focus:** Phase 23 — FK Cascade Strategy

## Current Position

Phase: 23 (FK Cascade Strategy) — EXECUTING
Plan: 2 of 2
Status: Ready to execute
Last activity: 2026-04-02

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
| 18-22 (v1.1) | 0 | - | - |

**Recent Trend:**

- Last 5 plans: Historical v1.0 data
- Trend: Reset for new milestone

| Phase 23-fk-cascade-strategy P01 | 25 | 2 tasks | 11 files |

## Accumulated Context

### Decisions

- v1.1 stays local-first: image generation must run against a project-owned, gitignored FLUX.2 dev bundle
- Acquisition must support both import-from-existing ComfyUI and guided upstream download
- Style clarity is a seed-quality concern, so low visual clarity should keep the interview open
- Image generation remains async-only and apps consume it through a local MCP surface
- [Phase 22]: Tests query pg_indexes and information_schema.table_constraints directly to verify DB-level constraint/index existence independent of Drizzle schema state
- [Phase 23-fk-cascade-strategy]: CASCADE for structural FK relationships (seeds/beads/bead_edges/holdout_vault/interviews/snapshots/asset_jobs) and SET NULL for audit relationships (events/llm_usage) — projectId and related FKs
- [Phase 23-fk-cascade-strategy]: Hand-crafted migration required for FK behavior changes — Drizzle db:generate cannot generate DROP+ADD CONSTRAINT pairs

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 19 needs the exact required FLUX.2 artifact map and integrity strategy for guided acquisition
- Phase 20 needs a concrete runtime submission and observation contract for the chosen local execution path
- The runtime bundle must stay subset-only; copying the entire ComfyUI models tree remains out of scope

## Session Continuity

Last session: 2026-04-02T01:41:20.237Z
Stopped at: Completed 23-fk-cascade-strategy/23-01-PLAN.md
Resume file: None
