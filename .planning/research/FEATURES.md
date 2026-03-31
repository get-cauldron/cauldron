# Feature Research

**Domain:** Local image generation for app assets inside Cauldron
**Researched:** 2026-03-31
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Project-owned model acquisition | A local workflow is unusable if the runtime bundle cannot be acquired predictably | HIGH | Must cover both import-from-ComfyUI and guided upstream download |
| Async job lifecycle | Image generation is too slow and failure-prone for synchronous request handling | HIGH | Queue, status, completion, and failure states are baseline expectations |
| Prompt + style contract | Asset generation needs structured style guidance, not just raw text prompts | MEDIUM | Strongly tied to seed and interview changes |
| Artifact persistence | Generated files need durable locations and metadata | MEDIUM | Asset jobs without provenance become impossible to reuse or debug |
| Health checks for model readiness | Operators need to know whether the runtime is actually usable before generating anything | MEDIUM | Missing or mismatched tens-of-gigabytes files must fail early and clearly |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Style-aware ambiguity scoring | Cauldron can detect “we do not yet know what this should look like” before generating junk assets | HIGH | Directly matches the user’s request and differentiates the interview from generic prompt collection |
| App-facing MCP for asset generation | Generated apps and build agents can request their own assets using the same managed runtime | HIGH | Turns image generation into platform capability instead of a one-off operator tool |
| Project-managed local bundle with manifest | Reproducible runtime without depending on a hidden machine cache | HIGH | Stronger than telling users to “already have ComfyUI set up” |
| Workspace delivery with provenance | Generated assets can land exactly where the app needs them, with traceability | MEDIUM | Makes asset generation materially useful during build flows |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Copy the entire ComfyUI models folder | Feels simpler than selecting a subset | Current tree is about 93G and includes unrelated assets | Import only the required FLUX.2 dev subset with a manifest |
| Wait for generation in the original web request | Feels easier to wire initially | Creates timeouts, brittle UX, and zero resilience | Async jobs with retrieval handles |
| Build a full ComfyUI clone inside Cauldron | Feels like “complete integration” | Explodes scope into workflow editing and runtime management | Expose managed generation capabilities only |

## Feature Dependencies

```text
Style-aware interview/seed
    └──drives──> structured asset prompts
                        └──drives──> local MCP request contract
                                          └──requires──> async job engine
                                                             └──requires──> model acquisition/runtime setup

Operator settings ──control──> acquisition mode, runtime path, and budget limits
```

### Dependency Notes

- **Style capture requires prompt contract:** Cauldron cannot generate consistent assets if the seed does not describe the visual target concretely.
- **MCP requires async jobs:** App-facing tooling must return durable handles instead of hanging on generation.
- **Async jobs require runtime setup:** Queueing work before model acquisition and health checks just produces opaque failures.
- **Operator settings control runtime viability:** Runtime path, acquisition mode, and budget limits must be visible configuration, not code edits.

## MVP Definition

### Launch With (v1.1)

- [ ] Style-aware interview and seed persistence
- [ ] Project-owned FLUX.2 dev acquisition/import flow
- [ ] Async asset job engine with persistence and status tracking
- [ ] Local image-generation MCP for apps and build agents
- [ ] Workspace artifact delivery plus local-runtime verification

### Add After Validation (v1.2)

- [ ] Editing/inpainting/outpainting workflows — after basic generation is reliable
- [ ] Shared asset library and reuse — after artifact delivery proves useful
- [ ] Cloud fallback providers — after local-first path is stable

### Future Consideration (v2+)

- [ ] Training and LoRA management — defer until inference workflow is solid
- [ ] Video/audio/3D generation — different operational and UX problem space

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Style-aware ambiguity scoring | HIGH | HIGH | P1 |
| FLUX.2 dev acquisition/import | HIGH | HIGH | P1 |
| Async asset job engine | HIGH | HIGH | P1 |
| Local image MCP | HIGH | HIGH | P1 |
| Workspace asset delivery | HIGH | MEDIUM | P1 |
| Shared asset library | MEDIUM | MEDIUM | P2 |
| Cloud fallback | MEDIUM | HIGH | P2 |
| Training/fine-tuning | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Hosted image APIs | Global ComfyUI setup | Our Approach |
|---------|-------------------|----------------------|--------------|
| Acquisition | Usually hidden behind cloud signup | Assumed manual operator work | Explicit import + guided download into project runtime |
| Async workflow | Usually standard | Often left to the operator | Platform-managed asset jobs with durable status |
| Style capture | Usually prompt-only | External to the app builder | Make style clarity part of seed formation itself |
| App integration | Usually custom glue | Ad hoc scripts | Managed MCP surface for apps and build agents |

## Sources

- Local ComfyUI install and model tree on the operator machine
- Existing Cauldron interview, seed, and settings surfaces in the repo
- Upstream FLUX.2 dev artifact naming from Comfy-Org model repositories

---
*Feature research for: local app asset generation*
*Researched: 2026-03-31*
