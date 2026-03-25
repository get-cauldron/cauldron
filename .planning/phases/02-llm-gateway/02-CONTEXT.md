# Phase 2: LLM Gateway - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

A typed abstraction over Vercel AI SDK that routes LLM calls to the correct provider per pipeline stage, handles failover with circuit-breaking, tracks token costs at per-call granularity, and enforces cross-model diversity for holdout generation. Every pipeline stage calls the gateway through a single interface — no direct AI SDK usage outside the gateway.

</domain>

<decisions>
## Implementation Decisions

### Gateway API Surface
- **D-01:** Callers specify a typed stage enum (`'interview' | 'holdout' | 'implementation' | 'evaluation'`) — gateway looks up model config from the enum. No direct model ID passing.
- **D-02:** Two explicit functions: `gateway.streamText(...)` and `gateway.generateText(...)`, mirroring the Vercel AI SDK surface. Callers choose what they need.
- **D-03:** Structured object generation included from the start — `gateway.generateObject(...)` and `gateway.streamObject(...)` with Zod schema support. Interview scoring, seed crystallization, and evaluation rubrics all need this.
- **D-04:** Gateway lives in `packages/engine` alongside Inngest workers and pipeline logic. Keeps AI SDK dependency out of shared/api packages.
- **D-05:** Tool definitions supported as pass-through — gateway accepts optional `tools`/`toolChoice` params and forwards them to AI SDK without interpretation.
- **D-06:** Stage-based system prompt auto-injection — gateway can prepend a stage-specific preamble (safety guardrails, context budget). Callers provide additional system content on top.
- **D-07:** Cross-model diversity enforced at call time — when a holdout-stage call resolves to the same provider family as the project's implementer, the gateway rejects the call. Hard enforcement, impossible to bypass.

### Model Configuration & Defaults
- **D-08:** System-wide defaults defined in a TypeScript config file (`cauldron.config.ts`) at the project root. Type-safe with IDE autocomplete. Loaded at boot via dynamic import.
- **D-09:** Per-project model overrides stored in DB project settings (JSONB column or separate table). Persists across restarts, queryable. Overrides sit on top of config file defaults.
- **D-10:** Fallback chains are ordered arrays per stage, e.g., `{ interview: ['claude-sonnet-4-6', 'gpt-4o'] }`. First available provider wins during failover.
- **D-11:** API keys supplied via standard environment variables (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_KEY). Vercel AI SDK reads these by default. No custom key management.
- **D-12:** Gateway validates all configured provider API keys at startup — pings each with a minimal request. Catches missing/invalid keys before pipeline runs.

### Failover Strategy
- **D-13:** Failover triggered by: rate limit (429), server error (5xx), timeout (configurable deadline), and auth error (401/403).
- **D-14:** One retry with exponential backoff on the current provider before failing over to the next in the chain.
- **D-15:** Failover events recorded in both the event store (immutable audit trail) and pino structured logs. Fits the event sourcing pattern from Phase 1.
- **D-16:** When ALL providers in the fallback chain are exhausted, throw a typed `GatewayExhaustedError` with all attempted providers, errors, and timestamps. Caller (Inngest step) handles retry/escalation.
- **D-17:** Simple circuit breaker — after 3 consecutive failures from a provider within a time window, mark it 'open' and skip it for a cooldown period. Auto-resets after cooldown.
- **D-18:** Cross-model diversity rule enforced during failover — holdout-stage failover skips providers from the same family as the implementer. Availability never trumps holdout integrity.

### Token Tracking & Cost
- **D-19:** Token usage stored in BOTH a dedicated `llm_usage` table (fast queries/aggregation) AND as event store entries (audit trail). Dual-write, each serves a different purpose.
- **D-20:** `llm_usage` table schema: (id, project_id, bead_id?, evolution_cycle?, stage, model, prompt_tokens, completion_tokens, total_tokens, cost_cents, created_at).
- **D-21:** Per-call granularity with context tags — every LLM call records project_id, stage, model, bead_id (nullable), evolution_cycle (nullable). Aggregation to per-bead/per-cycle/per-project via SQL.
- **D-22:** Built-in price table — TypeScript map of model-to-price-per-token (input/output separately). Updated manually when prices change. No external pricing API dependency.
- **D-23:** Per-project configurable token budget with kill switch. Gateway checks cumulative cost before each call. Throws `BudgetExceededError` if over threshold. Supports EVOL-12 early.
- **D-24:** Token tracking is async fire-and-forget — gateway returns LLM response immediately, writes usage to DB asynchronously. Doesn't slow the hot path.
- **D-25:** For streaming responses, gateway wraps the AI SDK stream and hooks into `onFinish` callback to extract token usage. Transparent to callers — same stream interface.

### Claude's Discretion
- Exact TypeScript type signatures for gateway functions
- Internal retry/backoff timing constants
- Circuit breaker window and cooldown durations
- `llm_usage` table indexing strategy
- Event type names for LLM events (gateway_call_completed, gateway_failover, etc.)
- cauldron.config.ts schema shape and validation approach
- System prompt preamble content per stage
- How project settings table/column is added (migration strategy)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research
- `.planning/research/STACK.md` — Technology stack decisions: Vercel AI SDK 6, provider packages, specific versions
- `.planning/research/ARCHITECTURE.md` — Component boundaries, data flow, event sourcing patterns

### Requirements
- `.planning/REQUIREMENTS.md` §LLM-01 through §LLM-06 — All Phase 2 requirements with success criteria

### Phase 1 Context
- `.planning/phases/01-persistence-foundation/01-CONTEXT.md` — Schema decisions (D-01 through D-12) that this phase builds on

### Existing Code
- `packages/shared/src/db/schema/` — All Drizzle schema definitions (project, seed, bead, event, holdout, snapshot)
- `packages/shared/src/db/event-store.ts` — Event sourcing module for failover event recording
- `packages/engine/src/index.ts` — Engine entry point (currently empty — gateway goes here)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Event store** (`packages/shared/src/db/event-store.ts`): Append-only event log for recording failover events and LLM call completions
- **Drizzle schema patterns** (`packages/shared/src/db/schema/`): Established patterns for table definitions, enums, type exports. New `llm_usage` table follows the same conventions
- **Type exports** (`packages/shared/src/types/index.ts`): Pattern for re-exporting Drizzle-inferred types

### Established Patterns
- Schema definitions in `packages/shared`, consumed by other packages
- pgEnum for status/type enums (beadStatusEnum, beadEdgeTypeEnum, seedStatusEnum)
- UUID primary keys with `.defaultRandom()`
- Timestamp columns with `{ withTimezone: true }`
- No `updatedAt` on immutable entities (events, seeds)
- `.js` extensions on all relative TypeScript imports (Node16 moduleResolution)

### Integration Points
- New `llm_usage` table added to `packages/shared/src/db/schema/` with Drizzle migration
- Gateway module created in `packages/engine/src/gateway/` or similar
- Event store receives new event types for LLM calls and failovers
- Project settings (for per-project overrides) either extends `projects` table or adds new table

</code_context>

<specifics>
## Specific Ideas

- Vercel AI SDK v6 `streamText`/`generateText`/`streamObject`/`generateObject` are the underlying primitives — gateway wraps them, doesn't reimplement
- `onFinish` callback on AI SDK streams provides token usage data natively
- Provider packages: `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google` — each independently versioned
- Config file follows ecosystem conventions: `cauldron.config.ts` similar to `next.config.ts`, `vitest.config.ts`
- Budget check must query cumulative cost before the LLM call, not after — prevents overshoot

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-llm-gateway*
*Context gathered: 2026-03-25*
