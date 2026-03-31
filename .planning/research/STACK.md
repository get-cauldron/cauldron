# Stack Research

**Domain:** Local FLUX.2 dev image generation for Cauldron apps
**Researched:** 2026-03-31
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| ComfyUI desktop/runtime | Existing local install (pin exact build during implementation) | Local inference runtime and model execution host | Already present on the operator machine, proven to load the target FLUX.2 dev assets, and gives Cauldron a practical local execution target |
| FLUX.2 dev model bundle | Local files validated on 2026-03-31 | Core image generation weights | Matches the user’s stated local model target and avoids designing around the wrong remote SKU |
| TypeScript Node services | Existing repo standard | Acquisition CLI, runtime adapter, MCP server, job orchestration | Preserves Cauldron’s end-to-end TS architecture and existing web/CLI/engine conventions |
| PostgreSQL + event store | Existing repo standard | Async asset jobs, manifests, provenance, and audit trail | Durable status tracking already exists in the platform and fits long-running local jobs better than ephemeral process state |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | Existing repo standard | Structured request/result schemas for MCP and seed extensions | Use for any generation contract shared across web, CLI, engine, and MCP |
| Drizzle ORM | Existing repo standard | Asset-job persistence, manifest storage, and settings updates | Use for schema changes and repository layer extensions |
| Existing Cauldron gateway/settings infrastructure | Existing repo standard | Per-project overrides and budget controls | Reuse for image-generation stage settings instead of inventing a parallel config system |
| Hugging Face download tooling or direct HTTPS fetch with checksum verification | Pin during implementation | Guided upstream acquisition path | Use only for the “download model” path; import-from-ComfyUI remains the faster default for operators with local assets |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| ComfyUI local installation at `/Users/zakkeown/Documents/ComfyUI` | Verified source of the current FLUX.2 dev bundle | Local logs confirm `/Users/zakkeown/Documents/ComfyUI/models` is the active model base |
| Checksum/manifests | Prevent partial or mismatched model bundles | Required because the model subset is huge and manual copying is error-prone |
| Gitignored project runtime directory | Holds project-owned model copies | Must stay out of git while remaining fully repo-local for reproducibility |

## Installation

```bash
# No new stack package choices are mandatory for planning.
# Milestone should provide both of these acquisition paths:

# 1. Import from an existing ComfyUI install
cauldron image-runtime import --from /Users/zakkeown/Documents/ComfyUI/models

# 2. Guided upstream acquisition into a project-owned runtime directory
cauldron image-runtime acquire --profile flux2-dev
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Project-owned local FLUX.2 dev bundle | Hosted-only BFL API integration | Use hosted providers later if local GPU/runtime is unavailable; not the right default for this milestone |
| Import or guided download into a gitignored project runtime | Rely on a global ComfyUI cache forever | Only acceptable as a temporary bridge; it is not reproducible enough for Cauldron-managed app generation |
| Reuse existing Cauldron persistence + config layers | Standalone sidecar with its own DB and config | Only use a separate service if Cauldron’s existing event/state layers prove materially inadequate |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Blindly copying the whole ComfyUI `models/` tree | Current tree is about 93G and includes unrelated assets | Import a declared FLUX.2 dev subset with a manifest |
| Treating model presence as a hidden machine prerequisite | Fails on fresh machines and breaks reproducibility | Provide supported import and guided download commands |
| Blocking web/CLI requests on generation completion | Local jobs can run long and fail unpredictably | Create durable jobs and poll/stream status separately |

## Stack Patterns by Variant

**If the operator already has ComfyUI assets locally:**
- Prefer import from the existing ComfyUI models directory
- Because it is faster than re-downloading tens of gigabytes

**If the operator does not have ComfyUI installed:**
- Support guided upstream acquisition into the project runtime
- Because “go install ComfyUI first” is not an acceptable end-user workflow for this milestone

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Local FLUX.2 dev bundle | Existing ComfyUI runtime | Local machine validation found `flux2_dev_fp8mixed.safetensors`, text encoders, VAE, and optional LoRA in the active models path |
| Cauldron TS monorepo | New image runtime adapter + MCP server | Keep the image stack inside existing package boundaries instead of starting a new language/runtime track |

## Sources

- Local machine: `/Users/zakkeown/Documents/ComfyUI/models` — validated current model files and size
- Local machine: `/Users/zakkeown/Library/Logs/ComfyUI/comfyui.log` — verified active model search path
- Hugging Face: `https://huggingface.co/Comfy-Org/flux2-dev` — confirmed upstream FLUX.2 dev model artifact naming
- Hugging Face: `https://huggingface.co/Comfy-Org/flux2-klein-9B` and `https://huggingface.co/Comfy-Org/flux2-klein-4B` — confirmed related encoder/VAE asset naming patterns

---
*Stack research for: local FLUX.2 dev image generation*
*Researched: 2026-03-31*
