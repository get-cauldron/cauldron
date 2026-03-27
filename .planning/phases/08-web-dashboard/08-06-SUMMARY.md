---
phase: 08-web-dashboard
plan: "06"
subsystem: ui
tags: [react, trpc, evolution, convergence, seed-lineage, sse, drizzle]

requires:
  - phase: 08-02
    provides: tRPC infrastructure, router pattern, shared DB types
  - phase: 08-03
    provides: project layout, tab navigation including Evolution tab
  - phase: 08-05
    provides: execution page with stub evolution timeline placeholder

provides:
  - Evolution tRPC router (evolutionRouter) with getSeedLineage, getEvolutionHistory, getConvergenceForSeed procedures
  - EvolutionTimeline component: 48px horizontal strip with generation dots, status colors, lateral thinking indicators
  - ConvergencePanel component: Collapsible panel with all 5 convergence signal rows and lateral thinking activations
  - SeedLineageTree component: vertical parent-child seed chain with goal diff indicators and empty state
  - Evolution page at /projects/[id]/evolution wiring all three components with tRPC and SSE
  - Execution page stub replaced with real EvolutionTimeline wired to getSeedLineage

affects:
  - 08-07 (settings page — no direct dependency but completes dashboard tab structure)
  - 08-08 (E2E tests — evolution page must be tested)

tech-stack:
  added: []
  patterns:
    - "evolutionRouter follows same pattern as executionRouter: file at trpc/routers/evolution.ts, imported into router.ts"
    - "Generation status derived from seed.evolutionContext.terminalReason and convergenceSignal fields"
    - "SSE-driven refetch: useSSE listens for EVOLUTION_EVENTS then calls refetch on relevant queries"
    - "ConvergencePanel uses Base UI Collapsible (same pattern from interview page)"

key-files:
  created:
    - packages/web/src/trpc/routers/evolution.ts
    - packages/web/src/components/evolution/EvolutionTimeline.tsx
    - packages/web/src/components/evolution/ConvergencePanel.tsx
    - packages/web/src/components/evolution/SeedLineageTree.tsx
    - packages/web/src/app/projects/[id]/evolution/page.tsx
  modified:
    - packages/web/src/trpc/router.ts
    - packages/web/src/app/projects/[id]/execution/page.tsx

key-decisions:
  - "GenerationStatus derived from evolutionContext.terminalReason and convergenceSignal in seed row — no separate status enum needed"
  - "Convergence signals stored in evolution_converged event payload.signals array — panel reads from convergenceEvent.payload"
  - "ConvergencePanel shows placeholder rows for all 5 signal types when no convergence event exists yet"
  - "hasLateralThinking simplified to false on execution page — full detail only on /evolution tab"

patterns-established:
  - "Evolution component pattern: export interface types alongside components for cross-file reuse"
  - "tRPC inArray with const-asserted arrays: inArray(events.type, [...] as unknown as string[]) to match eventTypeEnum column"

requirements-completed:
  - WEB-06
  - WEB-08

duration: 4min
completed: 2026-03-27
---

# Phase 8 Plan 06: Evolution Visualization Summary

**Evolution cycle history page with seed lineage tree, convergence signal panel, and timeline component reused in execution tab — all wired to tRPC and SSE**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-27T02:46:22Z
- **Completed:** 2026-03-27T02:50:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Evolution tRPC router with 3 procedures: seed lineage ordered by generation, evolution event history filtered to 6 event types, per-seed convergence detail including lateral thinking events and cost/token aggregates
- Four evolution visualization components: EvolutionTimeline (48px strip with generation dots, status colors, Sparkles indicators for lateral thinking), ConvergencePanel (Collapsible with 5 signal rows + lateral thinking activations with per-persona color badges), SeedLineageTree (vertical parent-child chain with goal diff indicators, empty state), and evolution page wiring them all together
- Execution page stub replaced: the 48px placeholder div from 08-05 is replaced with the real EvolutionTimeline component wired to getSeedLineage tRPC query

## Task Commits

1. **Task 1: Evolution tRPC router** - `2d0c2c7` (feat)
2. **Task 2: Evolution components and evolution page** - `502c525` (feat)

## Files Created/Modified

- `packages/web/src/trpc/routers/evolution.ts` - evolutionRouter with getSeedLineage, getEvolutionHistory, getConvergenceForSeed
- `packages/web/src/trpc/router.ts` - merged evolutionRouter into appRouter
- `packages/web/src/components/evolution/EvolutionTimeline.tsx` - horizontal 48px timeline strip
- `packages/web/src/components/evolution/ConvergencePanel.tsx` - Collapsible convergence signals panel
- `packages/web/src/components/evolution/SeedLineageTree.tsx` - vertical seed lineage tree
- `packages/web/src/app/projects/[id]/evolution/page.tsx` - evolution tab page
- `packages/web/src/app/projects/[id]/execution/page.tsx` - stub replaced with real EvolutionTimeline

## Decisions Made

- GenerationStatus derived from `seed.evolutionContext.terminalReason` and `convergenceSignal` fields in the seed row — no separate status enum in the DB needed
- Convergence signals stored in the evolution_converged event payload.signals array — ConvergencePanel reads from `convergenceEvent.payload.signals`
- ConvergencePanel shows all 5 signal type rows (with zero values) even when no convergence event exists yet, giving users a consistent layout
- On execution tab, `hasLateralThinking` is simplified to `false` — the detailed lateral thinking history is only surfaced on the /evolution tab

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Evolution visualization complete per WEB-06 and WEB-08
- Phase 08-07 (settings) can proceed independently
- Phase 08-08 (E2E tests) can cover the full tab suite including evolution page
- Dashboard tab structure is now complete: Interview, Execution, Evolution, Costs

---
*Phase: 08-web-dashboard*
*Completed: 2026-03-27*
