# Phase 7: Evolutionary Loop - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 07-evolutionary-loop
**Areas discussed:** Goal vs spec evaluation, Evolution trigger & seed mutation, Convergence signals, Lateral thinking & escalation, Token budget circuit breaker, Holdout unsealing timing, v1 test case strategy, Evolution FSM states

---

## Goal vs Spec Evaluation

| Option | Description | Selected |
|--------|-------------|----------|
| LLM judge with rubric | Cross-model LLM scores goal attainment on weighted dimensions | ✓ |
| Holdout-only proxy | Treat holdout pass rate as goal signal | |
| Human-in-the-loop judge | Human judges goal attainment | |

**User's choice:** LLM judge with rubric
**Notes:** Score >= 0.95 = success (user specified, higher than default 8/10). Cross-model enforced. Weighted dimensions from evaluation_principles. Per-dimension gap analysis.

## Evolution Trigger & Seed Mutation

| Option | Description | Selected |
|--------|-------------|----------|
| LLM rewrites AC only | Revise acceptance criteria, keep goal/constraints | partial ✓ |
| Full seed regeneration | Re-run crystallizer from scratch | partial ✓ |
| Surgical patch object | Deterministic diff, no LLM | |

**User's choice:** Tiered approach: score < 0.4 → full regeneration, score >= 0.4 → AC rewrite only
**Notes:** Same tiered logic for bead reuse: < 0.4 clean slate, >= 0.4 keep completed. Generation counter + evolution_context JSONB on seed.

## Convergence Signals

| Option | Description | Selected |
|--------|-------------|----------|
| Any-of, independent | First signal to fire halts | ✓ |
| Tiered priority | Hard cap > stability > stagnation | |
| Weighted consensus | Signals vote with weights | |

**User's choice:** Any-of, independent
**Notes:** Jaccard + embedding for ontology stability (OpenAI text-embedding-3-large). Period 2-4 oscillation detection. Repetitive feedback: gap IDs + embedding fallback.

## Lateral Thinking & Escalation

| Option | Description | Selected |
|--------|-------------|----------|
| All 5 in parallel, vote | Maximum creative diversity | ✓ |
| Sequential escalation | One persona at a time | |
| Random subset of 2-3 | Cheaper, still diverse | |

**User's choice:** All 5 parallel, LLM meta-judge synthesis
**Notes:** Human escalation only after lateral thinking fails. Notification: event + optional webhook.

## Token Budget Circuit Breaker

| Option | Description | Selected |
|--------|-------------|----------|
| Cumulative per-seed-lineage | Track total across all generations | ✓ |
| Per-generation budget | Fixed slice per generation | |
| Adaptive budget | Adjusts based on progress | |

**User's choice:** Cumulative per-seed-lineage

## Holdout Unsealing Timing

| Option | Description | Selected |
|--------|-------------|----------|
| On any terminal state | Unseal regardless of how loop ended | ✓ |
| Positive convergence only | Only unseal on genuine convergence | |
| Convergence + human approval | Unseal on convergence or human says so | |

**User's choice:** On any terminal state

## v1 Test Case Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Constrain interview scope | Give vague answers to underspecify | |
| Sabotage holdouts | Write holdouts targeting unmentioned edge cases | ✓ |
| Just run it honestly | Hope 0.95 bar is high enough | |

**User's choice:** Sabotage holdouts

## Evolution FSM States

| Option | Description | Selected |
|--------|-------------|----------|
| 6-state linear with branches | Standard lifecycle | |
| 3-state minimal | running/converged/halted | |
| 8-state granular | Maximum observability | ✓ |

**User's choice:** 8-state granular (idle, evaluating, scoring, evolving, lateral_thinking, decomposing, executing, merging, converged, halted)

## Claude's Discretion

- Rubric dimension names and default weights
- Prompt design for LLM judge and personas
- Embedding integration details

## Deferred Ideas

None
