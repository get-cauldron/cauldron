---
phase: quick
plan: 260329-kd3
subsystem: web-execution
tags: [ui, e2e, decomposition, execution]
dependency_graph:
  requires: [execution-router-mutations]
  provides: [start-decomposition-button, e2e-stage5-decomposition-trigger]
  affects: [execution-page, pipeline-live-e2e]
tech_stack:
  added: []
  patterns: [tRPC-mutation-chaining, queryClient-invalidation, absolute-positioned-overlay-button]
key_files:
  created: []
  modified:
    - packages/web/src/app/projects/[id]/execution/page.tsx
    - packages/web/e2e/pipeline-live.spec.ts
decisions:
  - "queryFilter pattern for cache invalidation (consistent with settings page)"
  - "Overlay button with pointer-events:none container to avoid blocking DAGCanvas interactions"
metrics:
  duration: 2min
  completed: "2026-03-29T20:44:04Z"
---

# Quick Task 260329-kd3: Add Start Decomposition Button Summary

**One-liner:** Start Decomposition button on execution page triggers decomposition + execution mutations with loading states, plus E2E Stage 5 now asserts the button exists and clicks it.

## What Was Done

### Task 1: Add Start Decomposition button to execution page (2606bdd)

Added a "Start Decomposition" button to the execution page that appears when:
- The DAG query has loaded
- No beads exist (empty DAG)
- A seed exists (seedId is not null)

The button triggers two tRPC mutations sequentially:
1. `triggerDecomposition` -- decomposes the seed into beads
2. `triggerExecution` -- dispatches ready beads for execution

Loading states cycle through "Decomposing..." and "Starting execution..." while disabled. After completion, the DAG query cache is invalidated so DAGCanvas re-fetches and renders the new beads, causing the button to disappear.

### Task 2: Update E2E test Stage 5 (1d95773)

Replaced the weak button-finding pattern (5s timeout with silent skip) with explicit assertions:
- Waits for Next.js compilation to finish
- Asserts "Start Decomposition" button is visible (fails if missing)
- Clicks the button
- Waits for button to disappear (decomposition + execution complete)
- Then proceeds to existing bead node and execution completion checks

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used queryFilter instead of getQueryKey for cache invalidation**
- **Found during:** Task 1
- **Issue:** Plan specified `getQueryKey` which is not a standard tRPC v11 method
- **Fix:** Used `queryFilter` pattern consistent with settings page
- **Files modified:** packages/web/src/app/projects/[id]/execution/page.tsx
- **Commit:** 2606bdd

## Known Stubs

None -- all functionality is fully wired to existing tRPC mutations.

## Verification

- Typecheck: `pnpm -F @get-cauldron/web typecheck` passes
- Manual verification deferred (requires running stack with a crystallized seed)

## Self-Check: PASSED
