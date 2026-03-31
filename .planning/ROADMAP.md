# Roadmap: Cauldron

## Milestones

- ✅ **v1.0 End-to-End Autonomous Builder** - Phases 1-17 shipped on 2018-03-28
- 🚧 **v1.1 Local Asset Generation & Style-Aware Seeds** - Phases 18-20 planned

## Overview

Cauldron v1.0 already shipped, so this roadmap is scoped only to milestone v1.1 and continues phase numbering from 17. The milestone adds durable async asset jobs backed by a local FLUX.2 dev runtime, exposes them through a local MCP surface for apps and build agents, and closes by giving operators project-level controls plus end-to-end proof that the asset workflow delivers.

## Phases

**Phase Numbering:**
- Integer phases (18, 19, 20): Planned milestone work
- Decimal phases (18.1, 18.2): Urgent insertions after planning

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 18: Async Asset Engine** - Persist image generation as durable async jobs with observable lifecycle, retry, and artifact metadata
- [ ] **Phase 19: Local Image MCP & App Delivery** - Expose local generation through a Cauldron-managed MCP surface and deliver completed assets into app workspaces
- [ ] **Phase 20: Operator Controls & End-to-End Validation** - Add project-level runtime controls, budgets, and milestone-closing verification of the full asset path

## Phase Details

### Phase 18: Async Asset Engine
**Goal**: Local image generation runs as a durable async job system rather than a blocking CLI or web request.
**Depends on**: Phase 17
**Requirements**: ASSET-01, ASSET-02, ASSET-03, ASSET-04, ASSET-05
**Success Criteria** (what must be TRUE):
  1. Starting a generation request returns a durable job handle immediately instead of waiting for the image to finish
  2. Asset jobs persist and move through queued, running, succeeded, failed, and canceled states
  3. Job progress and completion can be checked later from another CLI or web request without relying on the initiating session still being open
  4. Completed and failed jobs retain prompt inputs, output metadata, artifact locations, and failure diagnostics for review and reuse
  5. Retry and idempotency controls prevent duplicate submissions from triggering uncontrolled reruns
**Plans:** 1/3 plans executed

Plans:
- [x] 18-01-PLAN.md — Schema, types, and job-store DB operations
- [ ] 18-02-PLAN.md — ComfyUI adapter and artifact writer
- [ ] 18-03-PLAN.md — Inngest function wiring, docker-compose, and gitignore

### Phase 19: Local Image MCP & App Delivery
**Goal**: Apps and build agents consume local asset generation through a stable MCP contract and receive deliverable artifacts with provenance.
**Depends on**: Phase 18
**Requirements**: MCP-01, MCP-02, MCP-03, MCP-04
**Success Criteria** (what must be TRUE):
  1. Cauldron exposes a local image-generation MCP surface backed by the project-owned FLUX.2 dev runtime instead of direct app-level ComfyUI coupling
  2. Apps and build agents can submit structured asset requests including prompt, style guidance, references, aspect or size, destination, and intended use
  3. MCP responses return job identifiers and retrieval handles that fit the async asset workflow rather than blocking on image completion
  4. Completed generations can be written into the target app workspace or a declared artifact directory with provenance metadata attached
**Plans**: TBD

### Phase 20: Operator Controls & End-to-End Validation
**Goal**: Operators can configure, constrain, and prove the full local asset workflow on a per-project basis.
**Depends on**: Phase 19
**Requirements**: OPS-01, OPS-02, OPS-03
**Success Criteria** (what must be TRUE):
  1. Project settings let an operator configure runtime paths, acquisition mode, and generation budgets without editing implementation internals
  2. An operator can disable image generation entirely or enforce project-specific budget limits before jobs are accepted
  3. End-to-end verification demonstrates the full path from style capture to seed persistence to async generation to delivered local assets
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 18 → 19 → 20

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 18. Async Asset Engine | 1/3 | In Progress|  |
| 19. Local Image MCP & App Delivery | 0/TBD | Not started | - |
| 20. Operator Controls & End-to-End Validation | 0/TBD | Not started | - |
