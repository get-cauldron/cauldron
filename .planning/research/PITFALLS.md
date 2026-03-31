# Pitfalls Research

**Domain:** Local image-generation infrastructure for Cauldron
**Researched:** 2026-03-31
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Treating local model availability as an implicit machine state

**What goes wrong:**
The feature works only on the original developer machine because the runtime depends on a hidden global ComfyUI cache.

**Why it happens:**
Importing from an existing install feels faster than designing an acquisition path.

**How to avoid:**
Support both import and guided download into a project-owned runtime directory, then persist a manifest proving exactly what was acquired.

**Warning signs:**
Developers say “it works here” but cannot explain where the required files came from.

**Phase to address:**
Phase 19

---

### Pitfall 2: Copying the entire ComfyUI models tree

**What goes wrong:**
Disk usage explodes because the current local models directory is about 93G and contains unrelated assets.

**Why it happens:**
Selecting the minimal FLUX.2 dev subset looks harder than copying everything.

**How to avoid:**
Define a required subset, import only those files, and record their roles in a manifest.

**Warning signs:**
The planned copy path includes `models/` wholesale instead of named required artifacts.

**Phase to address:**
Phase 19

---

### Pitfall 3: Synchronous generation in interactive requests

**What goes wrong:**
Web requests time out, CLI commands hang, and failures lose all context.

**Why it happens:**
The first implementation path is usually “call runtime, wait, return.”

**How to avoid:**
Persist jobs first, return handles immediately, and observe progress independently.

**Warning signs:**
Handlers wait for final images before responding.

**Phase to address:**
Phase 20

---

### Pitfall 4: Prompting for style too late

**What goes wrong:**
Cauldron generates assets from vague prompts because the seed never encoded a real visual target.

**Why it happens:**
Style feels like presentation polish instead of spec quality.

**How to avoid:**
Add style clarity to interview/scoring/crystallization before building the generation layer.

**Warning signs:**
Generated prompts depend on ad hoc operator edits or undocumented brand assumptions.

**Phase to address:**
Phase 18

---

### Pitfall 5: Exposing runtime internals to apps

**What goes wrong:**
Apps become tightly coupled to ComfyUI or a specific filesystem layout.

**Why it happens:**
It is tempting to let apps call the runtime directly instead of building a stable tool contract.

**How to avoid:**
Expose generation via a Cauldron MCP surface with structured request/response schemas.

**Warning signs:**
App code starts talking about ComfyUI nodes, queue internals, or raw filesystem paths.

**Phase to address:**
Phase 21

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Import-only acquisition | Fastest path on the original machine | Fails on new machines | Only if paired with a second supported guided-download path in the same milestone |
| Storing raw prompts only | Fewer schema changes | No reproducible style contract | Never for this milestone |
| Writing assets without provenance | Less metadata work | Impossible reuse/debugging | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Local runtime | Assuming every runtime path is valid once configured | Run explicit health checks against required artifacts |
| Model acquisition | Downloading or copying files without integrity metadata | Persist a manifest with checksums or equivalent provenance |
| App integration | Returning final images synchronously from MCP | Return job handles and let clients observe completion |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full-tree model copy | Disk usage doubles or worse | Copy only declared required artifacts | Immediately on the current 93G tree |
| Over-parallel local generation | Runtime thrash, OOM, or long queue times | Per-project concurrency and budget controls | As soon as multiple asset jobs overlap |
| Artifact sprawl | Repo-local storage fills quickly | Separate runtime bundle and generated artifact retention rules | After repeated generation cycles |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Treating local model paths as trusted forever | Malformed or missing bundles cause confusing failures | Validate manifests and health on startup and before job dispatch |
| Writing arbitrary outputs into app workspaces without guardrails | Asset tool can stomp unrelated files | Require declared destinations and constrain write paths |
| Pulling large upstream assets without provenance | Reproducibility and supply-chain ambiguity | Record source URLs and integrity metadata |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| “Install ComfyUI first” as the whole story | User still cannot tell Cauldron how to acquire the right model subset | Guided acquisition plus import-from-existing |
| No style questions during interview | Assets come out generic or wrong | Ask for visual direction when image output matters |
| No durable job handles | Users cannot tell whether generation is still running or failed | Return handles and expose job status clearly |

## "Looks Done But Isn't" Checklist

- [ ] **Model acquisition:** Often missing guided download — verify a fresh machine path exists
- [ ] **Runtime readiness:** Often missing health checks — verify missing files fail clearly
- [ ] **Async job engine:** Often missing retries/idempotency — verify repeated requests behave predictably
- [ ] **Seed integration:** Often missing structured style persistence — verify style survives crystallization
- [ ] **App delivery:** Often missing provenance metadata — verify generated files can be traced back to a job

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong or incomplete model bundle | MEDIUM | Re-run acquisition/import, regenerate manifest, rerun health checks |
| Hung generation job | LOW | Mark job failed/canceled, retain diagnostics, retry with same request envelope |
| Incoherent assets due to vague style | MEDIUM | Re-open interview/seed clarification, update visual direction, regenerate |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Hidden machine-state runtime | Phase 19 | Fresh-machine or empty-runtime acquisition succeeds |
| Whole-tree model copy | Phase 19 | Import/download only declared files |
| Synchronous generation | Phase 20 | Request returns job handle before completion |
| Late style handling | Phase 18 | Seed stores structured visual direction |
| Runtime internals leaking to apps | Phase 21 | MCP schema remains runtime-agnostic |

## Sources

- Local ComfyUI install and model directory analysis on 2026-03-31
- Existing Cauldron architecture and interview code surfaces
- Upstream FLUX.2 dev artifact naming and sizes

---
*Pitfalls research for: local asset generation*
*Researched: 2026-03-31*
