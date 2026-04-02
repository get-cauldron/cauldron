---
phase: quick
plan: 260402-oou
subsystem: engine/interview, web/components
tags: [interview, personas, perspectives, system-prompts]
dependency_graph:
  requires: []
  provides: [character-persona-prompts, updated-PerspectiveName-type]
  affects: [interview-fsm, lateral-thinking, cauldron-config, chat-bubble-ui]
tech_stack:
  added: []
  patterns: [character-persona-prompting]
key_files:
  created: []
  modified:
    - packages/engine/src/interview/types.ts
    - packages/engine/src/interview/perspectives.ts
    - packages/web/src/components/interview/ChatBubble.tsx
    - packages/engine/src/evolution/lateral-thinking.ts
    - cauldron.config.ts
    - packages/engine/src/interview/__tests__/perspectives.test.ts
    - packages/engine/src/interview/__tests__/fsm.test.ts
    - packages/engine/src/interview/__tests__/scorer.test.ts
    - packages/engine/src/interview/__tests__/contrarian.test.ts
    - packages/engine/src/interview/__tests__/synthesizer.test.ts
    - packages/engine/src/interview/__tests__/fsm-sendAnswer.integration.test.ts
    - packages/engine/src/evolution/__tests__/lateral-thinking.test.ts
    - packages/engine/src/evolution/__tests__/mutator.test.ts
    - packages/web/src/trpc/routers/__tests__/interview-engine.test.ts
    - packages/web/src/__tests__/components/interview/ChatBubble.test.tsx
    - packages/web/src/__tests__/pages/interview-page.test.tsx
    - packages/web/e2e/interview.spec.ts
    - packages/web/e2e/pipeline-live.spec.ts
    - packages/web/e2e/helpers/live-infra.ts
    - packages/test-harness/src/scripts/interview-turn.ts
    - packages/shared/src/db/__tests__/interview.integration.test.ts
decisions:
  - "lateral-thinking PERSONAS renamed occam/henry-wu/heist-o-tron instead of simplifier/researcher/architect — keeps personality consistent across interview and evolution subsystems"
  - "interview-turn.d.ts excluded from commit (gitignored generated file) — source .ts updated"
metrics:
  duration: 25m
  completed: "2026-04-02"
  tasks: 2
  files: 21
---

# Phase quick Plan 260402-oou: Rename Interview Perspectives to Character Personas Summary

**One-liner:** Renamed 5 interview perspectives to character personas (henry-wu, occam, heist-o-tron, hickam, kirk) with source-material-flavored system prompts that make each voice intellectually distinct, not just relabeled.

## What Was Done

Replaced the generic role labels (researcher, simplifier, architect, breadth-keeper, seed-closer) with character personas drawn from Jurassic Park, Occam's Razor, Rick and Morty, Hickam's Dictum, and Star Trek. Each character got a new system prompt that captures their actual epistemic personality — not a description of the role but a voice directive.

The evolution module's lateral-thinking personas were also renamed consistently (simplifier -> occam, researcher -> henry-wu, architect -> heist-o-tron), keeping `contrarian` and `hacker` unchanged since they are evolution-specific identities without interview counterparts.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Rename PerspectiveName type and rewrite character system prompts | ef55eb7 |
| 2 | Update all test files, E2E, and harness to new persona names | 4364960 |

## Verification

- `pnpm typecheck` — zero errors across all 7 packages
- `pnpm -F @get-cauldron/engine test` — 524/524 passed
- `pnpm -F @get-cauldron/web test` — 173/173 passed
- `pnpm -F @get-cauldron/shared test` — 57/57 passed
- Codebase grep for old names returns zero matches in source/test files (excluding dist/, gitignored .d.ts generated files, and worktrees)

**Pre-existing failure (not caused by this task):** `@get-cauldron/cli` bootstrap.test.ts fails on `configurePublisher` mock — confirmed identical failure before changes via `git stash` check.

## Deviations from Plan

None — plan executed exactly as written. The `interview-turn.d.ts` file is gitignored (generated file); only the source `.ts` was updated.

## Known Stubs

None.

## Self-Check: PASSED

Commits exist:
- ef55eb7: feat(260402-oou): rename interview perspectives to character personas with distinct system prompts
- 4364960: chore(260402-oou): update all tests, E2E, and harness to use new persona names

Source files contain new names:
- `packages/engine/src/interview/types.ts` contains `henry-wu`
- `packages/engine/src/interview/perspectives.ts` contains `Henry Wu`
- `packages/web/src/components/interview/ChatBubble.tsx` contains `henry-wu`
