# Phase 2: LLM Gateway - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-25
**Phase:** 02-llm-gateway
**Areas discussed:** Gateway API surface, Model config & defaults, Failover strategy, Token tracking & cost

---

## Gateway API Surface

| Option | Description | Selected |
|--------|-------------|----------|
| Stage enum parameter | Callers pass typed enum ('interview' \| 'holdout' \| 'implementation' \| 'evaluation'). Gateway looks up model config. | ✓ |
| Model ID directly | Callers pass model ID. Flexible but loses stage abstraction. | |
| Stage + optional override | Stage enum AND optional model override. Maximum flexibility, more complex. | |

**User's choice:** Stage enum parameter
**Notes:** Clean separation — gateway owns routing, callers just declare intent.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Both explicitly | Two functions: streamText and generateText. Mirrors AI SDK. | ✓ |
| Streaming-only + collect | One streaming function; callers collect for non-streaming. | |
| Single function, mode param | One function with stream boolean. Hard to type safely. | |

**User's choice:** Both explicitly
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| packages/engine | Pipeline infrastructure. Engine owns workers + pipeline logic. | ✓ |
| packages/shared | Available to all packages but bloats shared with AI SDK deps. | |
| New packages/ai | Dedicated package. Clean but adds 5th package for one module. | |

**User's choice:** packages/engine
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, from the start | generateObject/streamObject with Zod. Interview, seed, evaluation need it. | ✓ |
| Text only for now | Simple but Phase 3 needs it immediately. | |
| You decide | Claude's discretion. | |

**User's choice:** Yes, from the start
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, pass-through | Accept optional tools/toolChoice, forward to AI SDK. | ✓ |
| No, defer to later | Keep gateway focused on text/object. | |
| You decide | Claude's discretion. | |

**User's choice:** Yes, pass-through
**Notes:** Needed for Phase 3 interview and Phase 5 decomposition agents.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Caller provides system prompt | Gateway is purely routing. Each stage owns its prompts. | |
| Stage-based auto-inject | Gateway prepends stage-specific preamble. Centralizes cross-cutting concerns. | ✓ |
| You decide | Claude's discretion. | |

**User's choice:** Stage-based auto-inject
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Gateway enforces at call time | Runtime rejection if holdout model matches implementer family. Hard enforcement. | ✓ |
| Config-level validation only | Validate at config time. Cheaper but bypassable via overrides. | |
| You decide | Claude's discretion. | |

**User's choice:** Gateway enforces at call time
**Notes:** None.

---

## Model Config & Defaults

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded in engine | TypeScript constant in gateway module. Version-controlled. | |
| Config file at project root | cauldron.config.ts or YAML. More visible to users. | ✓ |
| Database-seeded defaults | Config table. Editable at runtime. Adds DB dependency. | |

**User's choice:** Config file at project root
**Notes:** User preferred config file over hardcoded. TypeScript format selected in follow-up.

---

| Option | Description | Selected |
|--------|-------------|----------|
| DB project settings | JSONB column on projects or separate table. Persists, queryable. | ✓ |
| Project-level config file | Per-project config file. Hard to manage from web dashboard. | |
| Both DB + file | File overrides DB. Two sources of truth. | |

**User's choice:** DB project settings
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| TypeScript (cauldron.config.ts) | Type-safe, IDE autocomplete, standard TS ecosystem pattern. | ✓ |
| YAML | Simple, readable, loses type safety. | |
| JSON | No parser needed, no comments, verbose. | |

**User's choice:** TypeScript (cauldron.config.ts)
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Ordered fallback chain | Array of models per stage tried in order. Handles multi-provider outages. | ✓ |
| Primary + single fallback | Exactly primary and fallback fields. Covers common case. | |
| You decide | Claude's discretion. | |

**User's choice:** Ordered fallback chain
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Validate at startup | Ping each provider at init. Catches bad keys immediately. | ✓ |
| Lazy validation | Discover bad keys on first call. Faster startup. | |
| You decide | Claude's discretion. | |

**User's choice:** Validate at startup
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Environment variables | Standard: ANTHROPIC_API_KEY, etc. AI SDK reads by default. | ✓ |
| Config file + env fallback | Keys in config with env fallback. Risks committing secrets. | |
| You decide | Claude's discretion. | |

**User's choice:** Environment variables
**Notes:** None.

---

## Failover Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Rate limit (429) | Most common transient failure. | ✓ |
| Server error (5xx) | Provider issues. | ✓ |
| Timeout | Request hangs beyond deadline. | ✓ |
| Auth error (401/403) | Bad API key or permissions. | ✓ |

**User's choice:** All four triggers selected
**Notes:** Multi-select question.

---

| Option | Description | Selected |
|--------|-------------|----------|
| One retry with backoff, then failover | Try same provider once more with exponential backoff. | ✓ |
| Immediate failover | On any error, immediately try next provider. | |
| Configurable retries | Config specifies retry count per provider. | |
| You decide | Claude's discretion. | |

**User's choice:** One retry with backoff, then failover
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Event store + structured log | Write failover event to event store AND emit pino log. | ✓ |
| Structured log only | Just pino. Not queryable alongside pipeline events. | |
| You decide | Claude's discretion. | |

**User's choice:** Event store + structured log
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Throw with full context | Typed GatewayExhaustedError with all provider errors. Caller handles. | ✓ |
| Queue for delayed retry | Gateway holds request, retries after cooldown. Adds statefulness. | |
| You decide | Claude's discretion. | |

**User's choice:** Throw with full context
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, simple circuit breaker | After 3 consecutive failures, skip provider for cooldown. | ✓ |
| No, just linear chain | Always try in order. Simpler. | |
| You decide | Claude's discretion. | |

**User's choice:** Yes, simple circuit breaker
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, enforce during failover | Holdout failover skips same-family providers as implementer. | ✓ |
| No, allow any in emergency | Availability trumps diversity during failover. | |
| You decide | Claude's discretion. | |

**User's choice:** Yes, enforce during failover
**Notes:** Holdout integrity maintained even during degraded operation.

---

## Token Tracking & Cost

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated usage table | New llm_usage table. Queryable, aggregatable. | |
| Event store entries | Emit events with token data in JSONB. Harder aggregation. | |
| Both table + event | Usage table for queries, event for audit. | ✓ |
| You decide | Claude's discretion. | |

**User's choice:** Both table + event
**Notes:** Dual-write — each serves a different purpose.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Built-in price table | TypeScript map of model→price. Updated manually. | ✓ |
| External pricing API | Fetch from providers. Always current, adds dependency. | |
| Raw tokens only | No cost calculation. Simpler. | |
| You decide | Claude's discretion. | |

**User's choice:** Built-in price table
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, configurable budget | Per-project budget ceiling. Throws BudgetExceededError. Supports EVOL-12 early. | ✓ |
| No, defer to Phase 7 | EVOL-12 is Phase 7. Don't pre-implement. | |
| You decide | Claude's discretion. | |

**User's choice:** Yes, configurable budget
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Per-call with context tags | Every call records project_id, stage, model, bead_id, cycle, tokens, cost. | ✓ |
| Per-bead aggregates only | Roll up per bead. Loses call-level detail. | |
| You decide | Claude's discretion. | |

**User's choice:** Per-call with context tags
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Async fire-and-forget | Return response immediately, write usage asynchronously. | ✓ |
| Synchronous before return | Write before returning. Guarantees no data loss, adds latency. | |
| You decide | Claude's discretion. | |

**User's choice:** Async fire-and-forget
**Notes:** None.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Wrap stream, capture on finish | Hook into AI SDK onFinish callback. Transparent to callers. | ✓ |
| Caller reports usage back | Callers responsible for reporting. More flexible, error-prone. | |
| You decide | Claude's discretion. | |

**User's choice:** Wrap stream, capture on finish
**Notes:** None.

---

## Claude's Discretion

- Exact TypeScript type signatures for gateway functions
- Internal retry/backoff timing constants
- Circuit breaker window and cooldown durations
- llm_usage table indexing strategy
- Event type names for LLM events
- cauldron.config.ts schema shape and validation
- System prompt preamble content per stage
- Migration strategy for project settings

## Deferred Ideas

None — discussion stayed within phase scope
