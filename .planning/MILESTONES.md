# Project Milestones: Cauldron

## v1.1 Local Asset Generation & Style-Aware Seeds (Shipped: 2026-04-01)

**Phases completed:** 4 phases, 9 plans, 16 tasks

**Delivered:** Durable async image generation with local FLUX.2 dev runtime, MCP tool surface for apps and build agents, operator controls, and end-to-end pipeline verification.

**Key accomplishments:**

- Durable async asset job system with 6-state lifecycle, ComfyUI HTTP adapter, artifact writer with provenance sidecars, and Inngest orchestration
- Local image MCP server (`@get-cauldron/mcp`) exposing 4 tools for apps and build agents to request, track, and retrieve generated assets
- Operator controls for asset mode (active/paused/disabled), concurrency limits, and CLI config surface with deep-merge settings
- E2E pipeline verification proving style capture → seed → async generation → artifact delivery with `cauldron verify assets` CLI command
- Integration polish closing 4 audit gaps: event emission, MCP push notification callbacks, guidance_scale float column, robust template path resolution

**Stats:**
- 4 phase directories completed (18-21)
- 9 plans completed, 16 tasks
- 72 files changed, 9,937 insertions(+), 109 deletions(-)
- Timeline: 2 days (2026-03-31 → 2026-04-01)

**Git range:** `feat(18-01)` → `docs(v1.1)`

**Tech debt carried forward:** MCP push notification path is code-correct but structurally unreachable (Inngest and MCP stdio run in separate processes) — deferred to v1.2.

**What's next:** v1.2 — style-aware interview, model acquisition UX, advanced image workflows.

---

## v1.0 End-to-End Autonomous Builder (Shipped: 2026-03-28)

**Delivered:** The full Cauldron v1.0 pipeline shipped end-to-end: interview, seed crystallization, holdout generation, DAG execution, evolution, web dashboard, CLI, and release-grade test coverage.

**Phases completed:** 1-17 (65 plans total, including inserted Phases 6.1 and 6.2)

**Key accomplishments:**

- Shipped the complete interview -> seed -> holdout -> decomposition -> execution -> evolution pipeline
- Added the HZD-styled web dashboard across project, interview, execution, evolution, cost, and settings surfaces
- Added the CLI and dogfooding flow so Cauldron can build subsequent work with its own pipeline
- Closed post-audit integration gaps and completed component, E2E, accessibility, and CI validation for release

**Stats:**

- 19 phase directories completed
- 65 plans completed
- v1.0 roadmap, requirements, and audit artifacts preserved under `.planning/`
- Shipped after final verification and test hardening on 2026-03-28

**Git range:** `feat(01-01)` -> `test(17-05)`

**What's next:** v1.1 local asset generation, style-aware seed discussions, and app-owned image assets.

---
