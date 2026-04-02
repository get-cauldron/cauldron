# Phase 27: Structured Conflict Resolution - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Merge conflict resolution writes only Zod-schema-validated JSON per file to source — LLM prose can never reach the filesystem. Replace `generateText` with `generateObject` using a Zod schema in the `resolveConflict` method of `merge-queue.ts`.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. The current `resolveConflict` in `packages/engine/src/execution/merge-queue.ts` uses `generateText` + string-scanning for confidence. Must switch to `generateObject` with a Zod schema that returns per-file resolved contents and a typed confidence enum.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `resolveConflict()` in `packages/engine/src/execution/merge-queue.ts:166-240` — current unstructured implementation
- `gateway.generateText()` — current call; needs switching to `generateObject()`
- Gateway already supports Vercel AI SDK which has `generateObject` with Zod schemas

### Established Patterns
- Vercel AI SDK `generateObject` with Zod 4 schemas used elsewhere in the codebase
- `AI_NoObjectGeneratedError` is the standard error when Zod validation fails
- Confidence is currently string-scanned from prose — needs to become a typed Zod enum

### Integration Points
- `MergeQueue.resolveConflict()` — the single method to refactor
- `merge-queue.test.ts` — existing test file with mocks for the resolve flow
- Gateway interface may need a `generateObject` method if not already present

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.

</deferred>
