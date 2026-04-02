---
phase: 27-structured-conflict-resolution
plan: "01"
subsystem: engine/execution
tags: [merge-queue, conflict-resolution, structured-output, zod, generateObject, CONC-05]
dependency_graph:
  requires: []
  provides: [structured-conflict-resolution]
  affects: [merge-queue, conflict-resolution-pipeline]
tech_stack:
  added: []
  patterns: [generateObject-with-zod-schema, typed-enum-confidence]
key_files:
  created: []
  modified:
    - packages/engine/src/execution/merge-queue.ts
    - packages/engine/src/execution/__tests__/merge-queue.test.ts
decisions:
  - Use ConflictResolutionSchema with z.enum confidence so confidence is a typed value, never a scanned string
  - Iterate result.object.files for writes and git-add instead of the original conflicts array
  - Let NoObjectGeneratedError propagate uncaught — explicit failure is better than silent fallback
metrics:
  duration_minutes: 8
  completed_date: "2026-04-02"
  tasks_completed: 2
  files_modified: 2
---

# Phase 27 Plan 01: Structured Conflict Resolution Summary

Replaced string-scanning `generateText` heuristic in `MergeQueue.resolveConflict()` with `generateObject()` and a Zod schema, eliminating the risk of raw LLM prose being written to source files (CONC-05).

## What Was Built

**`ConflictResolutionSchema`** (module-level, in `merge-queue.ts`):
- `confidence: z.enum(['high', 'low'])` — typed enum, not string-scanned
- `files: z.array({ path: string, resolved_content: string })` — per-file structured output

**`resolveConflict()` refactor:**
- Calls `gateway.generateObject` with `ConflictResolutionSchema` instead of `generateText`
- Confidence check: `result.object.confidence === 'low'` (typed enum, no `.includes()` scanning)
- File writes: `writeFileSync(join(projectRoot, file.path), file.resolved_content)` — structured content only
- Git stage loop: iterates `result.object.files` instead of original `conflicts` array
- `NoObjectGeneratedError` propagates naturally — no silent catch

**Test updates (`merge-queue.test.ts`):**
- Gateway mock changed from `{ generateText }` to `{ generateObject }`
- High-confidence tests mock structured object with `files[].resolved_content`
- `writeFileSync` assertion confirms structured content is written (not raw prose)
- Low-confidence test mocks structured `{ confidence: 'low', files: [] }`
- New test: `NoObjectGeneratedError` propagates on validation failure (CONC-05)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `ebcb468` | feat(27-01): replace generateText with generateObject in resolveConflict |
| Task 2 | `95004ce` | test(27-01): update merge-queue tests for generateObject and add CONC-05 propagation test |

## Verification Results

- `grep -c "generateObject" merge-queue.ts` → 1 (present)
- `grep -c "generateText" merge-queue.ts` → 0 (eliminated)
- `grep -c "ConflictResolutionSchema" merge-queue.ts` → 2 (definition + usage)
- `grep -c "z.enum" merge-queue.ts` → 1 (typed confidence enum)
- `grep -c "result.object.confidence" merge-queue.ts` → 1 (typed check)
- `grep -c "file.resolved_content" merge-queue.ts` → 1 (structured write)
- `grep -c "includes.*confidence" merge-queue.ts` → 0 (string-scanning eliminated)
- `grep -c "responseText" merge-queue.ts` → 0 (raw prose variable eliminated)
- `grep -c "generateObject" merge-queue.test.ts` → 8 (>= 5 required)
- `grep -c "NoObjectGeneratedError" merge-queue.test.ts` → 4 (>= 2 required)
- `grep -c "resolved_content" merge-queue.test.ts` → 3 (>= 2 required)
- `grep -c "CONC-05" merge-queue.test.ts` → 1 (present)
- All merge-queue tests: PASS (pre-existing inngest failures in holdout/events.test.ts unrelated)
- TypeCheck: No errors in merge-queue.ts (pre-existing inngest missing-module errors in other files)

## Deviations from Plan

None — plan executed exactly as written. The NoObjectGeneratedError constructor signature matched the plan's specification (confirmed via `ai/dist/index.d.ts`).

## Known Stubs

None.

## Self-Check: PASSED

- `packages/engine/src/execution/merge-queue.ts` — FOUND
- `packages/engine/src/execution/__tests__/merge-queue.test.ts` — FOUND
- Commit `ebcb468` — FOUND
- Commit `95004ce` — FOUND
