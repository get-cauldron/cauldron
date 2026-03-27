---
phase: 08-web-dashboard
plan: 08
subsystem: web
tags: [gap-closure, typescript, trpc, sse, holdouts]
dependency_graph:
  requires: [08-04, 08-06]
  provides: [WEB-02, WEB-05, WEB-06, WEB-09]
  affects: []
tech_stack:
  added: []
  patterns:
    - pgEnum union type for Drizzle inArray queries
    - String() coercion for Drizzle timestamp fields (avoids instanceof Date fragility)
    - seedId state capture from mutation result to enable dependent queries
key_files:
  modified:
    - packages/web/src/trpc/routers/evolution.ts
    - packages/web/src/app/projects/[id]/evolution/page.tsx
    - packages/web/src/app/projects/[id]/interview/page.tsx
decisions:
  - "Use (typeof eventTypeEnum.enumValues)[number][] for Drizzle inArray on pgEnum columns — avoids unsafe string[] cast"
  - "String() coercion for occurredAt/createdAt date fields — handles both Date and string forms from Drizzle without instanceof check"
  - "seedId state captured from approveSummary return value — enables getHoldouts query without additional DB lookup"
metrics:
  duration: 5min
  completed_date: "2026-03-27T13:15:42Z"
  tasks: 2
  files: 3
---

# Phase 08 Plan 08: Gap Closure Summary

**One-liner:** Fixed 3 blocking verification gaps — pgEnum inArray type safety in evolution router, correct SSE URL on evolution page, and holdout review flow wired from seedId state.

## What Was Built

Closed all 3 blocking gaps identified in 08-VERIFICATION.md:

1. **TypeScript typecheck now passes** — `pnpm --filter @cauldron/web typecheck` exits with 0 errors (was 4 errors).

2. **Evolution page SSE URL corrected** — Changed `/api/sse/${projectId}` to `/api/events/${projectId}` in evolution/page.tsx line 103. The SSE Route Handler lives at `/api/events/[projectId]/route.ts`; no `/api/sse/` route exists. Evolution timeline will now receive live SSE updates.

3. **Holdout review flow wired** — Interview page now captures `seedId` from `approveSummary` mutation result, queries `trpc.interview.getHoldouts` with that seedId, and populates `holdoutScenarios` from real tRPC data. The Seal Holdout Tests button uses the real `seedId` state. HoldoutCard components will now render after seed crystallization.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix TypeScript errors in evolution.ts and evolution/page.tsx | f2bda44 | packages/web/src/trpc/routers/evolution.ts, packages/web/src/app/projects/[id]/evolution/page.tsx |
| 2 | Wire holdout review flow in interview page | 6abea18 | packages/web/src/app/projects/[id]/interview/page.tsx |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm --filter @cauldron/web typecheck` | PASS — 0 errors |
| `pnpm --filter @cauldron/web test` | PASS — 1 passed |
| `grep "as unknown as string" evolution.ts` | 0 matches |
| `grep "api/events" evolution/page.tsx` | 1 match (correct URL) |
| `grep "getHoldouts" interview/page.tsx` | 2 matches (wired) |
| `holdoutScenarios: HoldoutScenarioLocal[] = []` hardcoded | Not found |
| `'placeholder'` in interview/page.tsx | Not found |

## Known Stubs

None — all 3 gaps are fully closed. The holdout review flow is wired to real tRPC data; SSE connects to the real endpoint; TypeScript compilation is clean.

## Self-Check: PASSED

- f2bda44 exists: FOUND
- 6abea18 exists: FOUND
- packages/web/src/trpc/routers/evolution.ts modified: FOUND
- packages/web/src/app/projects/[id]/evolution/page.tsx modified: FOUND
- packages/web/src/app/projects/[id]/interview/page.tsx modified: FOUND
- .planning/phases/08-web-dashboard/08-08-SUMMARY.md: FOUND
