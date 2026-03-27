---
phase: 14-wire-interview-start-fix-seed-crystallization-path
plan: "02"
subsystem: web/interview-page, cli/interview-command
tags: [interview, trpc, web, cli, gap-closure]
dependency_graph:
  requires:
    - "startInterview tRPC mutation (Plan 14-01)"
    - "trpc.interview.startInterview in web router"
    - "client.interview.startInterview in CLI client"
  provides:
    - "Web interview page auto-starts interview on mount when status=not_started"
    - "CLI interview command starts interview before entering turn loop"
  affects:
    - "packages/web/src/app/projects/[id]/interview/page.tsx"
    - "packages/cli/src/commands/interview.ts"
    - "packages/cli/src/__tests__/interview-command.test.ts"
tech_stack:
  added: []
  patterns:
    - "useMutation + useEffect guard (isPending + isSuccess) to prevent infinite mutation loops"
    - "CLI auto-start before turn loop with spinner feedback and re-fetch"
key_files:
  created: []
  modified:
    - "packages/web/src/app/projects/[id]/interview/page.tsx"
    - "packages/cli/src/commands/interview.ts"
    - "packages/cli/src/__tests__/interview-command.test.ts"
decisions:
  - "useEffect guard uses both isPending and isSuccess to prevent re-firing after success — status returns to not_started briefly during refetch which without the guard would re-trigger"
  - "CLI startInterview placed before flags.json check and before turn loop — ensures fresh state for both JSON output and interactive mode"
metrics:
  duration: "12min"
  completed: "2026-03-27T21:36:00Z"
  tasks: 2
  files: 3
---

# Phase 14 Plan 02: Wire Interview Consumer Wiring (Web + CLI) — Summary

## One-liner

Wired web interview page and CLI command to auto-call `startInterview` when status is `not_started`, closing the P0 gap where new projects could never begin interviews.

## What Was Built

**Task 1: Wire web interview page to call startInterview on mount**

- Added `startInterviewMutation` using `useMutation(trpc.interview.startInterview.mutationOptions())`
- Added `useEffect` that fires when `transcriptData?.status === 'not_started'`, calling `startInterviewMutation.mutate({ projectId })`
- Guard conditions `!isPending && !isSuccess` prevent infinite mutation loops — after the mutation succeeds and `transcriptQuery.refetch()` is called, status transitions from `not_started` to `active`, so the effect does not re-fire
- Empty state text shows "Starting interview..." while mutation is in flight and "Preparing your Socratic interview session." as the sub-text
- TypeScript compiles clean, 31 web tests pass

**Task 2: Wire CLI interview command to call startInterview for new projects**

- Added `if (state.status === 'not_started')` block after initial `getTranscript` call
- Block calls `client.interview.startInterview.mutate({ projectId })` with `createSpinner` feedback
- On success: re-fetches transcript so `state` is fresh before turn loop and `--json` flag output
- Throws on failure — consistent with all other CLI error handling
- No `@get-cauldron/engine` imports added — uses tRPC client exclusively per Phase 09 decision

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated CLI interview tests to include startInterview mock**

- **Found during:** Task 2 verification
- **Issue:** Existing tests (Test 2 and Test 3) built inline mock clients without `startInterview` mutation. After wiring, the command calls `startInterview.mutate()` when `status === 'not_started'` — both tests used `not_started` state, so they failed with "Cannot read properties of undefined (reading 'mutate')"
- **Fix:** Added `startInterview: { mutate: vi.fn().mockResolvedValue(...) }` to the `makeClient` helper and to the inline client in Test 2
- **Files modified:** `packages/cli/src/__tests__/interview-command.test.ts`
- **Commit:** `513029b`

## Known Stubs

None — both consumers are now fully wired to `startInterview`.

## Self-Check: PASSED

- `packages/web/src/app/projects/[id]/interview/page.tsx` — FOUND
- `packages/cli/src/commands/interview.ts` — FOUND
- `packages/cli/src/__tests__/interview-command.test.ts` — FOUND
- Commit `42f1d95` — FOUND (feat(14-02): wire web interview page...)
- Commit `b89b794` — FOUND (feat(14-02): wire CLI interview command...)
- Commit `513029b` — FOUND (fix(14-02): update CLI interview tests...)
- TypeScript compile (web): PASSED
- TypeScript compile (cli): PASSED
- Web tests (31): PASSED
- CLI tests (87): PASSED
