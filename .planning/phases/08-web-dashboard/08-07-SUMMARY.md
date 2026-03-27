---
phase: 08-web-dashboard
plan: "07"
subsystem: ui
tags: [trpc, costs, settings, drizzle, react, shadcn]

requires:
  - phase: 08-02
    provides: tRPC infrastructure, projectsRouter, projects.updateSettings mutation, projects.archive mutation
  - phase: 08-03
    provides: project layout with tab nav, shared UI components (Card, Button, Input, Dialog, Progress, Separator)

provides:
  - costsRouter with 5 aggregation procedures (getProjectSummary, getByModel, getByStage, getByCycle, getTopBeads)
  - Cost breakdown page at /projects/{id}/costs with summary cards, per-model/stage/cycle breakdowns, top beads
  - Settings page at /projects/{id}/settings with budget config, model overrides, and danger zone

affects:
  - Any phase referencing WEB-07 or D-24
  - Future phases reading cost data or modifying project settings

tech-stack:
  added: []
  patterns:
    - "inArray() for batch bead title enrichment in tRPC query"
    - "useParams() for projectId in client pages nested under server layout"
    - "base-ui Dialog render prop pattern (not asChild) for trigger wrapping"

key-files:
  created:
    - packages/web/src/trpc/routers/costs.ts
    - packages/web/src/app/projects/[id]/costs/page.tsx
    - packages/web/src/app/projects/[id]/settings/page.tsx
  modified:
    - packages/web/src/trpc/router.ts

key-decisions:
  - "inArray() used for bead title enrichment in getTopBeads — no SQL ANY() workaround needed since Drizzle inArray supports arrays"
  - "base-ui DialogTrigger uses render prop (not asChild) — base-ui does not support the asChild pattern from Radix"
  - "Settings page uses soft delete (projects.archive) — hard delete deferred per plan spec"
  - "Model overrides input is comma-separated text — simple v1 approach, advanced selector deferred"

patterns-established:
  - "Plain-div bar charts for cycle cost trend — no external chart library required for simple bars"
  - "formatCents(cents) helper: divide by 100, show $X.XX"

requirements-completed:
  - WEB-07
  - WEB-08

duration: 3min
completed: "2026-03-27"
---

# Phase 08 Plan 07: Cost Dashboard and Project Settings Summary

**tRPC costsRouter with 5 SQL aggregation queries plus cost breakdown and project settings pages in HZD dark theme**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-27T02:36:08Z
- **Completed:** 2026-03-27T02:39:14Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created `costsRouter` with procedures for project summary, per-model, per-stage, per-cycle, and top-bead cost breakdowns
- Cost breakdown page at `/projects/{id}/costs`: 3 summary stat cards, 4 breakdown sections, empty state per UI-SPEC
- Settings page at `/projects/{id}/settings`: budget limits, max concurrent beads, per-stage model overrides, danger zone with dialog

## Task Commits

1. **Task 1: Costs tRPC router** - `4621f9a` (feat)
2. **Task 2: Cost breakdown page and project settings page** - `e907d94` (feat)

## Files Created/Modified

- `packages/web/src/trpc/routers/costs.ts` - 5 aggregation procedures using Drizzle SQL helpers with bead title enrichment
- `packages/web/src/trpc/router.ts` - Added costsRouter registration
- `packages/web/src/app/projects/[id]/costs/page.tsx` - Full cost breakdown UI with summary cards, breakdowns, empty state
- `packages/web/src/app/projects/[id]/settings/page.tsx` - Budget config, model overrides, danger zone with confirmation dialog

## Decisions Made

- `inArray()` used for getTopBeads bead enrichment instead of raw SQL `ANY()` — Drizzle's inArray is clean and type-safe
- `base-ui DialogTrigger` uses `render` prop not `asChild` — base-ui doesn't support Radix's asChild pattern
- Soft delete via `projects.archive` — hard delete deferred to v2 as specified in plan
- Model overrides use comma-separated text input — adequate for v1, advanced multi-select deferred

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed DialogTrigger asChild to render prop pattern**
- **Found during:** Task 2 (settings page)
- **Issue:** Plan used `asChild` on DialogTrigger but base-ui/react doesn't support asChild; caused TypeScript error
- **Fix:** Changed `<DialogTrigger asChild><Button /></DialogTrigger>` to `<DialogTrigger render={<Button />}>` per base-ui API
- **Files modified:** packages/web/src/app/projects/[id]/settings/page.tsx
- **Verification:** TypeScript check passes for new files
- **Committed in:** e907d94 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Necessary for correct base-ui API usage. No scope change.

## Issues Encountered

- Pre-existing TypeScript errors in `MoleculeGroup.tsx` (asChild) and `interview.ts` (argument count) — out of scope, logged as pre-existing, not fixed

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Cost visibility loop is complete: usage tracked in Phase 2 → displayed in Phase 8 Plan 07
- Settings page ready for model override configuration flow
- Both pages missing from tab nav (TABS array in layout.tsx has "Costs" but not "Settings") — settings accessible via direct URL `/projects/{id}/settings`

---
*Phase: 08-web-dashboard*
*Completed: 2026-03-27*
