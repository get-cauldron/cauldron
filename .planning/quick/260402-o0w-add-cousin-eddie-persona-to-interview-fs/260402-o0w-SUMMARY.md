---
phase: quick
plan: 260402-o0w
subsystem: engine/interview
tags: [interview, contrarian, fsm, personas, ai-quality]
dependency_graph:
  requires: []
  provides:
    - packages/engine/src/interview/contrarian.ts
  affects:
    - packages/engine/src/interview/perspectives.ts
    - packages/engine/src/interview/fsm.ts
    - packages/engine/src/interview/types.ts
    - packages/engine/src/gateway/config.ts
tech_stack:
  added: []
  patterns:
    - "Two-stage parallel orchestration: Stage A (scoring + contrarian), Stage B (perspectives with context)"
    - "Additive non-blocking integration: contrarian failure wrapped in .catch(), interview continues"
    - "Context injection pattern: Cousin Eddie output feeds into primary interviewer, never directly to user"
key_files:
  created:
    - packages/engine/src/interview/contrarian.ts
    - packages/engine/src/interview/__tests__/contrarian.test.ts
  modified:
    - packages/engine/src/interview/types.ts
    - packages/engine/src/interview/perspectives.ts
    - packages/engine/src/interview/fsm.ts
    - packages/engine/src/interview/index.ts
    - packages/engine/src/gateway/config.ts
    - packages/engine/src/interview/__tests__/perspectives.test.ts
    - packages/engine/src/interview/__tests__/fsm.test.ts
decisions:
  - "ContrarianFraming is NOT a PerspectiveName — Cousin Eddie is a separate analytical layer, not a panel perspective"
  - "Contrarian failure is non-blocking: .catch() returns empty framings, interview proceeds normally"
  - "Only last 2 transcript turns sent to contrarian — focused context, not diluted by history"
  - "contrarianModel on GatewayConfig enables cross-model diversity (different model from primary interviewer)"
metrics:
  duration: ~7 minutes
  completed: 2026-04-02T23:29:00Z
  tasks_completed: 3
  files_modified: 7
  files_created: 2
---

# Quick Task 260402-o0w: Add Cousin Eddie Contrarian Persona to Interview FSM

**One-liner:** Contrarian analytical layer (Cousin Eddie) that treats user statements as hypotheses, generates alternative framings from orthogonal dimensions, and feeds them as enriched context into the primary interview perspectives — non-blocking, cross-model, never surfaced directly to the user.

## What Was Built

The Cousin Eddie pattern is a "you sure about that, Clark?" energy injected into the Socratic interview system. It operates as a hidden analytical layer:

1. **Runs in parallel with scoring** (Stage A) — no latency cost over the existing two-stage flow
2. **Generates 2-3 alternative framings** of the user's recent statements, treating them as hypotheses rather than settled requirements
3. **Injects framings as context** into each perspective's prompt (Stage B) — so the researcher, architect, etc. can organically weave contrarian insights into their questions
4. **Never shown to the user** — the perspectives are instructed to integrate the insight naturally, not quote the framings

The result: the interview feels like talking to a thoughtful peer who has genuinely considered alternatives, not a chatbot asking sequential questions.

## Architecture

```
submitAnswer()
  │
  ├── Stage A (parallel)
  │   ├── scoreTranscript()          → AmbiguityScores
  │   └── runContrarianAnalysis()    → ContrarianFraming[]
  │                                     (last 2 turns only)
  │                                     (.catch → [] on failure)
  │
  └── Stage B
      └── runActivePerspectives(contrarianFramings) → PerspectiveCandidate[]
          └── buildPerspectivePrompt(transcript, framings)
              └── Injects "Alternative framings to consider" section
                  before "ask one helpful clarifying question" instruction
```

## Files Changed

**Created:**
- `packages/engine/src/interview/contrarian.ts` — CONTRARIAN_SYSTEM_PROMPT, contrarianOutputSchema, runContrarianAnalysis
- `packages/engine/src/interview/__tests__/contrarian.test.ts` — schema validation, prompt keyword checks, gateway mock tests

**Modified:**
- `packages/engine/src/interview/types.ts` — Added ContrarianFraming interface
- `packages/engine/src/gateway/config.ts` — Added contrarianModel field to GatewayConfig
- `packages/engine/src/interview/perspectives.ts` — buildPerspectivePrompt accepts optional ContrarianFraming[]; runActivePerspectives passes them through
- `packages/engine/src/interview/fsm.ts` — Two-stage parallel orchestration in submitAnswer
- `packages/engine/src/interview/index.ts` — Export ContrarianFraming type + contrarian module
- `packages/engine/src/interview/__tests__/perspectives.test.ts` — New tests for buildPerspectivePrompt with/without framings
- `packages/engine/src/interview/__tests__/fsm.test.ts` — Updated mock sequences to account for contrarian generateObject call

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 7589cc4 | feat(quick-260402-o0w): add Cousin Eddie contrarian module |
| 2 | f587692 | feat(quick-260402-o0w): wire Cousin Eddie into perspective prompts and FSM |

## Test Results

- 518 tests passing (engine)
- 6 pre-existing failures (gpt-4o/OpenAI diversity+pricing tests — being removed in Phase 30)
- Zero new test failures
- Engine typecheck: zero errors
- Full monorepo build: 5/5 successful

## Deviations from Plan

None — plan executed exactly as written.

**Note on pre-existing failures:** The gateway diversity and pricing tests fail because `gpt-4o` was already removed from the model registry as part of Phase 30 work (replace-openai-provider). These failures predate this task and are out of scope.

## Known Stubs

None. The contrarian module is fully wired — contrarianModel defaults to the interview stage model when not configured, contrarianOutputSchema validates at schema level, and the FSM orchestration is live.

## Self-Check: PASSED

- contrarian.ts: FOUND
- contrarian.test.ts: FOUND
- Commit 7589cc4 (Task 1): FOUND
- Commit f587692 (Task 2): FOUND
