# Phase 8: Web Dashboard - Research

**Researched:** 2026-03-27
**Domain:** Next.js 16 App Router, tRPC v11, React Flow, SSE streaming, shadcn/ui + Tailwind v4, HZD visual identity
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Interview Chat UX**
- D-01: Conversational chat UI (ChatGPT-style bubble layout) with MC answer suggestions as clickable chips above a standard text input. Chips disappear after selection; freeform always available.
- D-02: Persistent right sidebar showing ambiguity score (overall + dimension breakdown: goal, constraint, success criteria), live summary preview, and interview progress. Chat stays clean, metadata always visible.
- D-03: Subtle perspective indicator on each question (small icon/tag showing which mind generated it — researcher, architect, simplifier). Not hidden, not dominant.
- D-04: Seed crystallization approval appears as an inline rich card in the chat stream with edit button and approve/reject buttons. No page change — natural conversation step.
- D-05: Holdout test review also inline cards in the chat — each scenario as an expandable card with approve/reject/edit per scenario. Consistent with seed approval pattern.
- D-06: When clarity threshold is reached, show a "Ready to crystallize" prompt banner — user decides whether to continue asking questions or proceed to summary. User stays in control.

**DAG Visualization**
- D-07: Top-to-bottom layout (roots at top, leaves at bottom) using dagre for auto-positioning.
- D-08: Rich card nodes showing: bead name + status icon + agent model + elapsed time + mini progress bar (iteration count).
- D-09: Color-coded edges by dependency type: blocks=solid, parent-child=dashed, conditional-blocks=dotted, waits-for=glowing teal. All 4 types visually distinct.
- D-10: Molecules render as collapsible container groups around their child beads. Can collapse to a single summary node for large DAGs.
- D-11: Click a bead node opens a slide-out right-side detail panel (spec, status, agent logs, code diffs). DAG stays visible for context.
- D-12: Subtle auto-pan: camera gently pans to keep active beads visible, user can override. Minimap for orientation.
- D-13: Evolution timeline selector — horizontal strip above the DAG, each generation as a dot/node. Click to view that generation's DAG. Current generation highlighted.
- D-14: Convergence signals shown both as inline indicators on timeline dots AND in an expandable convergence detail panel with score trends, ontology diff, and lateral thinking activations.

**Real-time Streaming & Data**
- D-15: SSE + REST transport only (no WebSocket). SSE for all server-to-client streaming. REST POST for all client-to-server actions.
- D-16: Agent logs render in a terminal-style monospace pane in the bead detail panel. ANSI color support, auto-scroll with pause-on-scroll-up.
- D-17: Code diffs rendered as split (side-by-side) diff view with syntax highlighting in the bead detail panel.
- D-18: SSE reconnection uses Last-Event-ID header. Server replays missed events from the event store (sequence_number).
- D-19: Token usage/cost shown as embedded summary badge on project header. Click to expand into full cost breakdown page with per-model, per-bead, per-cycle charts.
- D-20: Project list is the landing page. Shows all projects with status badges, last activity, and cost summary.

**Escalation UX**
- D-21: Escalation notifications appear as toast on arrival + persistent amber banner at top of project view until resolved. Badge count on nav icon.
- D-22: Escalation response UI offers guided resolution options (retry, skip bead, provide guidance, abort cycle) PLUS freeform text field.

**Project Management**
- D-23: New project creation is minimal: name + optional description, then immediately land in Socratic interview chat.
- D-24: Per-project model overrides and budget configuration live in a dedicated project settings page (gear icon on project header).

**Page Structure & Navigation**
- D-25: Collapsible icon sidebar for navigation. Pages: Projects, and within each project: Interview | Execution | Evolution | Costs as tabs.
- D-26: Tab-based views within each project. URL pattern: /projects/{id}/interview, /projects/{id}/execution, etc.
- D-27: Desktop-only for v1. Design for 1280px+ screens. No mobile/tablet optimization.

**HZD Visual Identity**
- D-28: Full immersive HZD Cauldron aesthetic. Dark metallic backgrounds (#0a0f14), cool silver text (#c8d6e5), hexagonal geometry motifs, industrial-organic feel.
- D-29: Dual accent color system: teal (#00d4aa) for interactive elements, amber/orange (#f5a623) for energy/status indicators.
- D-30: Geometric sans typography — Inter/Geist Sans for headers and body, Geist Mono/JetBrains Mono for code. ALL-CAPS section headers, generous letter-spacing.
- D-31: Subtle glow transitions for status changes. No heavy particle effects.
- D-32: icon.png used as favicon and static branding mark. SVG recreation of icon for nav header with animated amber glow.
- D-33: Dark-only. No light mode for v1.
- D-34: Dynamic hexagonal background grid — faint hex pattern at low opacity, subtly brightens/pulses near active elements.
- D-35: Hexagonal icon + CAULDRON wordmark in nav header.

### Claude's Discretion
- Specific hex color values for status states (pending, active, completed, failed, blocked)
- shadcn/ui component customization approach for HZD theme
- Specific animation timing/easing curves
- React Flow node/edge component implementation details
- tRPC router structure and procedure naming
- SSE endpoint design (single multiplexed vs per-resource)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WEB-01 | Chat-like interface for the Socratic interview with MC suggestions and freeform input | tRPC procedures for interview FSM, SSE streaming for AI response tokens, shadcn components (Card, Input, Button) |
| WEB-02 | Project workspace management (create, list, open, archive) | tRPC CRUD procedures for projects table, /projects landing page, Next.js App Router pages |
| WEB-03 | Live DAG visualization showing bead execution status (pending, active, completed, failed, blocked) | @xyflow/react + @dagrejs/dagre, custom BeadNode, SSE → React state updates |
| WEB-04 | Real-time streaming of agent logs and code diffs via SSE | Next.js Route Handler ReadableStream, PostgreSQL LISTEN/NOTIFY → SSE, ansi-to-html, react-diff-viewer-continued |
| WEB-05 | Human approval gate UX for seed crystallization and holdout test review | tRPC mutations (crystallizeSeed, approveHoldout, rejectHoldout), inline chat cards per D-04/D-05 |
| WEB-06 | Evolution cycle visualization: seed lineage, convergence progress, lateral thinking activations | tRPC queries for seeds/evolution events, EvolutionTimeline + ConvergencePanel custom components |
| WEB-07 | Token usage and cost dashboard per project and per evolution cycle | tRPC query aggregating llm_usage table, shadcn charts or Recharts |
| WEB-08 | Visual identity: Horizon Zero Dawn Cauldron aesthetic (dark metallic, teal/blue energy conduits, hexagonal geometries, industrial-organic) | shadcn + Tailwind v4 CSS variable theme, custom HexBackground and CauldronLogo components per UI-SPEC |
| WEB-09 | WebSocket for bidirectional flows (WEB-09 resolved as SSE + REST per D-15) | SSE Route Handler with Last-Event-ID replay, REST POST endpoints via tRPC mutations |
</phase_requirements>

---

## Summary

Phase 8 scaffolds `packages/web` from a bare stub into a full Next.js 16 App Router application that exposes the entire Cauldron pipeline through an operable, observable web interface. The phase is primarily a frontend build with a backend integration layer (tRPC server) — all engine logic already exists; this phase wires it to UI.

The scope divides cleanly into three workstreams: (1) app scaffold + design system (Next.js 16 + shadcn + Tailwind v4 + HZD theme), (2) data layer (tRPC v11 router over existing engine functions + SSE streaming from PostgreSQL LISTEN/NOTIFY), and (3) feature pages (interview chat, DAG execution view, evolution history, cost breakdown). The UI-SPEC in `08-UI-SPEC.md` is the authoritative contract for all visual implementation; planners must not re-derive color, spacing, or typography — use the spec directly.

The biggest integration risk is the SSE architecture: Next.js Route Handlers running under Node.js runtime must stream from a persistent PostgreSQL LISTEN connection, but PostgreSQL LISTEN does not work over connection pools — a dedicated long-lived connection is required per SSE subscriber. The NOTIFY payload is limited to 8000 bytes, so the pattern is: Inngest/engine appends to `events` table → trigger fires NOTIFY with `{projectId, sequenceNumber}` only → SSE handler queries event rows by sequence → streams to client. Last-Event-ID header enables resumption from the stored `sequence_number` in the events table.

**Primary recommendation:** Scaffold in strict wave order — (W0) Next.js + design system, (W1) tRPC router wired to engine, (W2) SSE infrastructure, (W3) feature pages. Each wave produces a runnable app state. Never skip the scaffold wave to jump to feature work.

---

## Project Constraints (from CLAUDE.md)

| Directive | Enforcement |
|-----------|------------|
| TypeScript end-to-end | All files in packages/web must be .ts / .tsx; no .js except generated config |
| Vercel AI SDK for model interface | Dashboard does not call models directly; it calls engine functions via tRPC which use the AI SDK |
| OSS dependencies: use if 80% clean, don't contort | shadcn, React Flow, react-diff-viewer-continued all meet this bar |
| Encryption keys inaccessible to agents | Dashboard backend never receives HOLDOUT_ENCRYPTION_KEY; approval actions trigger engine sealing functions via tRPC |
| Next.js for web dashboard | Confirmed — packages/web becomes a Next.js 16 App Router app |
| tRPC for dashboard↔backend | Confirmed — tRPC for internal API; Hono is already the agent API (packages/api); do not use Hono in packages/web |
| SSE via Next.js Route Handlers | Confirmed — no WebSocket server; SSE from Route Handler subscribing to PostgreSQL NOTIFY |
| Desktop-only (D-27) | No responsive breakpoints for mobile in v1; target 1280px+ |
| No scope cutting per user memory | Plans must implement the full feature set defined in CONTEXT.md decisions |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.1 | App Router, Route Handlers, SSE streaming | Project constraint; tightest Vercel AI SDK + SSE integration |
| `react` | 19 (peer of next@16) | UI rendering | Required by Next.js 16 |
| `typescript` | 6.0.2 | End-to-end type safety | Project constraint |
| `@trpc/server` | 11.15.1 | tRPC server, router, procedures | Internal type-safe API layer |
| `@trpc/client` | 11.15.1 | tRPC client for React components | Required alongside server package |
| `@trpc/tanstack-react-query` | 11.15.1 | tRPC + TanStack Query integration for App Router | First-class App Router support in tRPC v11 |
| `@tanstack/react-query` | 5.95.2 | Query caching and SSR hydration | Required peer of tRPC tanstack package |
| `tailwindcss` | 4.2.2 | Utility-first CSS with @theme directive | Project constraint; Tailwind v4 drops tailwind.config.ts |
| `shadcn` | 4.1.0 (CLI) | Component primitives | Copy-paste components; Radix UI accessibility primitives |
| `lucide-react` | 1.7.0 | Icon library | shadcn default; consistent icon set |
| `geist` | 1.7.0 | Geist Sans + Geist Mono fonts | CLAUDE.md D-30 typography spec |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@xyflow/react` | 12.10.1 | DAG visualization canvas | WEB-03; bead execution graph |
| `@dagrejs/dagre` | 3.0.0 | Auto-layout for DAG nodes | Required by React Flow dagre layout pattern |
| `react-diff-viewer-continued` | 4.2.0 | Split diff view in bead detail panel | WEB-04 code diff rendering |
| `ansi-to-html` | 0.7.2 | Convert ANSI escape codes to HTML for terminal log pane | WEB-04 agent logs with color |
| `zod` | 4.3.6 | tRPC input validation | Already in project; tRPC procedure input schemas |
| `server-only` | latest | Prevent server modules from being imported in client | tRPC server caller, DB access in Route Handlers |
| `client-only` | latest | Prevent client modules from being imported on server | tRPC client provider |
| `tw-animate-css` | latest | CSS animations for Tailwind v4 | Replaces tailwindcss-animate in v4; status glow pulses |

### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| `next/font/google` | Load Geist Sans + Geist Mono | No external font CSS; zero layout shift |
| Vitest 4.1.1 | Unit + integration tests | Already in project; add packages/web test config |
| Playwright 1.58.2 | E2E tests against running Next.js | CLAUDE.md §Recommended Stack |

**Installation (packages/web):**
```bash
# Core scaffold (run in packages/web)
pnpm add next@16.2.1 react@19 react-dom@19 typescript@6.0.2

# tRPC + TanStack Query
pnpm add @trpc/server@11.15.1 @trpc/client@11.15.1 @trpc/tanstack-react-query@11.15.1 @tanstack/react-query@5.95.2

# UI stack
pnpm add tailwindcss@4.2.2 lucide-react@1.7.0 geist@1.7.0

# Feature libraries
pnpm add @xyflow/react@12.10.1 @dagrejs/dagre@3.0.0 react-diff-viewer-continued@4.2.0 ansi-to-html@0.7.2

# Utilities
pnpm add zod@4.3.6 server-only client-only tw-animate-css

# Internal packages
pnpm add @cauldron/shared@workspace:* @cauldron/engine@workspace:*

# shadcn init (after Next.js scaffold)
npx shadcn@latest init
# Select: new-york style, dark theme, CSS variables enabled, Tailwind v4, TypeScript
```

---

## Architecture Patterns

### Recommended Project Structure (packages/web)

```
packages/web/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout: fonts, TRPCProvider, HexBackground
│   │   ├── page.tsx                  # Redirect to /projects
│   │   ├── globals.css               # Tailwind v4 @theme, HZD CSS variables
│   │   ├── api/
│   │   │   ├── trpc/[trpc]/route.ts  # tRPC HTTP handler (fetchRequestHandler)
│   │   │   └── events/[projectId]/route.ts  # SSE streaming endpoint
│   │   └── projects/
│   │       ├── page.tsx              # Project list (landing, WEB-02)
│   │       ├── new/page.tsx          # Create project form (WEB-02)
│   │       └── [id]/
│   │           ├── layout.tsx        # Project shell: nav header, tabs, escalation banner
│   │           ├── interview/page.tsx # WEB-01 interview chat
│   │           ├── execution/page.tsx # WEB-03 DAG view
│   │           ├── evolution/page.tsx # WEB-06 evolution history
│   │           ├── costs/page.tsx    # WEB-07 cost breakdown
│   │           └── settings/page.tsx # WEB-02 project settings (D-24)
│   ├── trpc/
│   │   ├── init.ts                   # initTRPC, context, middleware
│   │   ├── router.ts                 # Root appRouter combining sub-routers
│   │   ├── routers/
│   │   │   ├── projects.ts           # project CRUD procedures
│   │   │   ├── interview.ts          # interview turn, approve, crystallize
│   │   │   ├── execution.ts          # bead queries, escalation response
│   │   │   ├── evolution.ts          # seed lineage, convergence signals
│   │   │   └── costs.ts              # llm_usage aggregation
│   │   ├── client.tsx                # TRPCProvider, browserQueryClient
│   │   ├── query-client.ts           # QueryClient factory
│   │   └── server.tsx                # Server-side caller for RSC prefetching
│   ├── components/
│   │   ├── ui/                       # shadcn copy-paste components
│   │   ├── dag/
│   │   │   ├── BeadNode.tsx          # Custom React Flow node
│   │   │   ├── MoleculeGroup.tsx     # Custom React Flow group node
│   │   │   ├── DAGCanvas.tsx         # ReactFlow wrapper with dagre layout
│   │   │   └── EdgeStyles.tsx        # Custom edge components per D-09
│   │   ├── interview/
│   │   │   ├── ChatBubble.tsx
│   │   │   ├── MCChipGroup.tsx
│   │   │   ├── AmbiguityMeter.tsx
│   │   │   ├── SeedApprovalCard.tsx
│   │   │   └── HoldoutCard.tsx
│   │   ├── evolution/
│   │   │   ├── EvolutionTimeline.tsx
│   │   │   └── ConvergencePanel.tsx
│   │   ├── bead/
│   │   │   ├── TerminalPane.tsx      # ANSI log renderer
│   │   │   └── DiffViewer.tsx        # react-diff-viewer-continued wrapper
│   │   └── shell/
│   │       ├── NavSidebar.tsx        # Collapsible icon sidebar (D-25)
│   │       ├── ProjectHeader.tsx     # Project name, cost badge, settings gear
│   │       ├── EscalationBanner.tsx  # Amber banner (D-21)
│   │       ├── HexBackground.tsx     # Full-page hex grid canvas (D-34)
│   │       └── CauldronLogo.tsx      # SVG with animated amber glow (D-32/D-35)
│   ├── hooks/
│   │   ├── useSSE.ts                 # EventSource wrapper with Last-Event-ID reconnect
│   │   ├── useBeadStatus.ts          # Subscribe to bead status updates via SSE
│   │   └── useEscalation.ts          # Escalation notifications via SSE
│   └── lib/
│       ├── dag-layout.ts             # getLayoutedElements() using dagre
│       └── sse-event-types.ts        # Typed SSE event discriminated union
├── public/
│   ├── favicon.ico                   # From icon.png
│   └── icon.png                      # Cauldron logo (copy from root)
├── next.config.ts
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

### Pattern 1: tRPC v11 App Router Setup
**What:** tRPC v11 uses `@trpc/tanstack-react-query` (not the old `@trpc/react-query`) and the `fetchRequestHandler` for App Router. The `createTRPCOptionsProxy` server caller enables RSC prefetching.
**When to use:** All data fetching in the dashboard except SSE streaming.

```typescript
// Source: https://trpc.io/docs/client/nextjs/app-router-setup

// trpc/init.ts
import { initTRPC } from '@trpc/server';
import { cache } from 'react';
import { db } from '@cauldron/shared';

export const createTRPCContext = cache(async () => {
  return { db };
});

const t = initTRPC.context<typeof createTRPCContext>().create();
export const router = t.router;
export const publicProcedure = t.procedure;

// app/api/trpc/[trpc]/route.ts
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '../../../trpc/router';
import { createTRPCContext } from '../../../trpc/init';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: createTRPCContext,
  });

export { handler as GET, handler as POST };
```

### Pattern 2: SSE Route Handler with LISTEN/NOTIFY and Last-Event-ID Replay
**What:** A dedicated PostgreSQL connection (NOT the pool) listens on a per-project channel. When bead_status events arrive, the handler streams them to the client. Last-Event-ID header enables resumption.
**When to use:** WEB-03 (live DAG status), WEB-04 (agent logs streaming), WEB-06 (evolution progress).

```typescript
// Source: Next.js Route Handler SSE pattern + PostgreSQL LISTEN/NOTIFY
// app/api/events/[projectId]/route.ts
export const runtime = 'nodejs';           // Required — SSE needs Node.js runtime
export const dynamic = 'force-dynamic';    // Prevent static optimization

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;      // Next.js 16: params is async
  const lastEventId = request.headers.get('last-event-id');
  const since = lastEventId ? parseInt(lastEventId, 10) : 0;

  const stream = new ReadableStream({
    async start(controller) {
      // Replay missed events from sequence number
      const missed = await db.select().from(events)
        .where(and(
          eq(events.projectId, projectId),
          gt(events.sequenceNumber, since)
        ))
        .orderBy(asc(events.sequenceNumber));

      for (const event of missed) {
        const data = `id: ${event.sequenceNumber}\ndata: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(new TextEncoder().encode(data));
      }

      // Open dedicated LISTEN connection (not pool — LISTEN doesn't work with pooling)
      const listenClient = new Client(process.env.DATABASE_URL);
      await listenClient.connect();
      await listenClient.query(`LISTEN "project:${projectId}"`);

      listenClient.on('notification', async (msg) => {
        const { sequenceNumber } = JSON.parse(msg.payload ?? '{}');
        // Fetch full event row (NOTIFY payload limited to 8000 bytes)
        const [evt] = await db.select().from(events)
          .where(eq(events.sequenceNumber, sequenceNumber));
        if (evt) {
          const data = `id: ${evt.sequenceNumber}\ndata: ${JSON.stringify(evt)}\n\n`;
          controller.enqueue(new TextEncoder().encode(data));
        }
      });

      // Cleanup on disconnect
      request.signal.addEventListener('abort', async () => {
        await listenClient.end();
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
```

### Pattern 3: dagre Layout for React Flow (Static + Dynamic Trigger)
**What:** dagre positions nodes. React Flow renders. Layout re-runs when bead count changes (new beads dispatched by evolution). D-10 (molecule groups) uses React Flow's parentId feature for grouping.
**Critical:** dagre uses center-origin coordinates; React Flow uses top-left. Must offset by `nodeWidth/2` and `nodeHeight/2`.

```typescript
// Source: https://reactflow.dev/examples/layout/dagre
import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';

const NODE_WIDTH = 240;   // D-08 minimum width
const NODE_HEIGHT = 80;   // D-08 minimum height

export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction = 'TB'   // TB = top-to-bottom per D-07
) {
  const g = new dagre.graphlib.Graph()
    .setDefaultEdgeLabel(() => ({}))
    .setGraph({ rankdir: direction, nodesep: 32, ranksep: 48 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  return {
    nodes: nodes.map((node) => {
      const { x, y } = g.node(node.id);
      return {
        ...node,
        position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 },
      };
    }),
    edges,
  };
}
```

### Pattern 4: Tailwind v4 + shadcn HZD Theme Override
**What:** Tailwind v4 uses CSS `@theme inline` directive (not `tailwind.config.ts`). shadcn new-york style uses OKLCH color space. Override the CSS variables in `globals.css` with HZD palette values.

```css
/* Source: https://ui.shadcn.com/docs/tailwind-v4 + CONTEXT.md palette */
/* app/globals.css */
@import "tailwindcss";
@import "tw-animate-css";

:root {
  --background: #0a0f14;
  --foreground: #c8d6e5;
  --card: #111820;
  --card-foreground: #c8d6e5;
  --border: #1a2330;
  --input: #1a2330;
  --primary: #00d4aa;
  --primary-foreground: #0a0f14;
  --secondary: #111820;
  --secondary-foreground: #c8d6e5;
  --muted: #111820;
  --muted-foreground: #6b8399;
  --accent: #1a2330;
  --accent-foreground: #c8d6e5;
  --destructive: #e5484d;
  --radius: 0.375rem;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted-foreground: var(--muted-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  /* Cauldron custom tokens */
  --color-amber: #f5a623;
  --color-bead-pending: #3d5166;
  --color-bead-active: #f5a623;
  --color-bead-completed: #00d4aa;
  --color-bead-failed: #e5484d;
  --color-bead-blocked: #8a5c00;
  --color-surface-raised: #1a2330;
}
```

### Pattern 5: useSSE Hook with Last-Event-ID
**What:** Wraps the browser `EventSource` API. EventSource does not natively support custom request headers, so `Last-Event-ID` is sent as a query parameter on reconnect, and the Route Handler reads from both.

```typescript
// hooks/useSSE.ts
import { useEffect, useRef, useCallback } from 'react';

export function useSSE<T>(
  url: string | null,
  onEvent: (event: T) => void
) {
  const esRef = useRef<EventSource | null>(null);
  const lastIdRef = useRef<number>(0);

  const connect = useCallback(() => {
    if (!url) return;
    const fullUrl = lastIdRef.current > 0
      ? `${url}?lastEventId=${lastIdRef.current}`
      : url;

    const es = new EventSource(fullUrl);
    esRef.current = es;

    es.onmessage = (e) => {
      const parsed = JSON.parse(e.data) as T;
      lastIdRef.current = parseInt(e.lastEventId, 10) || lastIdRef.current;
      onEvent(parsed);
    };

    es.onerror = () => {
      es.close();
      // Reconnect after 2 seconds
      setTimeout(connect, 2000);
    };
  }, [url, onEvent]);

  useEffect(() => {
    connect();
    return () => esRef.current?.close();
  }, [connect]);
}
```

### Anti-Patterns to Avoid
- **Using tRPC for SSE streaming:** tRPC uses HTTP request-response; streaming agent logs requires a raw Route Handler `ReadableStream`. Use tRPC for data fetching + mutations; use the SSE Route Handler for event streaming.
- **Using the DB connection pool for LISTEN:** PostgreSQL LISTEN requires a dedicated session connection. `postgres` driver (pgjs) creates pool connections; do NOT use `db` from `@cauldron/shared` for LISTEN. Create a `new Client(DATABASE_URL)` from the `pg` package instead.
- **Static dagre layout without re-trigger:** The dagre layout is computed once. When the evolution timeline selector changes generation (D-13), the node set changes and `getLayoutedElements` must be called again. Wire re-layout to the generation selection state.
- **Calling `middleware.ts` instead of `proxy.ts`:** Next.js 16 replaced `middleware.ts` with `proxy.ts`. The function export is renamed to `proxy`. If auth or project-scoping middleware is needed, create `src/proxy.ts`.
- **Using `tailwindcss-animate`:** Tailwind v4 replaces `tailwindcss-animate` with `tw-animate-css`. Using the v3 plugin will cause build errors.
- **Accessing `params` synchronously in Next.js 16:** In Next.js 16, `params` and `searchParams` are async. Always `await params` before destructuring.
- **Importing `@cauldron/engine` in client components:** Engine functions (LLMGateway, InterviewFSM, etc.) require Node.js built-ins and database access. They MUST only be called from tRPC procedures (server-side). Client components call tRPC hooks, never engine functions directly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ANSI escape code rendering | Custom regex parser for terminal colors | `ansi-to-html` 0.7.2 | Handles all 256-color codes, bold, italic; regex approach misses many codes |
| Side-by-side code diff view | Custom diff algorithm + renderer | `react-diff-viewer-continued` 4.2.0 | Handles line-level diffs, word-level highlights, syntax highlighting via `renderContent` prop |
| DAG auto-layout | Custom Sugiyama algorithm | `@dagrejs/dagre` 3.0.0 | Crossing minimization, rank assignment, coordinate positioning are each NP-hard subproblems |
| Node graph rendering | Custom SVG/Canvas DAG renderer | `@xyflow/react` 12.10.1 | Handles viewport, zoom, pan, minimap, custom node/edge rendering, React state integration |
| tRPC procedure type inference | Manual API response interfaces | `@trpc/tanstack-react-query` 11.15.1 | End-to-end type inference from Drizzle schema → tRPC procedure → React hook return types |
| CSS animation timing | Custom keyframe durations | `tw-animate-css` | Consistent animation primitives that compose with Tailwind v4 utilities |
| Dark mode CSS variables | Manual class toggling | Tailwind v4 `@theme inline` + shadcn CSS vars | shadcn components automatically read from CSS variables; no class toggling needed since dark-only |
| Accessible dialog/sheet/toast | Custom focus-trap and ARIA implementation | shadcn `dialog`, `sheet`, `toast` (Radix UI) | WCAG 2.1 AA compliance in focus management is non-trivial; Radix UI handles it correctly |
| Hex grid rendering | Canvas 2D custom renderer | SVG pattern + CSS animation | Performance for a static background: SVG `<pattern>` with CSS opacity/pulse is GPU-composited; canvas 2D requires manual repaint |

**Key insight:** This phase's "complexity" lives in the layout algorithms (dagre), the streaming infrastructure (SSE + LISTEN/NOTIFY), and the visual identity (HZD theme). None of these should be custom-built from scratch.

---

## Common Pitfalls

### Pitfall 1: PostgreSQL Connection Leaks in SSE Route Handlers
**What goes wrong:** Each SSE connection opens a dedicated LISTEN client. When clients disconnect silently (browser tab close without proper event), the Postgres connection stays open. Under load, connections exhaust the pg_max_connections limit.
**Why it happens:** `request.signal` `abort` event is not always fired on tab close in all browsers. The `pg` Client does not self-close.
**How to avoid:** Set a heartbeat ping every 30 seconds; if the write fails, immediately close the pg client. Also set `statement_timeout` and `idle_in_transaction_session_timeout` on the LISTEN connection.
**Warning signs:** `pg_stat_activity` shows many idle connections with `LISTEN` state accumulating.

### Pitfall 2: React Flow Hydration Mismatch
**What goes wrong:** React Flow uses `crypto.randomUUID()` for node IDs during SSR. The server-generated IDs don't match client-generated IDs, causing React hydration errors.
**Why it happens:** `@xyflow/react` renders node/edge IDs on both server and client.
**How to avoid:** Always render `<ReactFlow>` inside a `'use client'` boundary and never server-render the canvas. Use React's `Suspense` + `dynamic(() => import('./DAGCanvas'), { ssr: false })` to disable SSR for the canvas component.
**Warning signs:** "Hydration failed because the initial UI does not match" in the browser console.

### Pitfall 3: tRPC Tanstack React Query v11 Syntax Change
**What goes wrong:** tRPC v10 used `trpc.router.procedure.useQuery()`. tRPC v11 uses `useTRPC()` hook and passes `trpc.procedure.queryOptions()` to `useQuery()`.
**Why it happens:** tRPC v11 decoupled from its own query hooks to use TanStack Query directly.
**How to avoid:** Use the tRPC v11 pattern: `const trpc = useTRPC(); const { data } = useQuery(trpc.projects.list.queryOptions());`
**Warning signs:** TypeScript error "Property 'useQuery' does not exist on type" when using v10 patterns.

### Pitfall 4: Tailwind v4 Class Generation Without CSS Import
**What goes wrong:** Tailwind v4 generates classes from CSS imports, not a `tailwind.config.ts`. If `globals.css` is not imported in the root layout, Tailwind classes are not generated.
**Why it happens:** Tailwind v4 dropped the PostCSS plugin auto-discovery model.
**How to avoid:** `globals.css` must begin with `@import "tailwindcss"` and must be imported in `app/layout.tsx`. No `tailwind.config.ts` needed.
**Warning signs:** All Tailwind utility classes fail to apply; no CSS is generated in the build output.

### Pitfall 5: Next.js 16 Async Params
**What goes wrong:** `params` in Route Handlers and page components is a `Promise<{...}>` in Next.js 16, not a plain object. Destructuring directly causes a TypeScript error and runtime failure.
**Why it happens:** Next.js 16 removed synchronous `params` access (listed as breaking change in release notes).
**How to avoid:** Always `const { id } = await params;` before use.
**Warning signs:** TypeScript error "Type 'Promise<...>' is not assignable to parameter of type '...'" on params destructuring.

### Pitfall 6: shadcn `new-york` Style + Tailwind v4 OKLCH Colors
**What goes wrong:** shadcn v4 default new-york style initializes with OKLCH color variables. The HZD palette is hex-defined (D-28, D-29). Naively mixing OKLCH and hex in CSS variables breaks Tailwind's opacity modifier syntax (`bg-primary/50`).
**Why it happens:** Tailwind v4 opacity modifiers require OKLCH or RGB channels, not raw hex.
**How to avoid:** After `npx shadcn init`, override CSS variables with OKLCH equivalents of the HZD hex palette. Use an online hex→OKLCH converter. Alternatively, wrap hex values in `color(srgb ...)` or use `hsl()` wrapper which Tailwind v4 also supports.
**Warning signs:** `bg-primary/50` renders as fully transparent or fully opaque instead of 50% opacity.

### Pitfall 7: SSE `Last-Event-ID` Header Not Set by Browser EventSource
**What goes wrong:** The browser's native `EventSource` automatically sends `Last-Event-ID` as a request header on reconnect only if the server set the `id:` field in the SSE event. If the Route Handler does not emit `id: ${sequenceNumber}\n`, the header is never populated and replay doesn't work.
**Why it happens:** EventSource spec: ID must be set by server before the browser tracks it.
**How to avoid:** Every SSE event MUST be formatted as `id: ${sequenceNumber}\ndata: ${JSON.stringify(payload)}\n\n`. The Route Handler reads `request.headers.get('last-event-id')` on reconnect.
**Warning signs:** After a network interruption, the client replays from sequence 0 (all events re-delivered) instead of from the last seen sequence.

---

## Code Examples

### tRPC Projects Router (typed against Drizzle schema)
```typescript
// Source: trpc.io/docs + Drizzle schema in packages/shared/src/db/schema/project.ts
// trpc/routers/projects.ts
import { z } from 'zod/v4';
import { router, publicProcedure } from '../init.js';
import { projects } from '@cauldron/shared';
import { eq } from 'drizzle-orm';

export const projectsRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(projects).orderBy(projects.updatedAt);
  }),

  create: publicProcedure
    .input(z.object({ name: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [project] = await ctx.db.insert(projects).values(input).returning();
      return project;
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [project] = await ctx.db.select().from(projects)
        .where(eq(projects.id, input.id));
      return project ?? null;
    }),
});
```

### Interview Turn tRPC Procedure (calls InterviewFSM)
```typescript
// trpc/routers/interview.ts
// Note: InterviewFSM requires db, gateway, config — inject from context
import { InterviewFSM } from '@cauldron/engine';

export const interviewRouter = router({
  nextTurn: publicProcedure
    .input(z.object({
      interviewId: z.string(),
      answer: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // InterviewFSM wraps DB state + engine calls
      // Returns: { question, mcSuggestions, scores, phase, summary? }
      const fsm = new InterviewFSM({ db: ctx.db, gateway: ctx.gateway, config: ctx.config });
      return fsm.processAnswer(input.interviewId, input.answer);
    }),

  approveSeed: publicProcedure
    .input(z.object({ interviewId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const fsm = new InterviewFSM({ db: ctx.db, gateway: ctx.gateway, config: ctx.config });
      return fsm.approveSummary(input.interviewId);
    }),
});
```

### DAGCanvas component wiring
```typescript
// Source: @xyflow/react 12 patterns + CONTEXT.md D-07 through D-12
// components/dag/DAGCanvas.tsx
'use client';

import ReactFlow, {
  useNodesState, useEdgesState, Background,
  MiniMap, Controls, MarkerType
} from '@xyflow/react';
import { BeadNode } from './BeadNode.js';
import { MoleculeGroup } from './MoleculeGroup.js';
import { getLayoutedElements } from '../../lib/dag-layout.js';
import type { Bead, BeadEdge } from '@cauldron/shared';

const nodeTypes = { bead: BeadNode, molecule: MoleculeGroup };

export function DAGCanvas({ beads, edges }: { beads: Bead[]; edges: BeadEdge[] }) {
  const { nodes: layoutedNodes, edges: layoutedEdges } =
    getLayoutedElements(beadsToNodes(beads), edgesToRFEdges(edges));

  const [nodes, , onNodesChange] = useNodesState(layoutedNodes);
  const [rfEdges, , onEdgesChange] = useEdgesState(layoutedEdges);

  // SSE updates call setNodes/setEdges to reflect status changes

  return (
    <ReactFlow
      nodes={nodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      fitView
    >
      <MiniMap style={{ background: '#111820' }} />
      <Controls />
      <Background color="#1a2330" />
    </ReactFlow>
  );
}
```

### TerminalPane ANSI log renderer
```typescript
// components/bead/TerminalPane.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import AnsiToHtml from 'ansi-to-html';

const converter = new AnsiToHtml({ escapeXML: true, bg: '#0a0f14', fg: '#c8d6e5' });

export function TerminalPane({ lines }: { lines: string[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!paused) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines, paused]);

  return (
    <div
      className="h-full overflow-y-auto font-mono text-sm leading-relaxed bg-[#0a0f14] p-md"
      onScroll={(e) => {
        const el = e.currentTarget;
        const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 4;
        setPaused(!atBottom);
      }}
    >
      {lines.map((line, i) => (
        <div
          key={i}
          dangerouslySetInnerHTML={{ __html: converter.toHtml(line) }}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` | `proxy.ts` (Next.js 16) | Oct 2025 (Next.js 16) | Rename required; old name deprecated but still works temporarily |
| `tailwindcss-animate` | `tw-animate-css` | Tailwind v4 release 2024 | Different import path; shadcn v4 docs reference the new package |
| tRPC `useQuery()` directly | `useTRPC()` + TanStack `useQuery(trpc.proc.queryOptions())` | tRPC v11 (2024) | Syntax break from v10; training data may show old pattern |
| `tailwind.config.ts` theme | `@theme inline` in CSS | Tailwind v4 | No config file for theme tokens; everything in CSS |
| `experimental.ppr` flag | `cacheComponents: true` in next.config.ts | Next.js 16 | Partial Prerendering now stable under Cache Components model |
| shadcn `default` style | `new-york` style (shadcn 4.x) | shadcn 2024/2025 | `default` style deprecated; new projects should use `new-york` |
| `React.forwardRef` in shadcn | Direct props (React 19 native ref) | shadcn + React 19 | No more `forwardRef` wrappers in shadcn components |

**Deprecated/outdated:**
- `tailwindcss-animate`: Deprecated in Tailwind v4; use `tw-animate-css`
- `@trpc/react-query` (v10 package): Replaced by `@trpc/tanstack-react-query` in v11
- `middleware.ts`: Deprecated in Next.js 16 in favor of `proxy.ts`
- `react-flow-renderer`: Unmaintained (2022); use `@xyflow/react` 12.x
- `dagre` (0.8.x, unmaintained): Use `@dagrejs/dagre` 3.x (maintained fork)

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 20+ | Next.js 16 (requires Node 20.9+) | Yes | v22.22.1 | — |
| pnpm | Workspace installs | Yes | 10.32.1 | — |
| Docker | PostgreSQL + Redis for dev | Yes | 29.2.1 | — |
| PostgreSQL | SSE LISTEN/NOTIFY, tRPC queries | Via Docker (pg_isready unavailable without running container) | Via Docker Compose | Run `docker compose up -d` |
| Redis | Inngest dev server | Via Docker | Via Docker Compose | Run `docker compose up -d` |
| npm registry | Package installs | Yes | 11.12.0 | — |

**Missing dependencies with no fallback:**
- Running Docker containers (PostgreSQL + Redis) required before `next dev` — run `docker compose up -d` as Wave 0 step.

**Missing dependencies with fallback:**
- None.

---

## Open Questions

1. **InterviewFSM constructor signature for tRPC context**
   - What we know: `InterviewFSM` is exported from `@cauldron/engine`; it requires `db`, `gateway`, and `config` per existing usage in `packages/api/src/bootstrap.ts`
   - What's unclear: Whether `InterviewFSM` is a class (instantiated with `new`) or a function module — the fsm.ts reads like a class with methods but exports `InterviewFSM` — needs inspection of the full constructor before tRPC procedures are written
   - Recommendation: Read `packages/engine/src/interview/fsm.ts` in full before writing interview tRPC router

2. **PostgreSQL NOTIFY trigger — engine or web layer?**
   - What we know: Engine functions call `appendEvent()` from `@cauldron/shared`. No NOTIFY trigger exists yet.
   - What's unclear: Should the NOTIFY be added as a PostgreSQL trigger on the events table, or should `appendEvent()` be modified to also call `pg_notify()`, or should the SSE Route Handler poll the events table?
   - Recommendation: Add a PostgreSQL trigger on `events` INSERT that fires `pg_notify('project:' || project_id, sequence_number::text)` — this requires a new migration in `packages/shared/src/db/schema/` and a new Drizzle Kit migration file. Polling is simpler but adds 500ms+ latency to live DAG updates.

3. **Cost breakdown page: chart library**
   - What we know: WEB-07 requires per-model, per-bead, per-cycle cost charts. The `llm_usage` table has all data.
   - What's unclear: No chart library is specified in CLAUDE.md or CONTEXT.md. Recharts is the React ecosystem standard but adds ~100KB. shadcn has a chart component wrapping Recharts.
   - Recommendation: Use shadcn's `chart` component (wraps Recharts) — consistent with existing shadcn stack; keeps the stack from diverging; install via `npx shadcn add chart`.

4. **pg package for LISTEN connection vs postgres (pgjs)**
   - What we know: The shared package uses the `postgres` (pgjs) driver. The `pg` package (node-postgres) is a separate library.
   - What's unclear: Whether `postgres` (pgjs) supports LISTEN natively without adding `pg` as a second database driver.
   - Recommendation: `postgres` (pgjs) 3.x does support LISTEN via `sql.listen()` — this avoids adding `pg` as a second driver. Verify by reading the pgjs docs at `https://github.com/porsager/postgres#listen--notify` before writing the SSE handler.

---

## Validation Architecture

nyquist_validation is enabled in `.planning/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 |
| Config file | `packages/web/vitest.config.ts` (Wave 0 gap — does not exist yet) |
| Quick run command | `pnpm --filter @cauldron/web test` |
| Full suite command | `turbo test --filter @cauldron/web` |
| E2E command | `pnpm exec playwright test` (from project root e2e/) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WEB-01 | Chat UI sends answer, receives next question | integration | `pnpm --filter @cauldron/web test -- interview` | Wave 0 gap |
| WEB-01 | MC chips disappear after selection | unit | `pnpm --filter @cauldron/web test -- MCChipGroup` | Wave 0 gap |
| WEB-02 | Project create/list/archive tRPC procedures | integration | `pnpm --filter @cauldron/web test -- projects.router` | Wave 0 gap |
| WEB-03 | getLayoutedElements positions all nodes | unit | `pnpm --filter @cauldron/web test -- dag-layout` | Wave 0 gap |
| WEB-03 | DAG renders all 5 bead status colors | unit | `pnpm --filter @cauldron/web test -- BeadNode` | Wave 0 gap |
| WEB-04 | SSE Route Handler streams events with id: field | integration | `pnpm --filter @cauldron/web test -- sse-handler` | Wave 0 gap |
| WEB-04 | useSSE reconnects with last seen sequence | unit | `pnpm --filter @cauldron/web test -- useSSE` | Wave 0 gap |
| WEB-05 | crystallizeSeed tRPC mutation returns seed | integration | `pnpm --filter @cauldron/web test -- interview.router` | Wave 0 gap |
| WEB-06 | Evolution timeline renders generation dots | unit | `pnpm --filter @cauldron/web test -- EvolutionTimeline` | Wave 0 gap |
| WEB-07 | costs.summary procedure aggregates llm_usage | integration | `pnpm --filter @cauldron/web test -- costs.router` | Wave 0 gap |
| WEB-08 | HZD CSS variables applied to background | unit (visual) | manual / Playwright screenshot | Wave 0 gap |
| WEB-09 | SSE Last-Event-ID replay from sequence | integration | `pnpm --filter @cauldron/web test -- sse-replay` | Wave 0 gap |

### Sampling Rate
- **Per task commit:** `pnpm --filter @cauldron/web test`
- **Per wave merge:** `turbo test --filter @cauldron/web`
- **Phase gate:** Full suite green + `turbo build` passes before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/web/vitest.config.ts` — Vitest config with jsdom environment for component tests
- [ ] `packages/web/src/__tests__/` — test directory
- [ ] `packages/web/src/trpc/__tests__/projects.router.test.ts` — covers WEB-02
- [ ] `packages/web/src/trpc/__tests__/interview.router.test.ts` — covers WEB-01, WEB-05
- [ ] `packages/web/src/lib/__tests__/dag-layout.test.ts` — covers WEB-03 layout
- [ ] `packages/web/src/app/api/events/__tests__/sse-handler.test.ts` — covers WEB-04, WEB-09
- [ ] `packages/web/src/hooks/__tests__/useSSE.test.ts` — covers WEB-04 reconnect

---

## Sources

### Primary (HIGH confidence)
- Next.js 16 release blog (https://nextjs.org/blog/next-16) — Breaking changes (async params, proxy.ts, Turbopack default, removed sync params/cookies)
- tRPC v11 Next.js App Router Setup (https://trpc.io/docs/client/nextjs/app-router-setup) — fetchRequestHandler, createTRPCOptionsProxy, file structure
- React Flow Dagre example (https://reactflow.dev/examples/layout/dagre) — getLayoutedElements, coordinate offset pattern
- shadcn Tailwind v4 guide (https://ui.shadcn.com/docs/tailwind-v4) — @theme inline, new-york style, OKLCH migration
- CONTEXT.md (08-CONTEXT.md) — all D-01 through D-35 locked decisions
- UI-SPEC.md (08-UI-SPEC.md) — complete design token contract, component inventory, layout diagrams
- packages/shared/src/db/schema/ — verified all table shapes (beads, events, seeds, projects, llm_usage, interviews, holdout_vault)
- packages/web/package.json — confirmed packages/web is a bare stub with no Next.js scaffold

### Secondary (MEDIUM confidence)
- PostgreSQL LISTEN/NOTIFY + SSE pattern (https://spin.atomicobject.com/postgres-listen-notify-events/) — 8000 byte limit, dedicated connection requirement
- react-diff-viewer-continued GitHub (https://github.com/Aeolun/react-diff-viewer-continued) — renderContent prop for syntax highlighting
- tRPC v11 DEV article (https://dev.to/matowang/trpc-11-setup-for-nextjs-app-router-2025-33fo) — v10→v11 syntax change confirmation

### Tertiary (LOW confidence)
- ansi-to-html npm (version 0.7.2 verified via npm registry) — API shape from npm page; not independently doc-verified

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified via `npm view` against registry 2026-03-27
- Next.js 16 breaking changes: HIGH — verified against official release blog
- tRPC v11 App Router pattern: HIGH — verified against official tRPC docs
- Architecture patterns: HIGH — grounded in existing codebase inspection (package.json, schema files, engine exports)
- SSE/LISTEN/NOTIFY pitfalls: MEDIUM — pattern verified in multiple sources; connection pool limitation is documented behavior
- shadcn + Tailwind v4: HIGH — verified against official shadcn docs
- Pitfalls: MEDIUM — some from training data with official doc cross-reference; SSE connection leak from multiple source verification

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (30-day estimate; tRPC and shadcn are fast-moving but breaking changes are unlikely within 30 days)
