# Phase 8: Web Dashboard - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

The full Cauldron pipeline is observable and operable through a web interface — from Socratic interview chat to live DAG execution visualization to evolution cycle review — with the HZD Cauldron visual identity. This phase scaffolds `packages/web` as a Next.js 16 app and implements all dashboard views, real-time streaming, and human approval gates.

</domain>

<decisions>
## Implementation Decisions

### Interview Chat UX
- **D-01:** Conversational chat UI (ChatGPT-style bubble layout) with MC answer suggestions as clickable chips above a standard text input. Chips disappear after selection; freeform always available.
- **D-02:** Persistent right sidebar showing ambiguity score (overall + dimension breakdown: goal, constraint, success criteria), live summary preview, and interview progress. Chat stays clean, metadata always visible.
- **D-03:** Subtle perspective indicator on each question (small icon/tag showing which mind generated it — e.g., researcher, architect, simplifier). Not hidden, not dominant.
- **D-04:** Seed crystallization approval appears as an inline rich card in the chat stream with edit button and approve/reject buttons. No page change — natural conversation step.
- **D-05:** Holdout test review also inline cards in the chat — each scenario as an expandable card with approve/reject/edit per scenario. Consistent with seed approval pattern.
- **D-06:** When clarity threshold is reached, show a "Ready to crystallize" prompt banner — user decides whether to continue asking questions or proceed to summary. User stays in control.

### DAG Visualization
- **D-07:** Top-to-bottom layout (roots at top, leaves at bottom) using dagre for auto-positioning. Natural reading order for dependency chains.
- **D-08:** Rich card nodes showing: bead name + status icon + agent model + elapsed time + mini progress bar (iteration count). More info at a glance.
- **D-09:** Color-coded edges by dependency type: blocks=solid, parent-child=dashed, conditional-blocks=dotted, waits-for=glowing teal. All 4 types visually distinct.
- **D-10:** Molecules render as collapsible container groups around their child beads. Can collapse to a single summary node for large DAGs.
- **D-11:** Click a bead node opens a slide-out right-side detail panel (spec, status, agent logs, code diffs). DAG stays visible for context.
- **D-12:** Subtle auto-pan: camera gently pans to keep active beads visible, user can override. Minimap for orientation.
- **D-13:** Evolution timeline selector — horizontal strip above the DAG, each generation as a dot/node. Click to view that generation's DAG. Current generation highlighted.
- **D-14:** Convergence signals shown both as inline indicators on timeline dots (green/yellow/red health) AND in an expandable convergence detail panel with score trends, ontology diff, and lateral thinking activations.

### Real-time Streaming & Data
- **D-15:** SSE + REST transport only (no WebSocket). SSE for all server-to-client streaming (logs, status, diffs, interview responses, evolution progress). REST POST for all client-to-server actions (approve, reject, escalate, start interview). WEB-09 requirement resolved as SSE + REST.
- **D-16:** Agent logs render in a terminal-style monospace pane in the bead detail panel. ANSI color support, auto-scroll with pause-on-scroll-up.
- **D-17:** Code diffs rendered as split (side-by-side) diff view with syntax highlighting in the bead detail panel.
- **D-18:** SSE reconnection uses Last-Event-ID header. Server replays missed events from the event store (sequence_number). Leverages existing event sourcing infrastructure.
- **D-19:** Token usage/cost shown as an embedded summary badge on the project header (total spend). Click to expand into a full cost breakdown page with per-model, per-bead, per-cycle charts.
- **D-20:** Project list is the landing page. Shows all projects with status badges, last activity, and cost summary.

### Escalation UX
- **D-21:** Escalation notifications appear as toast on arrival + persistent amber banner at top of project view until resolved. Badge count on nav icon.
- **D-22:** Escalation response UI offers guided resolution options (retry, skip bead, provide guidance, abort cycle) PLUS a freeform text field for additional context.

### Project Management
- **D-23:** New project creation is minimal: name + optional description, then immediately land in Socratic interview chat. Interview IS the setup process.
- **D-24:** Per-project model overrides and budget configuration live in a dedicated project settings page (gear icon on project header). Not gating project creation.

### Page Structure & Navigation
- **D-25:** Collapsible icon sidebar for navigation. Pages: Projects, and within each project: Interview | Execution | Evolution | Costs as tabs.
- **D-26:** Tab-based views within each project. URL pattern: /projects/{id}/interview, /projects/{id}/execution, etc. One tab active at a time (no split view).
- **D-27:** Desktop-only for v1. Design for 1280px+ screens. No mobile/tablet optimization.

### HZD Visual Identity
- **D-28:** Full immersive HZD Cauldron aesthetic. Dark metallic backgrounds (#0a0f14 deep gunmetal), cool silver text (#c8d6e5), hexagonal geometry motifs, industrial-organic feel.
- **D-29:** Dual accent color system: teal (#00d4aa) for interactive elements (buttons, links, focus rings, active states). Amber/orange for energy/status indicators (active beads, progress bars, convergence health, logo core).
- **D-30:** Geometric sans typography — Inter/Geist Sans for headers and body, Geist Mono/JetBrains Mono for code. Industrial feel via ALL-CAPS section headers, generous letter-spacing, thin horizontal rules, hexagonal bullet points.
- **D-31:** Subtle glow transitions for status changes — brief teal pulse on affected elements, edges light up briefly when dependencies resolve. No heavy particle effects.
- **D-32:** icon.png used as favicon and static branding mark. SVG recreation of icon for nav header with animated amber glow on pipeline events.
- **D-33:** Dark-only. No light mode for v1. HZD aesthetic is inherently dark.
- **D-34:** Dynamic hexagonal background grid — faint hex pattern at low opacity across the page, subtly brightens/pulses near active elements (energy flowing through the Cauldron).
- **D-35:** Hexagonal icon + CAULDRON wordmark in nav header.

### Claude's Discretion
- Specific hex color values for status states (pending, active, completed, failed, blocked)
- shadcn/ui component customization approach for HZD theme
- Specific animation timing/easing curves
- React Flow node/edge component implementation details
- tRPC router structure and procedure naming
- SSE endpoint design (single multiplexed vs per-resource)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Architecture
- `.planning/PROJECT.md` — Core value, constraints, key decisions (HZD identity, tech stack)
- `.planning/REQUIREMENTS.md` — WEB-01 through WEB-09 acceptance criteria
- `.planning/ROADMAP.md` §Phase 8 — Success criteria and dependency chain
- `CLAUDE.md` §Recommended Stack — Next.js 16, React Flow, shadcn/ui, tRPC, Tailwind v4, SSE patterns

### Existing Code
- `packages/web/` — Build stub to be scaffolded into Next.js 16 app
- `packages/shared/src/db/schema/` — All DB schema (events, beads, seeds, projects)
- `packages/shared/src/db/event-store.ts` — Event sourcing with 32 event types (drives SSE)
- `packages/engine/src/` — Full pipeline implementation (interview, holdout, DAG, execution, evolution)
- `packages/api/src/` — Hono-based API server (agent workers)

### Visual Identity
- `icon.png` — Cauldron logo/icon (hexagonal geometry, concentric rings, amber core glow). Use as favicon reference and SVG recreation source.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Event store** (`packages/shared/src/db/event-store.ts`): 32 event types covering full pipeline lifecycle — drives SSE streaming. Has `sequenceNumber` for Last-Event-ID reconnection.
- **DB schema** (`packages/shared/src/db/schema/`): All tables for projects, seeds, beads, bead_edges, events, holdout_vault, snapshots. Dashboard reads from these.
- **Engine modules** (`packages/engine/src/`): Interview FSM, holdout vault, DAG decomposition, parallel execution, evolutionary loop — all implemented. Dashboard calls into these via tRPC.

### Established Patterns
- **Monorepo structure**: Turborepo + pnpm workspaces. packages/web is the designated web app package.
- **Hono for API server** (packages/api): Agent workers use Hono. Dashboard should use Next.js Route Handlers + tRPC, NOT Hono.
- **Event sourcing**: All state changes are immutable events. Dashboard can subscribe to event stream for real-time updates.
- **Drizzle ORM**: All DB access via Drizzle. Dashboard queries should follow same pattern.

### Integration Points
- **tRPC**: New — needs to be set up. Internal API boundary between Next.js frontend and backend. Type-safe, no schema drift with TanStack Query v5.
- **SSE endpoint**: New — Next.js Route Handler subscribing to PostgreSQL LISTEN/NOTIFY (or polling event store). Pushes bead status, logs, diffs to React Flow nodes.
- **Engine function calls**: Dashboard backend calls engine functions (startInterview, crystallizeSeed, runDecomposition, etc.) via tRPC procedures.

</code_context>

<specifics>
## Specific Ideas

- The Cauldron icon (icon.png) features hexagonal petals around concentric dark rings with an amber/orange glowing core — this exact aesthetic should inform the SVG recreation and nav branding.
- The dual accent system (teal for interaction, amber for energy) was inspired by the icon's amber glow contrasting with the teal discussed for the UI. Maps naturally: teal buttons/links/focus rings, amber for active beads/progress/convergence/logo.
- Terminal-style log pane should feel like watching a real build process — the HZD equivalent of monitoring machine internals.
- The dynamic hex background that brightens near active elements creates the feeling of energy flowing through the Cauldron as agents work.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-web-dashboard*
*Context gathered: 2026-03-26*
