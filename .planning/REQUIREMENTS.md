# Requirements: Cauldron

**Defined:** 2026-03-31
**Core Value:** The full pipeline works end-to-end: a user describes what they want, and Cauldron autonomously designs, decomposes, implements, tests, evaluates, and evolves the software until it meets the goal.

## v1.1 Requirements

Requirements for the local image-generation milestone. Each maps to roadmap phases.

### Style-Aware Interview & Seed Contract

- [ ] **STYLE-01**: Interview flow captures visual direction explicitly when the requested software depends on generated imagery or strong art direction
- [ ] **STYLE-02**: Visual direction capture supports concrete fields such as look/feel, references, brand constraints, and asset intent
- [ ] **STYLE-03**: Ambiguity scoring adds a style clarity dimension whenever visual ambiguity materially affects downstream implementation
- [ ] **STYLE-04**: Interview continues asking follow-up questions when style clarity is low even if other clarity dimensions are high
- [ ] **STYLE-05**: Seed summaries and crystallized seeds persist visual direction in structured form for downstream asset generation

### Model Acquisition & Project Runtime

- [ ] **IMG-01**: Operators can acquire the required FLUX.2 dev model bundle into a project-owned, gitignored runtime directory
- [ ] **IMG-02**: Acquisition supports at least two paths: importing from an existing ComfyUI install and guided upstream download
- [ ] **IMG-03**: Imported assets record a manifest with role, source, and integrity/provenance metadata
- [ ] **IMG-04**: Health checks fail fast with actionable errors when required local model files are missing, incomplete, or pointed at the wrong location

### Async Asset Generation Engine

- [x] **ASSET-01**: Image generation requests persist as asynchronous jobs with queued, running, succeeded, failed, and canceled states
- [x] **ASSET-02**: Initiating generation returns a durable job handle immediately instead of blocking until the image is ready
- [x] **ASSET-03**: Generation progress and completion can be observed independently of the initiating CLI or web request
- [x] **ASSET-04**: Completed jobs persist prompt inputs, output metadata, artifact locations, and failure diagnostics for review and reuse
- [x] **ASSET-05**: Asset jobs support retry and idempotency controls so duplicate calls do not trigger uncontrolled reruns

### Local Image MCP & App Delivery

- [ ] **MCP-01**: Cauldron exposes a local image-generation MCP surface backed by the project-owned FLUX.2 dev runtime
- [x] **MCP-02**: Apps and build agents can request assets with structured inputs including prompt, style guidance, references, aspect/size, destination, and intended use
- [ ] **MCP-03**: MCP responses return job identifiers and retrieval handles suitable for async workflows
- [ ] **MCP-04**: Completed generations can be written into the target app workspace or a declared artifact directory with provenance metadata attached

### Operator Controls & Verification

- [ ] **OPS-01**: Project-level settings support configuring image runtime paths, acquisition mode, and generation budgets without hand-editing implementation internals
- [ ] **OPS-02**: Operators can disable or budget-limit image generation per project
- [ ] **OPS-03**: End-to-end verification proves style capture -> seed persistence -> async generation -> asset delivery on a local runtime

## v1.2+ Requirements

Deferred until the local image path is stable.

### Advanced Image Workflows

- **IMGX-01**: Inpainting, outpainting, and multi-step editing flows beyond baseline generation
- **IMGX-02**: Multi-model support beyond the initial FLUX.2 dev runtime
- **IMGX-03**: Managed LoRA training or fine-tuning flows

### Asset Platform Expansion

- **ASTX-01**: Shared asset library with dedupe and cross-project reuse
- **ASTX-02**: Cloud fallback providers for teams without local GPU capacity
- **ASTX-03**: Video, animation, or 3D generation

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Committing model binaries to git | Model assets are tens of gigabytes and belong in a gitignored runtime directory |
| Copying the entire existing ComfyUI models tree verbatim | The local tree is about 93G; Cauldron should import only the required FLUX.2 dev subset |
| Synchronous image generation in request handlers | Long-running generation must be async-first |
| Embedded ComfyUI workflow editor | Managed generation is the goal, not reproducing the whole ComfyUI product |
| Video, audio, or 3D generation | 2D image generation must prove reliable first |
| Model training/fine-tuning | Acquisition and inference are the current milestone boundary |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| STYLE-01 | Phase 18 | Pending |
| STYLE-02 | Phase 18 | Pending |
| STYLE-03 | Phase 18 | Pending |
| STYLE-04 | Phase 18 | Pending |
| STYLE-05 | Phase 18 | Pending |
| IMG-01 | Phase 19 | Pending |
| IMG-02 | Phase 19 | Pending |
| IMG-03 | Phase 19 | Pending |
| IMG-04 | Phase 19 | Pending |
| ASSET-01 | Phase 18 | Complete |
| ASSET-02 | Phase 18 | Complete |
| ASSET-03 | Phase 18 | Complete |
| ASSET-04 | Phase 18 | Complete |
| ASSET-05 | Phase 18 | Complete |
| MCP-01 | Phase 21 | Pending |
| MCP-02 | Phase 21 | Complete |
| MCP-03 | Phase 21 | Pending |
| MCP-04 | Phase 21 | Pending |
| OPS-01 | Phase 22 | Pending |
| OPS-02 | Phase 22 | Pending |
| OPS-03 | Phase 22 | Pending |

**Coverage:**
- v1.1 requirements: 21 total
- Mapped to phases 18-22: 21
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-31*
*Last updated: 2026-03-31 after roadmap creation for Phases 18-22*
