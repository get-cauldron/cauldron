# Phase 8: Web Dashboard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 08-web-dashboard
**Areas discussed:** Interview chat UX, DAG visualization, Real-time streaming, HZD visual identity, Escalation UX, Project CRUD, Page structure, Responsive/mobile

---

## Interview Chat UX

### Chat Style

| Option | Description | Selected |
|--------|-------------|----------|
| Conversational chat | Chat bubbles like ChatGPT/Claude, MC options as clickable chips | ✓ |
| Wizard/stepper | Step-by-step form with progress bar, one question per step | |
| Hybrid | Chat flow with persistent sidebar for score/summary | |

**User's choice:** Conversational chat
**Notes:** Familiar UX, natural message flow

### Score Display

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in chat | Score bar updates below latest message | |
| Persistent sidebar | Score, dimension breakdown, live summary in right panel | ✓ |

**User's choice:** Persistent sidebar
**Notes:** Always visible, chat stays clean

### Approval UX (Seed Crystallization)

| Option | Description | Selected |
|--------|-------------|----------|
| Inline approval | Rich card in chat stream with edit/approve/reject | ✓ |
| Modal overlay | Full-screen modal with editable fields | |
| Dedicated review page | Separate page with full summary | |

**User's choice:** Inline approval
**Notes:** No page change, natural conversation step

### Threshold Transition

| Option | Description | Selected |
|--------|-------------|----------|
| Prompt user | "Ready to crystallize" banner, user decides | ✓ |
| Auto-show summary | Automatically present summary when threshold hit | |
| You decide | Claude picks based on existing FSM | |

**User's choice:** Prompt user
**Notes:** User stays in control

### Holdout Test Review

| Option | Description | Selected |
|--------|-------------|----------|
| Inline cards | Expandable cards per scenario with approve/reject/edit | ✓ |
| Separate review panel | Side panel or page with all scenarios in table | |
| You decide | Claude picks based on scenario count | |

**User's choice:** Inline cards
**Notes:** Consistent with seed approval pattern

### Perspective Panel

| Option | Description | Selected |
|--------|-------------|----------|
| Hidden | Perspectives work behind the scenes | |
| Subtle indicator | Small icon/tag on each question showing which perspective | ✓ |
| Expandable detail | Normal questions with expandable "why this question" | |

**User's choice:** Subtle indicator
**Notes:** Adds transparency without clutter

### Input Style

| Option | Description | Selected |
|--------|-------------|----------|
| Chips + text field | MC as clickable chips above text input, chips disappear after selection | ✓ |
| Inline buttons + textarea | Full-width buttons with "Type your own" expansion | |
| You decide | Claude picks for HZD aesthetic | |

**User's choice:** Chips + text field

---

## DAG Visualization

### Layout Direction

| Option | Description | Selected |
|--------|-------------|----------|
| Top-to-bottom | Roots at top, leaves at bottom, dagre default | ✓ |
| Left-to-right | Roots on left, timeline flows right | |
| You decide | Claude picks based on DAG shapes | |

**User's choice:** Top-to-bottom

### Node Interaction

| Option | Description | Selected |
|--------|-------------|----------|
| Slide-out detail panel | Right-side panel with spec, logs, diffs; DAG stays visible | ✓ |
| Inline expand | Node expands in-place | |
| Navigate to detail page | Dedicated bead detail page | |
| Hover tooltip + click panel | Progressive disclosure | |

**User's choice:** Slide-out detail panel

### Node Density

| Option | Description | Selected |
|--------|-------------|----------|
| Compact | Name + status icon + colored border | |
| Rich cards | Name + status + model + time + progress bar | ✓ |
| You decide | Claude picks based on DAG sizes | |

**User's choice:** Rich cards

### Edge Style

| Option | Description | Selected |
|--------|-------------|----------|
| Color-coded by type | blocks=solid, parent-child=dashed, conditional=dotted, waits-for=teal glow | ✓ |
| Uniform with labels | Same style, text labels on hover | |
| Animated flow | Particle/energy flow along edges | |

**User's choice:** Color-coded by type

### Molecule Grouping

| Option | Description | Selected |
|--------|-------------|----------|
| Collapsible groups | Container boxes around child beads, can collapse | ✓ |
| Flat nodes | Regular nodes with explicit parent-child edges | |
| You decide | Claude picks based on React Flow capabilities | |

**User's choice:** Collapsible groups

### Auto-Focus

| Option | Description | Selected |
|--------|-------------|----------|
| Subtle auto-pan | Gentle pan to active beads, user can override, minimap | ✓ |
| Static + notifications | DAG stays put, toast notifications with "jump to" links | |
| Full auto-track | Camera always centers on most recently changed bead | |

**User's choice:** Subtle auto-pan

### Evolution History

| Option | Description | Selected |
|--------|-------------|----------|
| Timeline selector | Horizontal strip above DAG, each generation as a dot | ✓ |
| Separate page | Own page with seed lineage tree view | |
| You decide | Claude picks best UX | |

**User's choice:** Timeline selector

### Convergence Signals

| Option | Description | Selected |
|--------|-------------|----------|
| Inline indicators | Health icons on timeline dots (green/yellow/red) | |
| Dedicated panel | Charts with score trends, ontology diff | |
| Both | Quick indicators + expandable detail panel | ✓ |

**User's choice:** Both

---

## Real-time Streaming

### Transport Protocol

| Option | Description | Selected |
|--------|-------------|----------|
| SSE + REST | SSE for streaming, REST POST for actions, no WebSocket | ✓ |
| SSE + WebSocket hybrid | SSE for data, WebSocket for interview chat | |
| WebSocket only | Single WebSocket for everything | |

**User's choice:** SSE + REST
**Notes:** CLAUDE.md aligned, simpler infrastructure

### Log Stream

| Option | Description | Selected |
|--------|-------------|----------|
| Terminal-style pane | Scrolling monospace, ANSI color, auto-scroll | ✓ |
| Structured log cards | Formatted cards, filterable by level | |
| You decide | Claude picks | |

**User's choice:** Terminal-style pane

### Diff View

| Option | Description | Selected |
|--------|-------------|----------|
| Split diff | Side-by-side old/new with syntax highlighting | ✓ |
| Unified diff | Single column with +/- lines | |
| You decide | Claude picks based on panel width | |

**User's choice:** Split diff

### SSE Reconnection

| Option | Description | Selected |
|--------|-------------|----------|
| Event ID + catch-up | Last-Event-ID header, server replays from event store | ✓ |
| Full state refresh | Fetch full current state via REST on reconnect | |
| You decide | Claude picks | |

**User's choice:** Event ID + catch-up

### Cost Dashboard

| Option | Description | Selected |
|--------|-------------|----------|
| Embedded summary + detail page | Badge on header, click for full breakdown | ✓ |
| Sidebar widget | Always-visible counter | |
| You decide | Claude picks | |

**User's choice:** Embedded summary + detail page

### Landing Page

| Option | Description | Selected |
|--------|-------------|----------|
| Project list | All projects with status, activity, cost summary | ✓ |
| Last active project | Auto-open most recent, switcher in nav | |
| You decide | Claude picks | |

**User's choice:** Project list

---

## HZD Visual Identity

### Aesthetic Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Full immersive | Dark metallic, hex patterns, teal/blue glow, industrial-organic | ✓ |
| Tasteful accents | Standard dark dashboard with HZD touches | |
| Game UI replica | Scan lines, holographic overlays, machine glyphs | |

**User's choice:** Full immersive

### Accent Color (prompted by icon.png review)

| Option | Description | Selected |
|--------|-------------|----------|
| Teal for UI, amber for logo | Dashboard teal, icon amber only | |
| Amber/orange throughout | Match icon's amber glow everywhere | |
| Dual accent system | Teal for interaction, amber for energy/status | ✓ |
| You decide | Claude picks unified palette | |

**User's choice:** Dual accent system
**Notes:** Teal buttons/links/focus, amber for active beads/progress/convergence/logo

### Typography

| Option | Description | Selected |
|--------|-------------|----------|
| Geometric sans | Inter/Geist for body, monospace for code, HZD from layout/color | ✓ |
| Industrial display font | Orbitron/Rajdhani for headers, sans for body | |
| You decide | Claude picks for Tailwind v4 + shadcn | |

**User's choice:** Geometric sans
**Notes:** ALL-CAPS headers, generous letter-spacing, thin rules, hex bullets

### Status Animations

| Option | Description | Selected |
|--------|-------------|----------|
| Subtle glow transitions | Brief teal pulse, edges light up on resolve | ✓ |
| Full particle effects | Burst on complete, rotating glow on active | |
| Minimal/none | Color changes only | |

**User's choice:** Subtle glow transitions

### Logo Usage

| Option | Description | Selected |
|--------|-------------|----------|
| Use icon.png directly | Favicon, nav header, loading screen | |
| SVG recreation needed | Recreate for crisp rendering, animate glow | |
| Both | icon.png as favicon + SVG for nav with animated glow | ✓ |

**User's choice:** Both

### Dark Mode

| Option | Description | Selected |
|--------|-------------|----------|
| Dark only | HZD inherently dark, ship dark-only for v1 | ✓ |
| Dark default + light option | Include light mode toggle | |
| You decide | Claude decides | |

**User's choice:** Dark only

### Hex Pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Subtle background pattern | Faint hex grid at low opacity | |
| Element-specific only | Hex shapes in specific UI elements only | |
| Both + dynamic | Background grid that brightens near active elements | ✓ |

**User's choice:** Both + dynamic

### Navigation

| Option | Description | Selected |
|--------|-------------|----------|
| Collapsible sidebar | Narrow icon sidebar, expands on hover/click | ✓ |
| Top nav bar | Horizontal navigation | |
| Command palette only | Cmd+K only, no persistent nav | |

**User's choice:** Collapsible sidebar

---

## Escalation UX

### Notification Style

| Option | Description | Selected |
|--------|-------------|----------|
| Persistent banner + toast | Toast on arrival + amber banner until resolved + badge | ✓ |
| Inline in DAG view | Glowing node with "Action needed" badge | |
| Notification center | Bell icon dropdown | |

**User's choice:** Persistent banner + toast

### Response Actions

| Option | Description | Selected |
|--------|-------------|----------|
| Guided resolution | Structured options (retry, skip, guide, abort) | |
| Freeform text response | Type guidance for next cycle | |
| Both | Guided options + freeform text field | ✓ |

**User's choice:** Both

---

## Project CRUD

### New Project Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal creation + interview | Name + description, then straight to interview | ✓ |
| Setup wizard first | Multi-step wizard before interview | |
| You decide | Claude picks | |

**User's choice:** Minimal creation + interview

### Settings Location

| Option | Description | Selected |
|--------|-------------|----------|
| Project settings page | Gear icon opens settings page | ✓ |
| Inline in interview sidebar | Configurable in interview sidebar | |
| You decide | Claude picks | |

**User's choice:** Project settings page

---

## Page Structure

### View Organization

| Option | Description | Selected |
|--------|-------------|----------|
| Tab-based within project | Interview|Execution|Evolution|Costs tabs per project | ✓ |
| Single unified view | One scrollable page | |
| Separate pages in sidebar | Each view as sidebar item | |

**User's choice:** Tab-based within project

### Split View

| Option | Description | Selected |
|--------|-------------|----------|
| One at a time | Standard tab behavior, each gets full width | ✓ |
| Optional split view | Draggable tabs for side-by-side | |
| You decide | Claude picks | |

**User's choice:** One at a time

---

## Responsive/Mobile

### Device Support

| Option | Description | Selected |
|--------|-------------|----------|
| Desktop-only | 1280px+ screens | ✓ |
| Responsive to tablet | 768px+ with collapsed DAG | |
| You decide | Claude picks | |

**User's choice:** Desktop-only

---

## Claude's Discretion

- Specific hex color values for bead status states
- shadcn/ui component customization approach
- Animation timing/easing curves
- React Flow node/edge component internals
- tRPC router structure
- SSE endpoint design

## Deferred Ideas

None — discussion stayed within phase scope
