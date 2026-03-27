---
phase: 08-web-dashboard
plan: "05"
subsystem: web-dashboard
tags: [dag-visualization, react-flow, dagre, sse, bead-detail, terminal-logs, code-diffs]
dependency_graph:
  requires: [08-02, 08-03]
  provides: [execution-dag-canvas, bead-detail-panel, execution-trpc-router]
  affects: [08-06]
tech_stack:
  added:
    - "@xyflow/react (ReactFlow DAG canvas with custom node/edge types)"
    - "@dagrejs/dagre (hierarchical auto-layout TB direction)"
    - "ansi-to-html (ANSI escape code -> HTML span conversion for terminal logs)"
    - "react-diff-viewer-continued (split-mode side-by-side code diffs)"
  patterns:
    - "ReactFlow custom node type (beadNode) with Handle components for TB layout"
    - "ReactFlow custom edge components using getBezierPath per edge dependency type"
    - "dagre center-origin correction: x - width/2, y - height/2"
    - "useBeadStatus SSE overlay applied to static DAG structure from tRPC"
    - "ReactFlowProvider wrapper around inner component to enable useReactFlow hook"
key_files:
  created:
    - packages/web/src/trpc/routers/execution.ts
    - packages/web/src/lib/dag-layout.ts
    - packages/web/src/components/dag/BeadNode.tsx
    - packages/web/src/components/dag/MoleculeGroup.tsx
    - packages/web/src/components/dag/EdgeStyles.tsx
    - packages/web/src/components/dag/DAGCanvas.tsx
    - packages/web/src/components/bead/TerminalPane.tsx
    - packages/web/src/components/bead/DiffViewer.tsx
    - packages/web/src/components/bead/BeadDetailSheet.tsx
    - packages/web/src/app/projects/[id]/execution/page.tsx
  modified:
    - packages/web/src/trpc/router.ts
decisions:
  - "beadEdges schema uses fromBeadId/toBeadId (not sourceBeadId/targetBeadId) — execution router corrected to match actual schema"
  - "CollapsibleTrigger (base-ui) has no asChild prop — MoleculeGroup uses style prop directly on CollapsibleTrigger"
  - "ReactFlowProvider wraps DAGCanvas inner component so useReactFlow hook has context"
  - "Evolution timeline stub: 48px div with 'Generation timeline' text — intentionally deferred to Plan 08-06 Task 2"
metrics:
  duration_minutes: 6
  completed_date: "2026-03-27"
  tasks_completed: 3
  files_created: 10
  files_modified: 1
---

# Phase 8 Plan 05: Live DAG Execution Visualization Summary

**One-liner:** React Flow DAG canvas with dagre layout, SSE-driven real-time bead status updates, HZD edge styles, and slide-out bead detail panel with ANSI terminal logs and split-mode code diffs.

## What Was Built

### Task 1: Execution tRPC Router + Dagre Layout Utility (commit: 6171708)

**execution.ts router** — 4 procedures:
- `getDAG`: fetches all beads + edges for a seed ID
- `getProjectDAG`: finds latest seed for a project then fetches its DAG
- `getBeadDetail`: returns bead row + ordered events for spec/log/diff display
- `respondToEscalation`: appends `conflict_resolved` event via `appendEvent`

**dag-layout.ts** — `getLayoutedElements(nodes, edges, direction='TB')`:
- Uses `@dagrejs/dagre` with `rankdir: 'TB'`, `nodesep: 32`, `ranksep: 48`
- Exports `NODE_WIDTH = 240`, `NODE_HEIGHT = 80`
- Applies center-origin correction: `x - width/2, y - height/2`

### Task 2a: DAG Canvas Components + Execution Page (commit: d50415f)

**BeadNode.tsx** — Custom React Flow node registered as type `beadNode`:
- Status color mapping: pending=#3d5166, active=#f5a623, completed=#00d4aa, failed=#e5484d, blocked=#8a5c00
- Active state: amber drop-shadow `filter: drop-shadow(0 0 8px rgba(245,166,35,0.4))` + pulse animation
- Status icons via lucide-react (Clock/Play/Check/X/Lock)
- Mini iteration progress bar using shadcn Progress
- Source handle (bottom) + target handle (top) for TB layout

**MoleculeGroup.tsx** — Custom group node type `moleculeGroup`:
- Dashed border #1a2330, semi-transparent background
- Collapsible via base-ui Collapsible with open/close toggle
- Shows child count badge when collapsed

**EdgeStyles.tsx** — 4 custom edge components per D-09:
- `BlocksEdge`: solid #6b8399, 2px
- `ParentChildEdge`: dashed #3d5166, 1.5px, strokeDasharray="8 4"
- `ConditionalEdge`: dotted #3d5166, 1.5px, strokeDasharray="2 4"
- `WaitsForEdge`: solid #00d4aa, 2px + `filter: drop-shadow(0 0 4px #00d4aa)` teal glow

**DAGCanvas.tsx** — ReactFlow wrapper with:
- tRPC `execution.getProjectDAG` initial data fetch
- `useBeadStatus` SSE overlay applied to node data on bead status changes
- Auto-pan `fitView` targeting newly-active beads (800ms duration)
- MiniMap with status-based node colors, Controls, Background (gap=16, opacity=0.3)
- "Execution not started" empty state

**Execution page** (`/projects/[id]/execution/page.tsx`):
- 48px stub placeholder for EvolutionTimeline (Plan 08-06 Task 2 will wire real component)
- DAGCanvas below filling remaining height
- BeadDetailSheet conditionally rendered on node click
- Escalation dialog (D-22): retry/skip/guidance/abort options + freeform text, calls `execution.respondToEscalation`

### Task 2b: Bead Detail Panel (commit: e6eb902)

**TerminalPane.tsx** — ANSI-aware log renderer per D-16:
- `ansi-to-html` converts ANSI escape codes to HTML spans with HZD color defaults
- Auto-scroll to bottom on new logs
- Scroll-up detection pauses auto-scroll; "Resume auto-scroll" button appears

**DiffViewer.tsx** — Split-mode code diff per D-17:
- `react-diff-viewer-continued` with `splitView={true}`, `useDarkTheme={true}`
- HZD theme: teal tint for additions `rgba(0,212,170,0.1)`, red tint for removals `rgba(229,72,77,0.1)`
- Geist Mono font family

**BeadDetailSheet.tsx** — 480px slide-out right panel per D-11:
- Uses base-ui Sheet (right side)
- Header: bead name + status badge + elapsed time + agent model
- Three tabs: Spec (raw bead spec), Logs (TerminalPane), Diff (DiffViewer)
- Fetches via `execution.getBeadDetail` tRPC query

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CollapsibleTrigger has no asChild prop**
- **Found during:** Task 2a typecheck
- **Issue:** `CollapsibleTrigger` from base-ui doesn't support `asChild` (unlike Radix UI). The plan's component pattern assumed Radix-style `asChild`.
- **Fix:** Applied style props directly to `CollapsibleTrigger` instead of wrapping a `<div>` with asChild.
- **Files modified:** `packages/web/src/components/dag/MoleculeGroup.tsx`
- **Commit:** d50415f (included in Task 2a commit)

**2. [Rule 1 - Bug] Schema field names differ from plan spec**
- **Found during:** Task 1 implementation
- **Issue:** Plan showed `sourceBeadId`/`targetBeadId` in edge queries and `name` on beads. Actual schema uses `fromBeadId`/`toBeadId` and `title`.
- **Fix:** Corrected all queries and node data mapping to use actual schema field names.
- **Files modified:** `packages/web/src/trpc/routers/execution.ts`, `packages/web/src/components/dag/DAGCanvas.tsx`
- **Commit:** 6171708, d50415f

**3. [Rule 2 - Missing functionality] Router file updated by parallel agent**
- **Found during:** Task 1 router update
- **Issue:** Parallel agents (08-03, 08-04) had added `costsRouter` and `interviewRouter` to `router.ts` during execution.
- **Fix:** Added `executionRouter` alongside existing routers without removing others.
- **Files modified:** `packages/web/src/trpc/router.ts`

## Known Stubs

| File | Line | Stub | Reason |
|------|------|------|--------|
| `packages/web/src/app/projects/[id]/execution/page.tsx` | 151-165 | 48px `<div>` with text "Generation timeline" | Plan 08-05 explicitly defers EvolutionTimeline to Plan 08-06 Task 2 |

The stub div intentionally does not import `@/components/evolution/EvolutionTimeline` — the real component will be wired by Plan 08-06.

## Self-Check: PASSED

Files created:
- packages/web/src/trpc/routers/execution.ts — FOUND
- packages/web/src/lib/dag-layout.ts — FOUND
- packages/web/src/components/dag/BeadNode.tsx — FOUND
- packages/web/src/components/dag/MoleculeGroup.tsx — FOUND
- packages/web/src/components/dag/EdgeStyles.tsx — FOUND
- packages/web/src/components/dag/DAGCanvas.tsx — FOUND
- packages/web/src/components/bead/TerminalPane.tsx — FOUND
- packages/web/src/components/bead/DiffViewer.tsx — FOUND
- packages/web/src/components/bead/BeadDetailSheet.tsx — FOUND
- packages/web/src/app/projects/[id]/execution/page.tsx — FOUND

Commits:
- 6171708 feat(08-05): execution tRPC router + dagre layout utility
- d50415f feat(08-05): DAG canvas components and execution page
- e6eb902 feat(08-05): bead detail panel with terminal logs and code diffs
