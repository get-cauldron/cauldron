# Phase 3: Interview & Seed Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-25
**Phase:** 03-interview-seed-pipeline
**Areas discussed:** Interview FSM design, Multi-perspective panel, Ambiguity scoring, Seed crystallization

---

## Interview FSM Design

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated interviews table | New table with id, projectId, status, transcript, scores, timestamps | ✓ |
| Event-sourced only | Reconstruct interview state from event store entries | |
| Inline on seed draft | Store transcript on seeds table while status='draft' | |

**User's choice:** Dedicated interviews table
**Notes:** Seeds already have interviewId FK; new table provides clean separation of concerns.

| Option | Description | Selected |
|--------|-------------|----------|
| Linear flow | gathering → reviewing → approved → crystallized + paused/abandoned | ✓ |
| Branching flow | Sub-states per perspective, user can revisit earlier topics | |
| You decide | Claude picks | |

**User's choice:** Linear flow

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, full resume | Interview state persisted, resumable across sessions | ✓ |
| No, single-session only | Must complete in one session | |
| You decide | Claude picks | |

**User's choice:** Yes, full resume

| Option | Description | Selected |
|--------|-------------|----------|
| Both from day one | Greenfield + brownfield modes, different scoring matrices | ✓ |
| Greenfield only, brownfield later | Build greenfield now, add brownfield with Code Intelligence | |
| You decide | Claude picks | |

**User's choice:** Both from day one

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-detect at start | If project has existing code, auto-use brownfield mode | ✓ |
| User explicitly chooses | First question asks greenfield vs brownfield | |
| You decide | Claude picks | |

**User's choice:** Auto-detect at start

| Option | Description | Selected |
|--------|-------------|----------|
| Score-driven with soft cap | Primary: ambiguity <= 0.2. Soft cap at ~25 questions | |
| Purely score-driven | Only ambiguity threshold matters, no cap | ✓ |
| Hard cap at N questions | Fixed maximum, force crystallization | |
| You decide | Claude picks | |

**User's choice:** Purely score-driven

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, with clear warning | User can force-crystallize early, see score gap and weak dimensions | ✓ |
| No, must hit threshold | Refuse to crystallize until <= 0.2 | |
| You decide | Claude picks | |

**User's choice:** Yes, with clear warning

| Option | Description | Selected |
|--------|-------------|----------|
| Turn-based array | Array of {turnNumber, perspective, question, mcOptions[], userAnswer, ...} | ✓ |
| Raw message log | Array of {role, content, timestamp} | |
| You decide | Claude picks | |

**User's choice:** Turn-based array

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, per-turn model tracking | Each turn records model ID used | ✓ |
| No, project-level only | Model known from config | |
| You decide | Claude picks | |

**User's choice:** Yes, per-turn model tracking

---

## Multi-Perspective Panel

| Option | Description | Selected |
|--------|-------------|----------|
| Single call, multi-persona prompt | One LLM call with all 5 perspectives in system prompt | |
| Parallel calls per perspective | 5 separate LLM calls, one per perspective | ✓ |
| Sequential with voting | Each perspective sequential, then judge picks best | |
| You decide | Claude picks | |

**User's choice:** Parallel calls per perspective
**Notes:** Going for maximum cognitive diversity with 5 parallel calls.

| Option | Description | Selected |
|--------|-------------|----------|
| LLM ranker picks best one | Separate LLM call receives all 5, picks best question | ✓ |
| Show all 5 to user | User sees all 5 and picks which to answer | |
| Algorithmic selection | Round-robin or weight by ambiguity gap | |
| You decide | Claude picks | |

**User's choice:** LLM ranker picks best one

| Option | Description | Selected |
|--------|-------------|----------|
| Dynamic activation | Perspectives activate based on interview stage and scores | ✓ |
| All 5 every turn | Always run all 5 in parallel | |
| You decide | Claude picks | |

**User's choice:** Dynamic activation

| Option | Description | Selected |
|--------|-------------|----------|
| Ranker generates them | Same ranker call picks question + generates MC options | ✓ |
| Perspective generates them | Each perspective generates question with answers | |
| Separate MC generation call | Dedicated call after ranker picks question | |
| You decide | Claude picks | |

**User's choice:** Ranker generates them

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, show brief context | User sees perspective rationale for each question | ✓ |
| No, just the question | Clean, no rationale | |
| You decide | Claude picks | |

**User's choice:** Yes, show brief context

| Option | Description | Selected |
|--------|-------------|----------|
| Same model, different prompts | All perspectives use interview-stage model | |
| Cross-model perspectives | Different perspectives use different LLM models | ✓ |
| You decide | Claude picks | |

**User's choice:** Cross-model perspectives
**Notes:** Bold choice — cross-model diversity at interview level, not just holdout generation.

| Option | Description | Selected |
|--------|-------------|----------|
| Configurable per-perspective | perspectiveModels map in cauldron.config.ts | ✓ |
| Round-robin from available models | Auto-rotate through providers | |
| You decide | Claude picks | |

**User's choice:** Configurable per-perspective

| Option | Description | Selected |
|--------|-------------|----------|
| Interview-stage default | Ranker uses primary interview model | ✓ |
| Dedicated ranker model | Separate configurable model for ranker | |
| You decide | Claude picks | |

**User's choice:** Interview-stage default

| Option | Description | Selected |
|--------|-------------|----------|
| Store in transcript metadata | All 5 candidates stored alongside selected one | ✓ |
| Discard after selection | Only selected question persisted | |
| You decide | Claude picks | |

**User's choice:** Store in transcript metadata

---

## Ambiguity Scoring

| Option | Description | Selected |
|--------|-------------|----------|
| LLM with structured output + temp 0 | generateObject with Zod schema, near-deterministic | |
| Rule-based heuristics | Keyword matching, no LLM | |
| Hybrid: LLM + rule validation | LLM generates scores, rules validate bounds and anomalies | ✓ |
| You decide | Claude picks | |

**User's choice:** Hybrid: LLM + rule validation

| Option | Description | Selected |
|--------|-------------|----------|
| 4-dimension matrix | Brownfield adds context clarity (15%), rebalances others | ✓ |
| Same 3 dimensions + bonus | Keep greenfield dims, bonus modifier for codebase context | |
| You decide | Claude picks | |

**User's choice:** 4-dimension matrix

| Option | Description | Selected |
|--------|-------------|----------|
| Full breakdown visible | User sees per-dimension scores and composite | ✓ |
| Composite only | User sees single score | |
| You decide | Claude picks | |

**User's choice:** Full breakdown visible

| Option | Description | Selected |
|--------|-------------|----------|
| Interview-stage default | Same model as questions | |
| Fast/cheap model | Haiku/GPT-4o-mini class for speed | ✓ |
| You decide | Claude picks | |

**User's choice:** Fast/cheap model
**Notes:** Scoring is latency-sensitive — user waiting between turns.

| Option | Description | Selected |
|--------|-------------|----------|
| Bounds + monotonicity checks | [0,1] bounds, no >0.3 drops, monotonicity hint, retry on anomaly | ✓ |
| Minimal bounds only | Just [0,1] range validation | |
| You decide | Claude picks | |

**User's choice:** Bounds + monotonicity checks

| Option | Description | Selected |
|--------|-------------|----------|
| Full transcript | Scorer sees entire Q&A history | ✓ |
| Latest turn + score history | Only new Q&A pair plus previous scores | |
| You decide | Claude picks | |

**User's choice:** Full transcript

| Option | Description | Selected |
|--------|-------------|----------|
| Parallel: score + perspectives together | Scoring and next-turn perspectives fire simultaneously | ✓ |
| Sequential: score first, then perspectives | Score first, use updated scores for perspective activation | |
| You decide | Claude picks | |

**User's choice:** Parallel: score + perspectives together
**Notes:** Dynamic perspective activation for current turn uses previous turn's scores (already available). Fresh score feeds next turn's activation.

---

## Seed Crystallization

| Option | Description | Selected |
|--------|-------------|----------|
| LLM synthesis from transcript | Dedicated LLM call produces structured summary from full transcript | ✓ |
| Progressive accumulation | Summary built incrementally during interview | |
| You decide | Claude picks | |

**User's choice:** LLM synthesis from transcript

| Option | Description | Selected |
|--------|-------------|----------|
| Edit-then-approve | User sees editable summary, modifies any field, then approves | ✓ |
| Approve/reject only | Read-only summary, approve or reject with feedback | |
| Approve with inline comments | Comments on sections, system re-generates | |
| You decide | Claude picks | |

**User's choice:** Edit-then-approve

| Option | Description | Selected |
|--------|-------------|----------|
| Domain entity map | Structured JSON with entities, attributes, relationships | ✓ |
| Free-form domain description | Plain text domain model description | |
| You decide | Claude picks | |

**User's choice:** Domain entity map

| Option | Description | Selected |
|--------|-------------|----------|
| DB only | Seeds table is the seed, YAML generated on-demand for export | ✓ |
| DB + YAML file | Dual-write to DB and .yaml file | |
| You decide | Claude picks | |

**User's choice:** DB only

| Option | Description | Selected |
|--------|-------------|----------|
| Interview-stage default | Strongest model for this critical call | ✓ |
| Dedicated synthesis model | Separate configurable model | |
| You decide | Claude picks | |

**User's choice:** Interview-stage default

| Option | Description | Selected |
|--------|-------------|----------|
| Application-level guard | Service checks status, throws ImmutableSeedError | |
| DB trigger only | PostgreSQL BEFORE UPDATE trigger | |
| Both app + DB trigger | Belt and suspenders | ✓ |
| You decide | Claude picks | |

**User's choice:** Both app + DB trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Recursive CTE | WITH RECURSIVE walks parent_id chain (Phase 1 D-03 confirmed) | ✓ |
| Materialized lineage column | JSONB array of ancestor IDs on each seed | |
| You decide | Claude picks | |

**User's choice:** Recursive CTE

---

## Claude's Discretion

- Exact perspective system prompt content and structure
- Interview table indexing strategy
- FSM transition validation implementation details
- Zod schemas for scoring and synthesis structured output
- Event store event payloads for interview events
- Error types and error handling patterns
- DB trigger implementation details
- Perspective activation thresholds

## Deferred Ideas

None — discussion stayed within phase scope
