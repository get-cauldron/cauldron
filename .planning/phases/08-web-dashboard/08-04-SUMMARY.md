---
phase: 08-web-dashboard
plan: "04"
subsystem: web-dashboard
tags: [interview, chat-ui, trpc, ambiguity-meter, ux]
dependency_graph:
  requires: ["08-02", "08-03"]
  provides: ["interview-chat-ui", "interview-trpc-router"]
  affects: ["packages/web/src/trpc", "packages/web/src/components/interview", "packages/web/src/app/projects/[id]/interview"]
tech_stack:
  added: []
  patterns:
    - "tRPC publicProcedure with z.object() Zod v4 validation for all interview procedures"
    - "InterviewFSM DB-layer integration via Drizzle queries (no LLM gateway in web tRPC layer)"
    - "SVG circular gauge for AmbiguityMeter with stroke-dasharray proportional to clarity"
    - "Base UI Collapsible (not Radix) — no asChild prop, CollapsibleTrigger accepts className directly"
    - "Zod v4 z.record() requires two arguments: z.record(z.string(), z.unknown())"
key_files:
  created:
    - packages/web/src/trpc/routers/interview.ts
    - packages/web/src/components/interview/ChatBubble.tsx
    - packages/web/src/components/interview/MCChipGroup.tsx
    - packages/web/src/components/interview/AmbiguityMeter.tsx
    - packages/web/src/components/interview/SeedApprovalCard.tsx
    - packages/web/src/components/interview/HoldoutCard.tsx
    - packages/web/src/components/interview/ClarityBanner.tsx
    - packages/web/src/app/projects/[id]/interview/page.tsx
  modified:
    - packages/web/src/trpc/router.ts
decisions:
  - "interview tRPC sendAnswer records user turn to DB immediately; LLM scoring runs async via engine (not synchronously in web layer) — prevents web request timeouts on LLM calls"
  - "HoldoutCard uses Base UI Collapsible directly (no asChild wrapper) — base-ui CollapsibleTrigger does not support asChild prop unlike Radix"
  - "z.record(z.string(), z.unknown()) for Zod v4 — z.record(z.unknown()) is Zod v3 API only"
metrics:
  duration: "6 minutes"
  completed: "2026-03-27T02:42:33Z"
  tasks: 2
  files: 9
---

# Phase 8 Plan 04: Interview Chat UI Summary

Interview chat UI with tRPC router, 6 custom React components, and full interview page implementing the Socratic interview flow with ambiguity scoring sidebar, inline approval gates, and MC chips.

## What Was Built

### Task 1: Interview tRPC Router

`packages/web/src/trpc/routers/interview.ts` — 9 procedures covering the full interview lifecycle:

| Procedure | Type | Purpose |
|-----------|------|---------|
| `getTranscript` | Query | Returns transcript, scores, phase, MC suggestions, perspective for a projectId |
| `sendAnswer` | Mutation | Records user answer to DB; LLM scoring happens async in engine worker |
| `getSummary` | Query | Returns structured SeedSummary when phase is reviewing or approved |
| `approveSummary` | Mutation | Crystallizes seed — creates seeds row, transitions interview to crystallized |
| `rejectSummary` | Mutation | Transitions back to gathering for further refinement |
| `getHoldouts` | Query | Returns holdout scenarios from holdout_vault draftScenarios for a seedId |
| `approveHoldout` | Mutation | Sets holdout_vault entry status to approved |
| `rejectHoldout` | Mutation | Clears draftScenarios and resets to pending_review |
| `sealHoldouts` | Mutation | Marks all approved entries as sealed (encryption triggered by Inngest handler) |

Router merged into `appRouter` in `router.ts`.

### Task 2: Interview Chat Components and Page

Six custom components built to HZD theme spec:

**ChatBubble** — Left-aligned system messages (bg `#111820`, rounded-tl-none) and right-aligned user messages (bg `#1a2330`, rounded-tr-none). Perspective avatar (24px) with color map: researcher `#2563eb`, simplifier `#059669`, architect `#7c3aed`, breadth-keeper `#d97706`, seed-closer `#00d4aa`. Hover tooltip shows full perspective name.

**MCChipGroup** — Horizontal flex-wrap chips with `opacity` fade animation on selection (150ms `ease-out-quad`). Uses internal `selected` state; renders null after fade. Hover: `#1a2330` bg + teal border. Min-height 44px (touch target).

**AmbiguityMeter** — SVG circular gauge using `stroke-dasharray`/`stroke-dashoffset` proportional to `overallClarity`. Color: amber `#d97706` (< 0.5), linear interpolation, teal `#00d4aa` (> 0.8). Center text Display typography (20px, 600 weight). Dimension breakdown: GOAL, CONSTRAINTS, SUCCESS CRITERIA progress bars; CONTEXT row only shown when `!isGreenfield`.

**SeedApprovalCard** — Inline shadcn Card (not modal) with SEED SUMMARY heading (ALL-CAPS, letter-spacing), structured sections (goal, constraints, acceptance criteria, evaluation principles), and "Crystallize Seed" / "Revise" CTAs. Loading state shows Skeleton placeholders.

**HoldoutCard** — Base UI Collapsible wrapping Card. Collapsed: scenario name + status badge. Expanded: description + code block (Geist Mono, `#0a0f14` bg) + approve/reject buttons. Status badge colors: pending `#3d5166`, approved `#00d4aa`, rejected `#e5484d`.

**ClarityBanner** — Teal left-border banner (4px `#00d4aa`) above input when threshold reached. Copy: "Your answers have reached sufficient clarity. You can continue refining or crystallize the seed now." Two CTAs: "Crystallize Seed" (teal primary) + "Keep Refining" (outline).

**Interview Page** (`/projects/[id]/interview`) — Chat area (flex-1, ScrollArea) + 320px fixed right sidebar. Chat renders turn-by-turn ChatBubble list, MCChipGroup after last system message, SeedApprovalCard inline when reviewing, HoldoutCard list when crystallized, ClarityBanner above input. Input: freeform text field + "Send Answer" button. Sidebar: AmbiguityMeter + live goal summary + phase step indicators.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Collapsible asChild incompatibility**
- **Found during:** Task 2 — TypeScript check
- **Issue:** `HoldoutCard` used `<CollapsibleTrigger asChild>` but the project uses Base UI's Collapsible, not Radix — Base UI does not have an `asChild` prop on CollapsibleTrigger
- **Fix:** Changed CollapsibleTrigger to render directly with `className` and `style` props instead of wrapping a `<button>` with asChild
- **Files modified:** `packages/web/src/components/interview/HoldoutCard.tsx`
- **Commit:** 6100ee0

**2. [Rule 1 - Bug] Fixed Zod v4 z.record() API**
- **Found during:** Task 1 — TypeScript check
- **Issue:** `z.record(z.unknown())` is Zod v3 API; Zod v4 requires `z.record(z.string(), z.unknown())`
- **Fix:** Updated `interview.ts` to use `z.record(z.string(), z.unknown())`
- **Files modified:** `packages/web/src/trpc/routers/interview.ts`
- **Commit:** 8d8e8c4

**3. [Rule 1 - Bug] Fixed PerspectiveName type comparison with 'user'**
- **Found during:** Task 2 — TypeScript check
- **Issue:** `turn.perspective !== 'user'` caused TS2367 because `PerspectiveName` type has no 'user' variant — user turns are recorded with 'user' cast in FSM but the type doesn't include it
- **Fix:** Cast to `(turn.perspective as string) !== 'user'` to safely handle the runtime case
- **Files modified:** `packages/web/src/app/projects/[id]/interview/page.tsx`
- **Commit:** 6100ee0

**4. [Rule 2 - Missing null safety] Added null coalescing for optional SeedSummaryData fields**
- **Found during:** Task 2 — TypeScript check
- **Issue:** `evaluationPrinciples` is optional in `SeedSummaryData` but `approveSummary` mutation input requires it
- **Fix:** Spread summary with `?? []` fallback for optional fields in `handleApproveSummary`
- **Files modified:** `packages/web/src/app/projects/[id]/interview/page.tsx`
- **Commit:** 6100ee0

## Known Stubs

**Interview page holdout scenarios** — `holdoutScenarios` is hardcoded as `[]` in the interview page. Holdouts require a `seedId` after crystallization, but the page currently has no seedId state. The holdout rendering path exists and is wired but will always show empty until a follow-on plan:

- File: `packages/web/src/app/projects/[id]/interview/page.tsx`, line ~151
- Reason: The interview page does not yet receive/track the seedId returned from `approveSummary`. This is intentional for plan scope — a future plan that connects the full project lifecycle will wire the seedId from the crystallization result into a `getHoldouts` query.

**sendAnswer async engine integration** — The `sendAnswer` tRPC mutation records the user's answer to the DB but does not call the LLM engine synchronously. The actual scoring, perspective selection, and next-question generation run via Inngest/engine workers. The page relies on refetch after mutation to show updated state. This means new system questions won't appear until the engine worker has processed the answer.

- File: `packages/web/src/trpc/routers/interview.ts`, line ~87
- Reason: Calling the LLM engine synchronously from a web tRPC request would cause timeouts on slow models. The correct pattern is async via Inngest + SSE push. Wired for Plan 08-05 (execution streaming).

## Self-Check: PASSED

Files created:
- FOUND: packages/web/src/trpc/routers/interview.ts
- FOUND: packages/web/src/components/interview/ChatBubble.tsx
- FOUND: packages/web/src/components/interview/MCChipGroup.tsx
- FOUND: packages/web/src/components/interview/AmbiguityMeter.tsx
- FOUND: packages/web/src/components/interview/SeedApprovalCard.tsx
- FOUND: packages/web/src/components/interview/HoldoutCard.tsx
- FOUND: packages/web/src/components/interview/ClarityBanner.tsx
- FOUND: packages/web/src/app/projects/[id]/interview/page.tsx

Commits: a9a7523, 6100ee0, 8d8e8c4 — all present in git log.
