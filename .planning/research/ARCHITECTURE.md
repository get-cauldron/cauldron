# Architecture Research

**Domain:** Local FLUX.2 dev asset generation inside Cauldron
**Researched:** 2026-03-31
**Confidence:** HIGH

## Standard Architecture

### System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                 Interview / Seed Layer                     │
├─────────────────────────────────────────────────────────────┤
│  Interview FSM   Ambiguity Scoring   Seed Summary/Store    │
└────────────────────────────┬────────────────────────────────┘
                             │ visual direction
┌─────────────────────────────────────────────────────────────┐
│               Asset Orchestration Layer                    │
├─────────────────────────────────────────────────────────────┤
│  Model Acquisition   Runtime Health   Asset Job Service    │
│  MCP Server          Artifact Writer   Status API/SSE       │
└────────────────────────────┬────────────────────────────────┘
                             │ local execution
┌─────────────────────────────────────────────────────────────┐
│                 Local Image Runtime Layer                  │
├─────────────────────────────────────────────────────────────┤
│     Project-Owned FLUX.2 dev Bundle   ComfyUI Runtime      │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Interview + scoring extensions | Determine whether visual direction is clear enough to generate assets | Existing engine interview modules extended with style-aware schema and scoring |
| Model acquisition manager | Import or download required FLUX.2 dev assets into a project-owned runtime bundle | CLI/app service plus manifest/checksum tracking |
| Runtime adapter | Submit generation work to the local runtime and normalize results | Thin adapter around the chosen local image runtime |
| Asset job service | Persist jobs, statuses, retries, and artifacts | Existing DB/event patterns with new image-job tables/events |
| Local MCP server | Present a stable app-facing tool surface for generation | TS MCP server layered over the asset job service |

## Recommended Project Structure

```text
packages/
├── engine/
│   ├── src/interview/        # Style-aware questioning, scoring, seed synthesis
│   ├── src/assets/           # Asset jobs, runtime adapter, artifact writer
│   └── src/mcp/              # Local image-generation MCP surface
├── shared/
│   └── src/db/schema/        # Image runtime, manifest, and asset-job tables
├── cli/
│   └── src/commands/         # Acquisition/import/health commands
└── web/
    └── src/app/projects/...  # Settings, status, and operator controls
```

### Structure Rationale

- **`engine/src/interview/`:** Style clarity belongs with the current interview and crystallization logic, not a separate asset-specific wizard.
- **`engine/src/assets/`:** Runtime integration and async job orchestration are backend concerns shared by CLI, web, and MCP.
- **`engine/src/mcp/`:** Local app/tool integration should sit close to runtime orchestration, not inside a UI package.
- **`shared/src/db/schema/`:** Asset jobs and runtime manifests need the same durable schema discipline as the rest of Cauldron.

## Architectural Patterns

### Pattern 1: Style Contract Before Runtime Call

**What:** Build a structured visual-direction object during interview/seed work, then transform that into generation prompts later.
**When to use:** Any project where image generation depends on the product’s intended visual identity.
**Trade-offs:** More upfront schema work, but avoids generating inconsistent assets from vague prompts.

### Pattern 2: Durable Async Job Envelope

**What:** Treat image generation like any other long-running pipeline step with persisted state and retrieval handles.
**When to use:** Always for local inference.
**Trade-offs:** Adds tables/events/status plumbing, but avoids timeouts and makes retries/debugging tractable.

### Pattern 3: Managed Runtime Bundle

**What:** Copy or acquire only the required FLUX.2 dev subset into a project-owned, gitignored bundle with a manifest.
**When to use:** When the platform needs reproducibility across machines and runs.
**Trade-offs:** Large local storage cost, but much better than depending on an invisible global cache.

## Data Flow

### Request Flow

```text
[Seed / App Need]
    ↓
[Style Contract]
    ↓
[MCP or Internal Request]
    ↓
[Asset Job Service]
    ↓
[Local Runtime Adapter]
    ↓
[Artifact Writer + Job Status]
```

### Key Data Flows

1. **Acquisition flow:** operator import/download -> manifest persisted -> runtime marked healthy
2. **Generation flow:** app/tool request -> asset job persisted -> local runtime executes -> artifact stored -> handle resolves
3. **Seed flow:** interview answers -> style clarity scored -> structured visual direction stored in seed

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Single operator / single workstation | One local runtime and one job queue is fine |
| Multiple local projects on one machine | Add concurrency, storage, and budget controls per project |
| Team / multi-machine usage | Defer until cloud or distributed runtime work; not this milestone |

### Scaling Priorities

1. **First bottleneck:** disk/storage pressure from copied model bundles and generated artifacts
2. **Second bottleneck:** local inference concurrency versus Cauldron’s existing job throughput

## Anti-Patterns

### Anti-Pattern 1: Runtime Magic

**What people do:** Assume a local model cache already exists somewhere on the machine.
**Why it's wrong:** Fresh machines and CI-like environments become impossible to reason about.
**Do this instead:** Make acquisition/import explicit and persist a manifest.

### Anti-Pattern 2: Prompt-Only Style Handling

**What people do:** Shove style concerns into ad hoc freeform prompts right before generation.
**Why it's wrong:** Downstream agents get inconsistent, underspecified visual direction.
**Do this instead:** Persist style as structured seed data and score whether it is clear enough.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Local ComfyUI / local FLUX runtime | Local adapter + health checks + async submission | Local machine already has a working runtime bundle and model path |
| Upstream model artifact host | Guided download/import with manifest verification | Only needed for acquisition mode, not every generation request |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| interview -> assets | Structured visual direction | Avoid raw prompt string coupling |
| assets -> web/cli | DB-backed status queries and mutations | Reuse existing app patterns |
| assets -> MCP | Stable tool schema | Apps should not know runtime internals |

## Sources

- Local ComfyUI install paths and model files validated on 2026-03-31
- Existing Cauldron interview, seed, settings, and gateway surfaces
- Upstream FLUX.2 dev artifact naming from Comfy-Org model repositories

---
*Architecture research for: local FLUX.2 dev asset generation*
*Researched: 2026-03-31*
