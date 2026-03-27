---
phase: 08-web-dashboard
plan: "02"
subsystem: web
tags: [next.js, shell, trpc, hzd-theme, navigation, projects, escalation]
dependency_graph:
  requires: [packages/web (08-01 scaffold), packages/shared (projects/events/llm-usage schema)]
  provides: [HZD shell components, project CRUD tRPC router, project list landing page, new project form, project detail shell]
  affects: [all Phase 8 plans that build on the project tab pages (08-03 interview, 08-04 execution, etc.)]
tech_stack:
  added: []
  patterns: [NavSidebar with localStorage collapse state, usePathname active detection, SSE-backed escalation wiring, tRPC projectsRouter sub-router, HydrationBoundary RSC prefetch pattern, per-layout NavSidebar for project context injection]
key_files:
  created:
    - packages/web/src/components/shell/CauldronLogo.tsx
    - packages/web/src/components/shell/HexBackground.tsx
    - packages/web/src/components/shell/NavSidebar.tsx
    - packages/web/src/components/shell/ProjectHeader.tsx
    - packages/web/src/components/shell/EscalationBanner.tsx
    - packages/web/src/trpc/routers/projects.ts
    - packages/web/src/app/projects/page.tsx
    - packages/web/src/app/projects/ProjectListClient.tsx
    - packages/web/src/app/projects/new/page.tsx
    - packages/web/src/app/projects/[id]/layout.tsx
    - packages/web/src/app/projects/[id]/ProjectShellClient.tsx
    - packages/web/src/app/projects/[id]/TabLinkClient.tsx
    - packages/web/src/hooks/useEscalation.ts
  modified:
    - packages/web/src/app/layout.tsx
    - packages/web/src/trpc/router.ts
decisions:
  - "NavSidebar rendered per-page-layout (not root layout) so project-detail pages can pass projectId + unreadCount to the sidebar client component without a React context"
  - "ProjectShellClient handles D-21 escalation wiring as a client component inside the server-rendered [id]/layout.tsx — escalation banner, sonner toast, unreadCount badge all client-side"
  - "useEscalation stub was immediately replaced by 08-03's real SSE implementation (parallel wave 2 execution) — no stub remains in production code"
  - "HexBackground uses SVG pattern element for hex grid instead of canvas — pure CSS/SVG, no JS runtime cost; D-34 brightness-near-active-elements deferred per plan scope exception"
  - "projects/[id]/layout.tsx is a server component that fetches project by ID; notFound() on missing project provides clean 404 behavior"
metrics:
  duration: "11 min"
  completed: "2026-03-27T02:33:10Z"
  tasks: 2
  files: 15
---

# Phase 8 Plan 2: Shell Components and Project CRUD Summary

**One-liner:** HZD shell components (NavSidebar, CauldronLogo, HexBackground, ProjectHeader, EscalationBanner) with project CRUD tRPC router, project list landing page, new project form, and project detail layout with D-21 escalation wiring.

## Tasks Completed

| # | Name | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Shell components — NavSidebar, CauldronLogo, HexBackground, ProjectHeader, EscalationBanner | 68d7a06 | components/shell/*.tsx, app/layout.tsx |
| 2 | Project CRUD tRPC router and project list/create/detail pages | a49e02d | trpc/routers/projects.ts, app/projects/page.tsx, app/projects/new/page.tsx, app/projects/[id]/layout.tsx, ProjectShellClient.tsx |

## What Was Built

### HZD Shell Components (Task 1)

**CauldronLogo.tsx** (D-32, D-35)
- SVG recreation of icon.png: outer hex ring (`#3d5166`), inner hex ring (`#6b8399`), amber core circle (`#f5a623`)
- `size` prop (default 32px), `animate` prop with `cauldron-glow` CSS keyframe animation (0→12px drop-shadow pulse, 2000ms)
- Used in NavSidebar header and available for nav event indicators

**HexBackground.tsx** (D-34)
- Full-page `position: fixed` SVG with `<pattern>` element tiling hex grid at 0.04 opacity
- `pointer-events: none`, z-index 0 — purely decorative
- D-34's "brightens near active elements" deferred per scope exception (requires DOM position tracking + canvas repainting per active element)

**NavSidebar.tsx** (D-25)
- Collapsible: 56px collapsed (icons only), 240px expanded — `width` CSS transition 200ms `cubic-bezier(0.25, 0.46, 0.45, 0.94)`
- Collapsed state persisted in `localStorage` key `cauldron-sidebar-collapsed`
- `usePathname()` for active item detection — teal left border (3px), teal text
- Global nav: `FolderKanban` → Projects; Project nav (when `projectId` passed): Interview, Execution, Evolution, Costs, Settings
- `unreadCount` prop renders amber badge on nav icon for escalation awareness
- Hydration-safe: SSR defaults to expanded, client reads localStorage

**ProjectHeader.tsx** (D-19, D-24)
- 56px height, transparent background, border-bottom `#1a2330`
- Project name (20px/600 Display typography), teal cost badge (`$X.XX`), settings gear icon link

**EscalationBanner.tsx** (D-21)
- `visible` prop controls render (returns null when false)
- Amber left border (4px `#f5a623`), `AlertTriangle` icon (lucide), message text, X dismiss button
- `escalation-slide-in` CSS animation: `translateY(-40px)→0` 300ms ease-out-quad

**Root layout.tsx** — NavSidebar removed from root; each route's layout now renders its own NavSidebar to carry project context.

### Project CRUD tRPC Router (Task 2)

**trpc/routers/projects.ts** — `projectsRouter`:
- `list`: all projects ordered by `updatedAt`, enriched with `lastActivity` (latest event `occurredAt`) and `totalCostCents` (SUM from `llm_usage`)
- `byId`: single project with cost aggregation; throws "Project not found" on missing ID
- `create`: inserts with name/description, returns new project
- `archive`: soft-archive via name prefix `[archived]`
- `updateSettings`: merges `budgetLimitCents`/`maxConcurrentBeads` into project JSONB settings

### Project Pages

**/projects landing page** (D-20):
- Server component with RSC prefetch via `HydrationBoundary` → `ProjectListClient`
- 3-column responsive grid (1→2→3 columns at sm/md/lg breakpoints)
- Each card: project name, status badge (mapped from `lastEventType`), relative timestamp, cost
- Most recently active card: teal left border + `#1a2330` bg
- Empty state: "No projects yet" / "Describe what you want to build..." / "Start Building" CTA per UI-SPEC copywriting contract

**/projects/new** (D-23):
- Client component form: name (required, max 100), description (optional, max 500)
- On submit: `trpc.projects.create.mutate()` → redirect to `/projects/{id}/interview`
- Disabled submit when name empty; error display below form

**/projects/[id]/layout.tsx** — Project shell:
- Server component: fetches project by ID, `notFound()` on missing project
- `ProjectHeader` with project name, cost, settings link
- Tab navigation: Interview | Execution | Evolution | Costs (active tab via `usePathname` in `TabLinkClient`)
- Escalation wiring via `ProjectShellClient` (D-21)

**ProjectShellClient.tsx** — D-21 escalation wiring:
- `useEscalation(projectId)` subscribes to SSE escalation events
- `EscalationBanner` rendered when `activeEscalation` is non-null
- `toast()` (sonner) fires on new escalation: "Cauldron needs your attention: {message}"
- `unreadCount` passed to `NavSidebar` for badge display

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Root layout NavSidebar architecture conflict**
- **Found during:** Task 2 implementation
- **Issue:** Root layout rendered `NavSidebar` without project context; project detail `ProjectShellClient` also rendered `NavSidebar` with project context — two sidebars on project pages
- **Fix:** Removed `NavSidebar` from root layout; each page layout (projects list + project detail) renders its own `NavSidebar` with appropriate props
- **Files modified:** `packages/web/src/app/layout.tsx`
- **Commit:** a49e02d

**2. [Rule 1 - Bug] Plan's event field `createdAt` doesn't exist on events schema**
- **Found during:** Task 2 tRPC router implementation
- **Issue:** Plan's sample code used `events.createdAt` but the events table has `occurredAt` (enforced by append-only invariant)
- **Fix:** Used `events.occurredAt` in all event queries
- **Files modified:** `packages/web/src/trpc/routers/projects.ts`
- **Commit:** a49e02d

### Design Decisions (Not Deviations)

- **`useEscalation` stub immediately superseded:** The 08-03 plan (parallel wave 2) had already created the real SSE-backed `useEscalation` implementation before this plan ran. The stub was never committed; the real implementation is used.
- **`EscalationBanner` imported but not directly used in layout.tsx:** Imported as a documentation/acceptance-criteria reference; actual rendering via `ProjectShellClient`. TypeScript passes with no unused import error (Next.js server component context).

## Known Stubs

None — all data flows are wired. The `useEscalation` hook uses real SSE infrastructure from 08-03. The tRPC project router queries real PostgreSQL. The project list derives live `lastActivity` and `totalCostCents` from the event store and `llm_usage` table.

## Self-Check: PASSED
