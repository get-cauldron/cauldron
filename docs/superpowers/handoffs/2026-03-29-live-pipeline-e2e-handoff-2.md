# Live Pipeline E2E Test — Handoff #2

**Date:** 2026-03-29
**Status:** Stages 1-4 passing, Stage 5 (decomposition) needs trigger mechanism

## What Changed Since Handoff #1

### App Bugs Fixed

| # | Bug | Root Cause | Fix |
|---|-----|-----------|-----|
| 1 | SeedApprovalCard never appears | `getSummary` returns null in reviewing phase (no seed exists yet) | Auto-generate summary via `synthesizeFromTranscript` in `getSummary` when phase=reviewing and no seed |
| 2 | `summaryQuery` not refetched after phase transition | `handleSendAnswer` only refetches `transcriptQuery`, not `summaryQuery` | Added `void summaryQuery.refetch()` after sendAnswer |
| 3 | `seedId` lost on page navigation | `seedId` is local React state, lost when Stage 4 loads fresh page | Added `seedId` return to `getSummary` endpoint + `useEffect` to initialize from query |
| 4 | React controlled inputs ignore `fill()` | Playwright's `fill()` sets DOM value but doesn't trigger React's synthetic onChange | Use native `HTMLInputElement.prototype.value` setter + dispatch `input`/`change` events |

### Test Fixes

| # | Fix | Detail |
|---|-----|--------|
| 1 | Interview-active detection | Check for "gathering" text visibility OR "Review the seed summary" text, not "Interview not started" |
| 2 | Phase transition handling | Detect "Review the seed summary above" during interview loop → break and handle seed approval inline |
| 3 | Seed approval in same page | Moved seed approval from Stage 3 into Stage 2 to avoid stale-state issues with fresh page |
| 4 | Holdout card interaction | Expand → approve → collapse each card to keep list compact for scrolling |
| 5 | First message retry | Added page reload on failure, wait for AI question or Thinking indicator |
| 6 | Stage 1 compilation guard | Wait for "Compiling" to be hidden before form interaction |

### Files Modified

| File | Changes |
|------|---------|
| `packages/web/src/trpc/routers/interview.ts` | Added `synthesizeFromTranscript` import, auto-generate summary in `getSummary`, return `seedId` from all paths |
| `packages/web/src/app/projects/[id]/interview/page.tsx` | Added `summaryQuery.refetch()` after sendAnswer, `useEffect` to initialize `seedId` from summary query |
| `packages/web/e2e/pipeline-live.spec.ts` | All Stage 2-4 fixes above |

## Current State

**4 of 6 stages pass consistently:**

```
Stage 1: Create project via UI .................. PASS
Stage 2: Complete interview + crystallize ....... PASS (2-9 turns, real LLM calls)
Stage 3: Verify seed crystallized ............... PASS
Stage 4: Approve holdout scenarios and seal ..... PASS (9-11 holdouts)
Stage 5: Trigger decomposition + execute beads .. FAIL
Stage 6: Evaluation/evolution ................... SKIP
```

## Where It Stopped

**Stage 5 — Decomposition not triggered.** After sealing holdouts, the execution page shows "Execution not started. The DAG will appear here once decomposition begins." The test navigates to the execution page and waits for `.react-flow__node` elements, but none appear.

### Root Cause

The pipeline needs a trigger to start decomposition after holdouts are sealed. Looking at the execution page, there's likely a button to start decomposition, or it should be auto-triggered by an Inngest event after sealing.

### Investigation Needed

1. Check what triggers decomposition — is there a "Decompose" button on the execution page? Or does an Inngest function auto-trigger?
2. Check the Inngest dev dashboard at :8290 to see if a decomposition function was dispatched
3. The execution page shows "Generation 0 — converged" which may indicate an issue with the evolution state

### Suggested Fix

Either:
- Find and click the decomposition trigger button on the execution page
- Or trigger decomposition via a tRPC mutation call
- Or check if an Inngest function should auto-fire after `sealHoldouts`

## How to Run

```bash
set -a && source .env && set +a && pnpm -F @get-cauldron/web test:live
```

## Architecture Notes (Updated)

- The `getSummary` tRPC endpoint now auto-generates seed summaries via LLM when in reviewing phase (lazy generation)
- The interview page initializes `seedId` from the summary query on mount, so holdout cards load correctly on fresh page loads
- Holdout cards use Radix Collapsible — must expand to access Approve/Reject buttons, then collapse to keep the list navigable
