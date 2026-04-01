# Phase 18: Async Asset Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-31
**Phase:** 18-async-asset-engine
**Areas discussed:** Job lifecycle & states, Execution backend, Artifact storage, Retry & idempotency, ComfyUI workflow contract, Observability & progress, Job submission API shape, Inngest function design

---

## Job Lifecycle & States

### Q1: How granular should asset job states be?

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror bead states | Reuse proven pattern: pending -> claimed -> active -> completed/failed, plus canceled | ✓ |
| Richer pipeline states | queued -> provisioning -> generating -> post-processing -> succeeded/failed/canceled | |
| Minimal + metadata | Just queued/running/done/failed/canceled, store sub-state as JSONB | |

**User's choice:** Mirror bead states
**Notes:** Consistency with existing codebase valued over granularity.

### Q2: Own table or extend beads?

| Option | Description | Selected |
|--------|-------------|----------|
| Separate asset_jobs table | Clean domain separation, different fields than beads | |
| Reuse beads with type column | Leverage existing lifecycle and Inngest wiring | |
| Separate table + shared event stream | Own table, but append to same events table for unified observability | ✓ |

**User's choice:** Separate table + shared event stream

### Q3: Canceled jobs — soft or hard delete?

| Option | Description | Selected |
|--------|-------------|----------|
| Soft delete via status | Status column to 'canceled', row preserved | ✓ |
| Hard delete with event record | Delete row, keep cancellation event | |

**User's choice:** Soft delete via status

### Q4: Priority/ordering?

| Option | Description | Selected |
|--------|-------------|----------|
| FIFO only | Simple queue ordering | |
| Priority field for future use | Add column now (default 0), process FIFO initially | ✓ |

**User's choice:** Priority field for future use

---

## Execution Backend

### Q1: What runs FLUX.2 generation?

| Option | Description | Selected |
|--------|-------------|----------|
| ComfyUI API subprocess | Shell out to running ComfyUI REST API | |
| Python bridge (diffusers) | Spawn Python subprocess, load FLUX.2 via diffusers | |
| Pluggable executor interface | TypeScript interface, ship ComfyUI adapter first | ✓ |

**User's choice:** Pluggable executor interface

### Q2: Which adapter ships first?

| Option | Description | Selected |
|--------|-------------|----------|
| ComfyUI API adapter | Talk to ComfyUI REST API on localhost | ✓ |
| Diffusers Python adapter | Direct model loading via HuggingFace diffusers | |
| Mock/stub adapter | Placeholder images for pipeline testing | |

**User's choice:** ComfyUI API adapter

### Q3: How to manage ComfyUI server?

| Option | Description | Selected |
|--------|-------------|----------|
| Expect running externally | Operator starts ComfyUI separately | |
| Auto-start on first job | Cauldron spawns as child process | |
| Docker container | Launch in Docker container | ✓ |

**User's choice:** Docker container

### Q4: Container lifecycle?

| Option | Description | Selected |
|--------|-------------|----------|
| Long-running with idle shutdown | Start on first job, auto-stop after idle timeout | |
| Per-job ephemeral containers | Fresh container per job | |
| Always-on via docker-compose | Add to docker-compose.yml with other dev infra | ✓ |

**User's choice:** Always-on via docker-compose

---

## ComfyUI Workflow Contract

### Q1: How to define the workflow?

| Option | Description | Selected |
|--------|-------------|----------|
| Template with variable substitution | Ship default FLUX.2 dev workflow JSON, substitute params | ✓ |
| Dynamically built from params | Programmatically construct workflow graph in TypeScript | |
| User-provided workflow files | Operators drop custom .json files | |

**User's choice:** Template with variable substitution

### Q2: Where does the template live?

| Option | Description | Selected |
|--------|-------------|----------|
| Engine package asset | packages/engine/src/asset/workflows/ | |
| Project-level config | .cauldron/workflows/ on project init | |
| Shared package | packages/shared/src/workflows/ | ✓ |

**User's choice:** Shared package

---

## Artifact Storage

### Q1: Where are generated images stored?

| Option | Description | Selected |
|--------|-------------|----------|
| Project-local artifacts dir | .cauldron/artifacts/{jobId}/ (gitignored) | ✓ |
| Centralized output directory | ~/.cauldron/artifacts/ shared across projects | |
| ComfyUI output dir + symlinks | Let ComfyUI write, symlink into project | |

**User's choice:** Project-local artifacts dir

### Q2: What metadata accompanies artifacts?

| Option | Description | Selected |
|--------|-------------|----------|
| Full provenance JSON sidecar | .json file next to image with all generation details | ✓ |
| Embedded EXIF/metadata | Write provenance into image file metadata | |
| DB-only metadata | All metadata in asset_jobs table | |

**User's choice:** Full provenance JSON sidecar

### Q3: Automatic cleanup?

| Option | Description | Selected |
|--------|-------------|----------|
| No auto-cleanup | Keep everything, operator cleans manually | ✓ |
| Configurable retention policy | Auto-delete old artifacts | |
| Claude's discretion | Let Claude decide | |

**User's choice:** No auto-cleanup

---

## Observability & Progress

### Q1: How to report running job progress?

| Option | Description | Selected |
|--------|-------------|----------|
| DB status transitions + SSE | Update DB on transitions, reuse LISTEN/NOTIFY -> SSE pipeline | ✓ |
| Poll ComfyUI + DB sync | Periodically poll ComfyUI /history for progress percentage | |
| Status transitions only | Major transitions only, no intermediate progress | |

**User's choice:** DB status transitions + SSE

---

## Job Submission API Shape

### Q1: Core submission interface requirements?

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal required + optional bag | Required: projectId, prompt. Optional fields + JSONB extras | ✓ |
| Structured with style refs | Required: projectId, prompt, styleRef. Ties to seed visual direction | |
| Fully structured request | Every parameter explicitly typed, no JSONB | |

**User's choice:** Minimal required + optional bag

---

## Retry & Idempotency

### Q1: How should failed jobs retry?

| Option | Description | Selected |
|--------|-------------|----------|
| Inngest built-in retry | step.run() retry with exponential backoff, max 3 attempts | ✓ |
| Manual retry via re-enqueue | Failed stays failed, explicit re-submit | |
| Custom retry with backoff | Retry logic in executor adapter | |

**User's choice:** Inngest built-in retry

### Q2: What makes a request idempotent?

| Option | Description | Selected |
|--------|-------------|----------|
| Client-provided idempotency key | Caller passes unique key, duplicates rejected | ✓ |
| Content hash dedup | Auto-hash prompt+model+params, return existing handle | |
| No dedup | Every call creates a job | |

**User's choice:** Client-provided idempotency key

### Q3: Generation timeout?

| Option | Description | Selected |
|--------|-------------|----------|
| Configurable timeout with default | 5-minute default, configurable per-project | ✓ |
| No timeout | Let jobs run indefinitely | |
| Claude's discretion | Let Claude pick defaults | |

**User's choice:** Configurable timeout with default

---

## Inngest Function Design

### Q1: How to integrate with Inngest?

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated asset function | New 'asset/generate' on cauldron-engine client | ✓ |
| Reuse bead dispatch pattern | Asset jobs through existing bead handler with type discriminator | |
| Separate Inngest client | New 'cauldron-asset' client with own namespace | |

**User's choice:** Dedicated asset function

### Q2: Where does the function live?

| Option | Description | Selected |
|--------|-------------|----------|
| Engine package, new submodule | packages/engine/src/asset/ | ✓ |
| New packages/asset package | Separate workspace package | |
| CLI package | In CLI since it runs the Hono server | |

**User's choice:** Engine package, new submodule

---

## Claude's Discretion

- Exact ComfyUI Docker image selection and configuration
- Internal polling interval for ComfyUI job completion
- Error classification (transient vs permanent) for retry decisions
- JSONB extras schema shape

## Deferred Ideas

None — discussion stayed within phase scope.
