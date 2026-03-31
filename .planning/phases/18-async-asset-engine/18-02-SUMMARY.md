---
phase: 18-async-asset-engine
plan: "02"
subsystem: comfyui-adapter-artifact-writer
tags: [comfyui, http-adapter, workflow-template, artifact-writer, provenance, unit-tests]
dependency_graph:
  requires: [18-01]
  provides: [comfyui-executor, artifact-writer, flux-dev-workflow-template]
  affects: [packages/engine/src/asset, packages/shared/src/workflows]
tech_stack:
  added: []
  patterns: [factory-function-pattern, template-variable-substitution, tdd-red-green, provenance-sidecar]
key_files:
  created:
    - packages/engine/src/asset/comfyui-adapter.ts
    - packages/engine/src/asset/artifact-writer.ts
    - packages/engine/src/asset/__tests__/comfyui-adapter.test.ts
    - packages/engine/src/asset/__tests__/artifact-writer.test.ts
    - packages/shared/src/workflows/flux-dev.json
  modified: []
decisions:
  - Workflow template placeholders use quoted strings in JSON ("{{SEED}}") so string.replace replaces both key and value simultaneously, producing unquoted numbers in the substituted output
  - loadWorkflowTemplate resolves path relative to import.meta.url (3 levels up from packages/engine/src/asset/ to packages/, then into shared/) to avoid package resolution complexity
  - Artifact writer accepts artifactsRoot as a parameter rather than hardcoding it, enabling the Inngest function to pass .cauldron/artifacts at call time
key_decisions:
  - Template path resolved relative to file location via fileURLToPath + resolve, not require.resolve (simpler, no package boundary needed)
  - Numeric placeholders are quoted in JSON template and become unquoted after string replacement, preserving ComfyUI type expectations
metrics:
  duration_minutes: 8
  completed_date: "2026-03-31"
  tasks_completed: 2
  files_created: 5
  files_modified: 0
---

# Phase 18 Plan 02: ComfyUI Adapter & Artifact Writer Summary

**One-liner:** ComfyUI HTTP API executor implementing AssetExecutor with workflow template variable substitution, plus file-system artifact writer with JSON provenance sidecar, backed by 21 unit tests.

## What Was Built

### Task 1: ComfyUI HTTP Adapter and FLUX.2 Workflow Template (TDD)

**`packages/shared/src/workflows/flux-dev.json`**
- ComfyUI API-format workflow (node-ID keyed object, not UI-format with links/groups)
- 8 nodes: CLIPTextEncode (positive + negative), CheckpointLoaderSimple, DualCLIPLoader, KSampler, EmptyLatentImage, VAEDecode, SaveImage
- 7 variable placeholders: `{{PROMPT}}`, `{{NEGATIVE_PROMPT}}`, `{{SEED}}`, `{{STEPS}}`, `{{WIDTH}}`, `{{HEIGHT}}`, `{{GUIDANCE_SCALE}}`
- Placeholders are quoted strings in JSON (e.g., `"seed": "{{SEED}}"`) so string.replace produces unquoted numbers after substitution
- TODO(phase-19): validate node IDs against running ComfyUI instance

**`packages/engine/src/asset/comfyui-adapter.ts`**
- `createComfyUIExecutor({ baseUrl, logger })` factory returning AssetExecutor
- Template loaded once at executor creation via `readFileSync` + path resolved from `import.meta.url`
- `submitJob`: POST `${baseUrl}/prompt` with substituted workflow; returns `prompt_id`; throws `ComfyUIError` on non-2xx
- `checkStatus`: GET `${baseUrl}/history/${promptId}`; returns `{ done: false }` if not yet complete; returns `{ done: true, outputs }` with images array from all output nodes
- `getArtifact`: GET `${baseUrl}/view?filename=...&subfolder=...&type=output`; returns `Buffer`; throws `ComfyUIError` on non-2xx
- Default values: 1024x1024, 20 steps, 3.5 guidance scale (standard FLUX.2 dev defaults)

**`packages/engine/src/asset/__tests__/comfyui-adapter.test.ts`**
- 13 unit tests with mocked global `fetch` via `vi.stubGlobal`
- Covers: prompt submission, template substitution for all 7 placeholders, default values, error handling with statusCode, done/not-done polling states, image URL query parameters

### Task 2: Artifact Writer with Provenance Sidecar (TDD)

**`packages/engine/src/asset/artifact-writer.ts`**
- `writeArtifact({ artifactsRoot, jobId, projectId, imageBuffer, imageFilename, sidecar })` async function
- Creates `{artifactsRoot}/{jobId}/` with `mkdir({ recursive: true })`
- Writes image Buffer to `{dir}/{imageFilename}`
- Writes `ArtifactSidecar` as 2-space pretty-printed JSON to `{dir}/{imageFilename}.meta.json` with encoding `'utf-8'`
- Returns the artifact directory path for caller use

**`packages/engine/src/asset/__tests__/artifact-writer.test.ts`**
- 8 unit tests with `vi.mock('node:fs/promises')` mocking mkdir and writeFile
- Covers: directory creation with recursive option, image write path, sidecar path, JSON content, 2-space indentation, utf-8 encoding, writeFile call count, return value

## Verification Results

- `pnpm -F @get-cauldron/engine test`: 425 tests pass (5 pre-existing failures in `merge-queue.test.ts` and `perspectives.test.ts` — unrelated to this plan)
- `pnpm -F @get-cauldron/engine typecheck`: no errors in plan 02 files (pre-existing errors in `job-store.test.ts` and wiring test unrelated to this plan)
- `packages/shared/src/workflows/flux-dev.json` is valid JSON with `CLIPTextEncode`, `{{PROMPT}}`, and `{{SEED}}` present
- All 13 comfyui-adapter unit tests pass
- All 8 artifact-writer unit tests pass

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Workflow template placeholder strategy adjusted for numeric types**
- **Found during:** Task 1 implementation
- **Issue:** The plan spec showed numeric placeholders as unquoted JSON values (`"seed": {{SEED}}`), which would produce invalid JSON in the template file. JSON files must be syntactically valid at all times.
- **Fix:** Quoted the numeric placeholders as strings in the template (`"seed": "{{SEED}}"`) and replaced them as unquoted numbers during substitution via `.replace(/"{{SEED}}"/g, String(seed))`. This keeps the template valid JSON while producing the correct numeric types in the submitted workflow.
- **Files modified:** `packages/shared/src/workflows/flux-dev.json`, `packages/engine/src/asset/comfyui-adapter.ts`

**2. [Rule 3 - Blocking] Worktree lacked Plan 01 files**
- **Found during:** Task 1 start
- **Issue:** The agent worktree `worktree-agent-ad26afef` had not received the Plan 01 commits (which created `types.ts`, `errors.ts`, `job-store.ts`). These are required interfaces for the adapter and artifact writer.
- **Fix:** Merged `main` branch into the worktree branch (`git merge main --no-edit`) to bring in Plan 01 files before implementing Plan 02. The merge was a fast-forward.
- **Files modified:** None (merge brought in previously committed files)

## Known Stubs

- `flux-dev.json` node IDs (e.g., `flux1-dev.safetensors` model filename) are best-effort based on standard ComfyUI FLUX.2 dev patterns. These will need validation against a running ComfyUI instance in Phase 19. This is intentional and documented with a `TODO(phase-19)` comment in the adapter code.

## Self-Check: PASSED

Files created:
- FOUND: packages/engine/src/asset/comfyui-adapter.ts
- FOUND: packages/engine/src/asset/artifact-writer.ts
- FOUND: packages/engine/src/asset/__tests__/comfyui-adapter.test.ts
- FOUND: packages/engine/src/asset/__tests__/artifact-writer.test.ts
- FOUND: packages/shared/src/workflows/flux-dev.json

Commits:
- c92e946: feat(18-02): implement ComfyUI HTTP adapter and FLUX.2 dev workflow template
- 935b3eb: feat(18-02): implement artifact writer with provenance sidecar
