# Project Research Summary

**Project:** Cauldron
**Domain:** Local FLUX.2 dev image generation and style-aware app asset workflows
**Researched:** 2026-03-31
**Confidence:** HIGH

## Executive Summary

This milestone is not “add an image API.” It is a local runtime and specification problem. Cauldron already has the interview, seed, orchestration, persistence, and operator surfaces needed to host the capability, but it does not yet have a reproducible local image runtime, async asset job flow, or a seed contract that captures visual direction well enough to drive generation.

The strongest approach is local-first and project-owned: acquire or import only the required FLUX.2 dev subset into a gitignored runtime bundle, persist a manifest, and expose generation through an async job layer plus a local MCP surface. At the same time, make style clarity a real part of seed quality so “the LLM has no idea what this should look like” becomes an explicit ambiguity state instead of a downstream failure.

The main risk is pretending the operator’s existing ComfyUI install solves the problem. It does not. The current local models tree is about 93G, the FLUX.2 dev subset is still enormous, and the product needs a supported acquisition/import story plus clear runtime health checks.

## Key Findings

### Recommended Stack

Reuse Cauldron’s existing TypeScript, Drizzle, PostgreSQL, and project-settings infrastructure. Add a local runtime adapter, an acquisition/import manager, and a gitignored project runtime bundle rather than introducing a parallel architecture.

**Core technologies:**
- ComfyUI local runtime: execution target for the existing local FLUX.2 dev bundle
- Project-owned FLUX.2 dev subset: reproducible local asset runtime
- Existing Cauldron DB/event infrastructure: durable asset jobs, manifests, and provenance
- TypeScript MCP surface: stable tool contract for apps and build agents

### Expected Features

**Must have (table stakes):**
- Style-aware interview and seed persistence
- Import + guided-download acquisition paths
- Async asset jobs with durable handles and status
- Local image-generation MCP
- Workspace artifact delivery with provenance

**Should have (competitive):**
- Style clarity as an ambiguity dimension
- Project-owned runtime manifest instead of a hidden machine cache

**Defer (v1.2+):**
- Inpainting/outpainting and multi-step editing
- Shared asset library and cloud fallback
- Training or LoRA management

### Architecture Approach

The architecture should connect three layers: interview/seed capture of visual direction, asset orchestration and persistence in Cauldron, and a project-owned local image runtime bundle. Runtime access should be wrapped in a local MCP and async job service rather than exposed directly to apps.

**Major components:**
1. Style-aware interview and seed contract — decides whether Cauldron knows what to generate
2. Model acquisition/runtime manager — imports or downloads the required FLUX.2 dev subset
3. Asset job service + MCP — accepts requests, manages async work, and writes artifacts back to apps

### Critical Pitfalls

1. **Hidden machine-state runtime** — avoid by supporting explicit import and guided download
2. **Whole-tree model copy** — avoid by declaring and importing only the required subset
3. **Synchronous generation** — avoid by persisting jobs before calling the runtime
4. **Late style capture** — avoid by adding style clarity to interview/scoring before asset generation
5. **Runtime leakage into apps** — avoid by using a Cauldron MCP contract instead of direct ComfyUI coupling

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 18: Style Contract & Seed Evolution
**Rationale:** The product first needs to know what it is trying to make look like.
**Delivers:** Style-aware interview questions, ambiguity scoring, and structured seed persistence.
**Addresses:** STYLE-01 through STYLE-05
**Avoids:** Late style capture

### Phase 19: Model Acquisition & Project Runtime
**Rationale:** Local generation is impossible until the runtime bundle can be acquired reproducibly.
**Delivers:** Import-from-ComfyUI, guided upstream acquisition, manifests, and health checks.
**Addresses:** IMG-01 through IMG-04
**Avoids:** Hidden machine-state runtime and whole-tree copying

### Phase 20: Async Asset Engine
**Rationale:** Local generation must be durable and async before it becomes a platform feature.
**Delivers:** Asset-job persistence, statuses, retries, progress, and result recording.
**Addresses:** ASSET-01 through ASSET-05
**Avoids:** Synchronous request handling and opaque failures

### Phase 21: Local Image MCP & App Delivery
**Rationale:** Once the runtime and job system exist, apps and build agents need a stable tool contract.
**Delivers:** Local image-generation MCP plus workspace artifact delivery.
**Addresses:** MCP-01 through MCP-04
**Avoids:** Runtime leakage into apps

### Phase 22: Operator Controls & End-to-End Validation
**Rationale:** The milestone is not complete until operators can configure it cleanly and prove the full path works.
**Delivers:** Project settings, budget controls, and end-to-end verification.
**Addresses:** OPS-01 through OPS-03

### Phase Ordering Rationale

- Style contract comes first so runtime and MCP schemas are driven by the seed, not ad hoc prompts.
- Model acquisition precedes async orchestration because the job system needs a validated local runtime target.
- App-facing tooling comes after persistence and runtime layers so it can stay thin and stable.
- Operator controls and verification close the milestone because they validate the entire chain instead of only isolated pieces.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 19:** exact upstream artifact map and integrity strategy for guided downloads
- **Phase 20:** local runtime submission/observation API details for the chosen execution path

Phases with standard patterns (skip research-phase):
- **Phase 18:** existing interview/scoring/seed surfaces already provide a clear extension path
- **Phase 22:** settings and E2E verification patterns already exist in the repo

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Local runtime, model files, and current repo boundaries are all validated |
| Features | HIGH | User request is concrete and maps cleanly to platform capabilities |
| Architecture | HIGH | Existing interview/persistence/settings surfaces make the integration points obvious |
| Pitfalls | HIGH | The biggest risks are already visible from local model sizes and current product boundaries |

**Overall confidence:** HIGH

### Gaps to Address

- Exact runtime adapter details for the chosen local execution surface
- Exact upstream artifact/source map for guided acquisition mode
- Retention policy for large generated artifacts and copied runtime bundles

## Sources

### Primary (HIGH confidence)
- Local ComfyUI install under `/Users/zakkeown/Documents/ComfyUI` — validated model files, sizes, and active model base
- Cauldron code surfaces for interview scoring, seed crystallization, project settings, and pipeline stages

### Secondary (MEDIUM confidence)
- Upstream FLUX.2 dev model repositories from Comfy-Org on Hugging Face — used to confirm artifact naming for acquisition planning

---
*Research completed: 2026-03-31*
*Ready for roadmap: yes*
