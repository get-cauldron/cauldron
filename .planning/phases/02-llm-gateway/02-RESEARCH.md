# Phase 02: LLM Gateway - Research

**Researched:** 2026-03-25
**Domain:** Vercel AI SDK multi-provider gateway with failover, token tracking, and cross-model diversity enforcement
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Gateway API Surface
- **D-01:** Callers specify a typed stage enum (`'interview' | 'holdout' | 'implementation' | 'evaluation'`) — gateway looks up model config from the enum. No direct model ID passing.
- **D-02:** Two explicit functions: `gateway.streamText(...)` and `gateway.generateText(...)`, mirroring the Vercel AI SDK surface.
- **D-03:** Structured object generation included from the start — `gateway.generateObject(...)` and `gateway.streamObject(...)` with Zod schema support.
- **D-04:** Gateway lives in `packages/engine` alongside Inngest workers and pipeline logic.
- **D-05:** Tool definitions supported as pass-through — gateway accepts optional `tools`/`toolChoice` params and forwards them to AI SDK without interpretation.
- **D-06:** Stage-based system prompt auto-injection — gateway prepends stage-specific preamble. Callers provide additional system content on top.
- **D-07:** Cross-model diversity enforced at call time — holdout-stage call that resolves to same provider family as implementer is rejected. Hard enforcement.

#### Model Configuration & Defaults
- **D-08:** System-wide defaults in `cauldron.config.ts` at project root. Type-safe, loaded at boot via dynamic import.
- **D-09:** Per-project model overrides stored in DB project settings (JSONB column or separate table). Persists across restarts.
- **D-10:** Fallback chains are ordered arrays per stage: `{ interview: ['claude-sonnet-4-6', 'gpt-4o'] }`.
- **D-11:** API keys via standard env vars (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_KEY). AI SDK reads these by default.
- **D-12:** Gateway validates all configured provider API keys at startup — pings each with minimal request.

#### Failover Strategy
- **D-13:** Failover triggered by: 429, 5xx, timeout, 401/403.
- **D-14:** One retry with exponential backoff on current provider before failing over to next in chain.
- **D-15:** Failover events recorded in event store AND pino structured logs.
- **D-16:** When all providers exhausted, throw typed `GatewayExhaustedError` with all attempts.
- **D-17:** Simple circuit breaker — 3 consecutive failures within window marks provider 'open', auto-resets after cooldown.
- **D-18:** Cross-model diversity during failover — holdout-stage failover skips providers from same family as implementer.

#### Token Tracking & Cost
- **D-19:** Token usage dual-write: `llm_usage` table (queries) AND event store (audit trail).
- **D-20:** `llm_usage` table schema: (id, project_id, bead_id?, evolution_cycle?, stage, model, prompt_tokens, completion_tokens, total_tokens, cost_cents, created_at).
- **D-21:** Per-call granularity with context tags (project_id, stage, model, bead_id nullable, evolution_cycle nullable).
- **D-22:** Built-in price table — TypeScript map of model-to-price-per-token (input/output separately). No external pricing API.
- **D-23:** Per-project configurable token budget with kill switch. Throws `BudgetExceededError` if over threshold.
- **D-24:** Token tracking is async fire-and-forget — gateway returns LLM response immediately, writes usage asynchronously.
- **D-25:** For streaming, gateway hooks into `onFinish` callback to extract token usage. Transparent to callers.

### Claude's Discretion
- Exact TypeScript type signatures for gateway functions
- Internal retry/backoff timing constants
- Circuit breaker window and cooldown durations
- `llm_usage` table indexing strategy
- Event type names for LLM events (gateway_call_completed, gateway_failover, etc.)
- cauldron.config.ts schema shape and validation approach
- System prompt preamble content per stage
- How project settings table/column is added (migration strategy)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LLM-01 | Vercel AI SDK integrated as unified multi-provider interface (Anthropic, OpenAI, Google at minimum) | Provider instantiation patterns documented; `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google` all verified |
| LLM-02 | Default model assignments per pipeline stage (interview, holdout, implementation, evaluation) | Stage enum + config file pattern; D-08 and D-10 define the mechanism |
| LLM-03 | Per-project model configuration overrides stored in project settings | DB JSONB override column on projects table; overrides merge onto config-file defaults at call time |
| LLM-04 | Provider failover: if primary provider fails, fall back to secondary for same pipeline stage | `AI_APICallError.statusCode` and `isRetryable` enable detection; ordered fallback chain (D-10); circuit breaker (D-17) |
| LLM-05 | Token usage tracking per bead, per evolution cycle, and per project (cost visibility) | `onFinish` callback provides `usage.inputTokens` / `usage.outputTokens`; dual-write to `llm_usage` and event store |
| LLM-06 | Cross-model diversity enforced: holdout generator must use different provider than implementer | Provider family map (e.g., `anthropic` / `openai` / `google`); pre-call check rejects same-family holdout calls; also applied during failover (D-18) |
</phase_requirements>

---

## Summary

Phase 2 builds the single mandatory entry point for all LLM calls in the Cauldron pipeline. Every downstream phase (interview, holdout generation, bead execution, evaluation) calls through this gateway — no raw AI SDK calls outside it. The gateway wraps Vercel AI SDK v6's four core functions (`streamText`, `generateText`, `streamObject`, `generateObject`), adding a routing layer that selects the correct provider and model from a stage enum, applies system prompt injection, enforces cross-model diversity, handles failover with circuit breaking, tracks token costs asynchronously, and enforces project-level budget limits.

The technical foundations are solid. Vercel AI SDK v6 provides native `onFinish` callbacks with `usage.inputTokens` / `usage.outputTokens` on all four call types. The `AI_APICallError` class exposes `statusCode` and `isRetryable` — enough to classify 429/5xx/401 and route failover decisions. Provider packages (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`) are independently versioned and all follow the same instantiation pattern.

The two areas requiring careful design are (1) the circuit breaker state, which must survive within the engine process lifetime but does not need DB persistence (in-memory map is sufficient for v1), and (2) async fire-and-forget token writes — the gateway must not await DB writes on the hot path, but must handle write failures gracefully (log, do not throw).

**Primary recommendation:** Build the gateway as a class (`LLMGateway`) constructed with a `DbClient`, a resolved config (merged system defaults + project overrides), and a logger. The four public methods directly parallel AI SDK's four functions, keeping the mental model simple for callers.

---

## Standard Stack

### Core (already decided, versions locked in CLAUDE.md)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | 6.0.138 | Core AI SDK — `streamText`, `generateText`, `streamObject`, `generateObject` | Project constraint; v6 is current major; native TypeScript, `onFinish` token usage |
| `@ai-sdk/anthropic` | 3.0.64 | Anthropic provider | Claude models; cross-model diversity primary |
| `@ai-sdk/openai` | 3.0.48 | OpenAI provider | GPT-4o for holdout; interview fallback |
| `@ai-sdk/google` | 3.0.53 | Google provider | Gemini for evaluation; tertiary holdout |
| `zod` | 4.3.6 | Schema validation for `generateObject`/`streamObject`; config file validation | Already in `packages/shared` |
| `pino` | 10.3.1 | Structured logging for failover events | Project constraint |
| `drizzle-orm` | 0.45.1 | `llm_usage` table writes; project settings reads | Already in `packages/shared` |

### New dependencies needed in `packages/engine`

```bash
# Add to packages/engine
pnpm add ai @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google pino
```

`zod` and `drizzle-orm` come via `@cauldron/shared` workspace dependency already present.

### Version Verification

Versions above taken from CLAUDE.md / STACK.md which were npm-verified on 2026-03-25. No re-verification needed — they are already the project's locked versions.

---

## Architecture Patterns

### Recommended Module Structure

```
packages/engine/src/
├── gateway/
│   ├── index.ts             # Public exports: LLMGateway class, types, errors
│   ├── gateway.ts           # LLMGateway class implementation
│   ├── config.ts            # cauldron.config.ts loader + default config type
│   ├── providers.ts         # Provider factory (anthropic/openai/google instantiation)
│   ├── circuit-breaker.ts   # In-memory circuit breaker state
│   ├── failover.ts          # Retry + failover orchestration logic
│   ├── pricing.ts           # Price table (model → input/output cost per token)
│   ├── diversity.ts         # Cross-model diversity enforcement
│   └── errors.ts            # GatewayExhaustedError, BudgetExceededError
├── inngest/                 # (existing — from Phase 1 decisions)
└── index.ts                 # Re-exports LLMGateway
```

### Pattern 1: Provider Instantiation and Family Mapping

**What:** Each of the three AI SDK providers has an identical instantiation pattern. The gateway needs a `PROVIDER_FAMILY` map to enforce cross-model diversity.

**Source:** Official `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google` docs (HIGH confidence)

```typescript
// Source: ai-sdk.dev/providers/ai-sdk-providers/anthropic
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

// Or custom instances (used when baseURL override needed):
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

// Provider family map — used for cross-model diversity checks (D-07, D-18)
export type ProviderFamily = 'anthropic' | 'openai' | 'google';

export const MODEL_FAMILY_MAP: Record<string, ProviderFamily> = {
  'claude-sonnet-4-6': 'anthropic',
  'claude-opus-4-5': 'anthropic',
  'claude-haiku-4-5': 'anthropic',
  'gpt-4o': 'openai',
  'gpt-4o-mini': 'openai',
  'gpt-4.1': 'openai',
  'gemini-2.5-pro': 'google',
  'gemini-2.5-flash': 'google',
  'gemini-2.0-flash': 'google',
};

// Derive a LanguageModel instance from a model ID string
export function resolveModel(modelId: string) {
  const family = MODEL_FAMILY_MAP[modelId];
  if (!family) throw new Error(`Unknown model: ${modelId}`);
  if (family === 'anthropic') return anthropic(modelId);
  if (family === 'openai') return openai(modelId);
  if (family === 'google') return google(modelId);
  throw new Error(`Unsupported family: ${family}`);
}
```

### Pattern 2: Token Usage via `onFinish` Callback

**What:** All four AI SDK call types expose `onFinish`. For streaming responses, `onFinish` fires after the stream closes — this is the only way to get final token counts from a stream without awaiting the full response first.

**Source:** ai-sdk.dev/docs/reference/ai-sdk-core/stream-text (HIGH confidence)

```typescript
// Source: ai-sdk.dev/cookbook/node/stream-object-record-token-usage
import { streamText } from 'ai';
import type { LanguageModelUsage } from 'ai';

const result = streamText({
  model: resolvedModel,
  messages,
  onFinish({ usage }: { usage: LanguageModelUsage }) {
    // usage.inputTokens, usage.outputTokens, usage.totalTokens
    // Fire-and-forget — do NOT await this
    void recordUsage(db, { projectId, stage, modelId, usage, beadId, evolutionCycle });
  },
});

// Return stream to caller immediately — onFinish handles usage asynchronously
return result;
```

**Critical detail:** For `generateText` (non-streaming), the usage is available on the returned object directly:

```typescript
const { text, usage } = await generateText({ model, messages });
// usage.inputTokens, usage.outputTokens available immediately
// Still write async — don't block the return
void recordUsage(db, { usage });
return text;
```

### Pattern 3: Error Classification for Failover

**What:** `AI_APICallError` is the class to inspect for provider errors. Its `statusCode` and `isRetryable` properties drive failover decisions.

**Source:** ai-sdk.dev/docs/reference/ai-sdk-errors/ai-api-call-error (HIGH confidence)

```typescript
import { APICallError } from 'ai';

function classifyError(error: unknown): 'rate_limit' | 'server_error' | 'auth_error' | 'timeout' | 'other' {
  if (!APICallError.isInstance(error)) return 'other';

  const status = error.statusCode;
  if (status === 429) return 'rate_limit';
  if (status === 401 || status === 403) return 'auth_error';
  if (status !== undefined && status >= 500) return 'server_error';
  return 'other';
}

// Failover trigger conditions (D-13)
function shouldFailover(error: unknown): boolean {
  const kind = classifyError(error);
  return kind === 'rate_limit' || kind === 'server_error' || kind === 'timeout';
}

// Auth errors are NOT retried — they indicate config problems
function isHardFailure(error: unknown): boolean {
  return classifyError(error) === 'auth_error';
}
```

**Important caveat:** The AI SDK's built-in `maxRetries` (default: 2) fires BEFORE the gateway ever sees an error. Set `maxRetries: 0` on all AI SDK calls inside the gateway — the gateway owns the retry/failover logic entirely. Do not let the SDK and the gateway both retry independently.

### Pattern 4: Circuit Breaker (In-Memory)

**What:** Simple in-memory state machine per provider. Three states: CLOSED (normal), OPEN (skip this provider), HALF_OPEN (probe with next call). No DB persistence needed — circuit state is ephemeral within a process restart.

```typescript
// Source: Standard circuit breaker pattern (Claude's discretion for constants)
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface ProviderCircuit {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: number;
  openedAt: number | null;
}

const FAILURE_THRESHOLD = 3;       // D-17: 3 consecutive failures
const COOLDOWN_MS = 60_000;        // 60s cooldown (Claude's discretion)
const WINDOW_MS = 120_000;         // 2-min window for failure counting (Claude's discretion)

// Keyed by provider family
const circuits = new Map<ProviderFamily, ProviderCircuit>();

function isCircuitOpen(provider: ProviderFamily): boolean {
  const circuit = circuits.get(provider);
  if (!circuit || circuit.state === 'CLOSED') return false;
  if (circuit.state === 'OPEN') {
    // Auto-reset after cooldown
    if (Date.now() - circuit.openedAt! > COOLDOWN_MS) {
      circuit.state = 'HALF_OPEN';
      return false;
    }
    return true;
  }
  return false; // HALF_OPEN: allow probe
}

function recordFailure(provider: ProviderFamily): void {
  const circuit = circuits.get(provider) ?? { state: 'CLOSED', failureCount: 0, lastFailureAt: 0, openedAt: null };
  circuit.failureCount++;
  circuit.lastFailureAt = Date.now();
  if (circuit.failureCount >= FAILURE_THRESHOLD) {
    circuit.state = 'OPEN';
    circuit.openedAt = Date.now();
  }
  circuits.set(provider, circuit);
}

function recordSuccess(provider: ProviderFamily): void {
  circuits.set(provider, { state: 'CLOSED', failureCount: 0, lastFailureAt: 0, openedAt: null });
}
```

### Pattern 5: Cross-Model Diversity Enforcement

**What:** Before any holdout-stage call, check that the resolved provider family differs from the implementer's configured family. Reject if same.

```typescript
// Source: CONTEXT.md D-07, D-18
function enforceHoldoutDiversity(
  holdoutModelId: string,
  implementerModelId: string
): void {
  const holdoutFamily = MODEL_FAMILY_MAP[holdoutModelId];
  const implementerFamily = MODEL_FAMILY_MAP[implementerModelId];

  if (holdoutFamily === implementerFamily) {
    throw new Error(
      `Cross-model diversity violation: holdout model '${holdoutModelId}' ` +
      `and implementer model '${implementerModelId}' are both '${holdoutFamily}'. ` +
      `Use a different provider family for holdout generation.`
    );
  }
}
```

**During failover:** When stepping through the fallback chain for a holdout-stage call, skip any model in the same family as the implementer. If the entire remaining chain is same-family, throw `GatewayExhaustedError` — holdout integrity is non-negotiable (D-18).

### Pattern 6: Config File Pattern

**What:** `cauldron.config.ts` at project root, loaded once at gateway construction via dynamic import. Follows same pattern as `next.config.ts`, `vitest.config.ts`.

```typescript
// cauldron.config.ts (project root) — type-safe with IDE autocomplete
import { defineConfig } from '@cauldron/engine/gateway';

export default defineConfig({
  models: {
    interview: ['claude-sonnet-4-6', 'gpt-4o'],      // primary + fallback(s)
    holdout: ['gpt-4o', 'gemini-2.5-pro'],            // must differ from implementation family
    implementation: ['claude-sonnet-4-6', 'gpt-4.1'],
    evaluation: ['gemini-2.5-pro', 'claude-sonnet-4-6'],
  },
  budget: {
    defaultLimitCents: 500,   // $5 default project budget (Claude's discretion)
  },
});

// packages/engine/src/gateway/config.ts
export interface GatewayConfig {
  models: Record<PipelineStage, string[]>;  // ordered fallback chain per stage
  budget: { defaultLimitCents: number };
}

export function defineConfig(config: GatewayConfig): GatewayConfig {
  return config;  // identity function — gives IDE autocomplete with the type
}

// Load at gateway construction
export async function loadConfig(projectRoot: string): Promise<GatewayConfig> {
  const configPath = path.join(projectRoot, 'cauldron.config.ts');
  const mod = await import(configPath);
  return mod.default as GatewayConfig;
}
```

**Zod validation of config:** Use Zod to validate the loaded config at startup. Prevents silent misconfigurations.

### Pattern 7: Project Settings Override (DB Layer)

**What:** Per-project model overrides (D-09) stored in DB and merged on top of config-file defaults at call time. The `projects` table currently has no settings column — this phase adds it via migration.

**Migration strategy (Claude's discretion):** Add a `settings` JSONB column to `projects` table (nullable, defaults to `{}`). Simpler than a separate `project_settings` table for v1. Upgrade to separate table in v2 if settings become complex.

```typescript
// packages/shared/src/db/schema/project.ts (extended)
export const projects = pgTable('projects', {
  // ... existing columns ...
  settings: jsonb('settings').$type<ProjectSettings>().default({}),
});

export interface ProjectSettings {
  models?: Partial<Record<PipelineStage, string[]>>;  // per-stage overrides
  budgetLimitCents?: number;                           // project-specific budget cap
}
```

### Pattern 8: `llm_usage` Table Schema

**What:** New table in `packages/shared/src/db/schema/` following existing conventions. D-20 defines the columns exactly.

```typescript
// packages/shared/src/db/schema/llm-usage.ts
import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { projects } from './project.js';
import { beads } from './bead.js';

export const llmUsage = pgTable('llm_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  beadId: uuid('bead_id').references(() => beads.id),       // nullable — D-20
  evolutionCycle: integer('evolution_cycle'),                 // nullable — D-20
  stage: text('stage').notNull(),                            // 'interview' | 'holdout' | 'implementation' | 'evaluation'
  model: text('model').notNull(),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  totalTokens: integer('total_tokens').notNull(),
  costCents: integer('cost_cents').notNull(),                 // store as integer cents — avoids float precision issues
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // NO updatedAt — this table is append-only (same convention as events)
});

export type LlmUsage = typeof llmUsage.$inferSelect;
export type NewLlmUsage = typeof llmUsage.$inferInsert;
```

**Indexing strategy (Claude's discretion):** Three indexes cover all query patterns from requirements:
1. `(project_id, created_at DESC)` — per-project cost rollup
2. `(bead_id)` — per-bead cost (LLM-05)
3. `(project_id, evolution_cycle)` — per-cycle cost (LLM-05)

### Pattern 9: Event Types for Gateway Events

**What:** Extend the existing `eventTypeEnum` in `packages/shared/src/db/schema/event.ts` via Drizzle migration. New event types needed for LLM audit trail (D-15, D-19).

**New event types to add (Claude's discretion for names):**
- `gateway_call_completed` — every successful LLM call; payload: { stage, model, promptTokens, completionTokens, costCents }
- `gateway_failover` — every provider switch; payload: { stage, fromModel, toModel, reason, attemptNumber }
- `gateway_exhausted` — all providers failed; payload: { stage, attempts: [] }
- `budget_exceeded` — project budget limit hit; payload: { projectId, limitCents, currentCents }

**Migration:** Add new enum values to `event_type` PostgreSQL enum via `ALTER TYPE event_type ADD VALUE '...'`. Drizzle Kit handles this via `drizzle-kit generate`.

### Pattern 10: Startup API Key Validation (D-12)

**What:** At gateway construction, ping each configured provider with a minimal request to catch missing/invalid keys early.

```typescript
async function validateProviderKey(provider: ProviderFamily): Promise<void> {
  try {
    // Use generateText with maxTokens: 1 — cheapest possible validation ping
    await generateText({
      model: resolveModel(getDefaultModelForProvider(provider)),
      prompt: 'ping',
      maxOutputTokens: 1,
      maxRetries: 0,
    });
  } catch (error) {
    if (APICallError.isInstance(error) && (error.statusCode === 401 || error.statusCode === 403)) {
      throw new Error(`Provider '${provider}' has invalid API key: ${error.message}`);
    }
    // Other errors (network, rate limit) — key might be valid, don't block startup
  }
}
```

**Tradeoff:** This costs a small number of tokens per startup. D-12 explicitly accepts this. Only ping providers that are actually configured in the model chains.

### Anti-Patterns to Avoid

- **Do not use AI SDK's built-in `maxRetries` inside the gateway:** Set `maxRetries: 0` on all gateway-internal AI SDK calls. The gateway owns retry/failover logic. Double-retrying wastes tokens and delays failover.
- **Do not await token writes on the hot path:** `void recordUsage(...)` is correct. If the DB write fails, log it and continue — never throw from a token write failure.
- **Do not call AI SDK directly from any other package:** Gateway is the single entry point. All other packages must depend on `@cauldron/engine` and call through `LLMGateway`.
- **Do not persist circuit breaker state to DB:** In-memory is intentional. Circuit state is per-process and should reset on restart (fresh provider health assessment).
- **Do not share the `LLMGateway` instance across multiple Inngest functions with different project IDs:** The gateway holds per-project config. Either construct per-call (if cheap enough) or implement a factory pattern that caches by project ID.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-provider model interface | Custom HTTP clients per provider | `ai` + `@ai-sdk/*` packages | Auth, streaming, tool calls, token usage all handled |
| Streaming token counts | Custom byte-counting or post-hoc estimation | `onFinish` callback from AI SDK | Native, accurate, per-provider normalization |
| Provider error classification | String-matching error messages | `APICallError.isInstance()` + `statusCode` | Official typed errors, stable across SDK versions |
| Structured output with schema | Custom JSON prompting + validation | `generateObject`/`streamObject` with Zod schema | AI SDK handles constrained decoding mode selection per provider |
| Retry with backoff | Custom retry loop | AI SDK `maxRetries` — OR — gateway-owned loop | But note: disable SDK retries inside gateway, build gateway loop with failover |

**Key insight:** The AI SDK's abstraction layer over provider differences (streaming formats, tool call syntax, auth headers) is substantial. A custom implementation would need to re-implement all of this for each provider.

---

## Common Pitfalls

### Pitfall 1: Double Retry (AI SDK + Gateway)

**What goes wrong:** AI SDK's `maxRetries` defaults to 2. If the gateway also retries, a single 429 can cause 3×2 = 6 requests before the gateway sees an error.
**Why it happens:** AI SDK retries are transparent — the gateway never observes them unless it sets `maxRetries: 0`.
**How to avoid:** Always pass `maxRetries: 0` in every AI SDK call inside the gateway.
**Warning signs:** Failover logs show excessive delays; rate limits seem to last longer than expected.

### Pitfall 2: Token Counts Missing or NaN for Some Providers

**What goes wrong:** Some providers don't return token usage in the same format. The `usage` object may have `undefined` fields or report `NaN`.
**Why it happens:** Provider-level inconsistency; some streaming responses don't include usage until stream close.
**How to avoid:** In `recordUsage`, guard: `const promptTokens = usage.inputTokens ?? 0`. Never store NaN — validate before insert.
**Warning signs:** `llm_usage` records with `prompt_tokens = 0` for providers known to have tokens.

### Pitfall 3: Cross-Model Diversity Check Bypassed During Failover

**What goes wrong:** Failover logic steps through the chain without diversity check, eventually landing on a same-family provider for holdout generation.
**Why it happens:** Diversity check only at initial call, not re-checked per failover step.
**How to avoid:** The diversity filter runs on the entire fallback chain before execution: filter out same-family models first, then attempt remaining chain in order.
**Warning signs:** Holdout test quality degrades; same-family models being used for both implementation and holdout.

### Pitfall 4: Budget Check After Call (Overshoot)

**What goes wrong:** Project spends more than budget limit because check happens after the call completes.
**Why it happens:** Token counts are only known post-call; checking pre-call requires estimating.
**How to avoid:** Per CONTEXT.md specifics: "Budget check must query cumulative cost before the LLM call, not after — prevents overshoot." Use current total from `llm_usage` table before calling. Accept minor overshoot on concurrent calls (race condition is bounded, not catastrophic).
**Warning signs:** Projects consistently 5-10% over budget limit.

### Pitfall 5: Config File Hot-Loading Causes Stale Config

**What goes wrong:** `cauldron.config.ts` is loaded once at gateway construction but project settings in DB change. Gateway serves stale per-project overrides.
**Why it happens:** Config loaded once; DB settings not re-read per call.
**How to avoid:** Config file (system-wide defaults) — load once at boot. Per-project DB overrides — read per call from DB (cheap indexed query). Merge at call time.
**Warning signs:** Model override changes in DB don't take effect without restart.

### Pitfall 6: `streamObject` Usage Not Available Until Stream Consumed

**What goes wrong:** `streamObject` returns a stream; token usage only materializes in `onFinish`, but the gateway returns the stream to the caller before `onFinish` fires.
**Why it happens:** Async streaming — usage isn't known until stream closes.
**How to avoid:** This is by design (D-25). The `onFinish` callback correctly captures usage after stream closes. The caller gets the stream handle immediately. Do NOT block the return waiting for usage.
**Warning signs:** Token writes always show 0 tokens for streaming calls.

---

## Code Examples

### Full Gateway Call Flow (streamText)

```typescript
// Source: ai-sdk.dev + CONTEXT.md patterns
import { streamText, APICallError } from 'ai';
import type { LanguageModelUsage } from 'ai';

async function gatewayStreamText(
  params: GatewayStreamTextParams
): Promise<ReturnType<typeof streamText>> {
  const { stage, projectId, beadId, messages, tools, toolChoice } = params;

  // 1. Resolve model chain (config defaults + project overrides)
  const modelChain = await resolveModelChain(stage, projectId);

  // 2. Cross-model diversity check for holdout stage
  if (stage === 'holdout') {
    const implementerModel = await resolveModelChain('implementation', projectId);
    enforceHoldoutDiversity(modelChain[0]!, implementerModel[0]!);
  }

  // 3. Budget pre-check
  await checkBudget(projectId);

  // 4. Attempt with failover
  return attemptWithFailover(modelChain, stage, async (modelId) => {
    const model = resolveModel(modelId);
    const systemPrompt = buildSystemPrompt(stage, params.system);

    return streamText({
      model,
      system: systemPrompt,
      messages,
      tools,
      toolChoice,
      maxRetries: 0,  // Gateway owns retry — never let SDK retry independently
      onFinish({ usage }: { usage: LanguageModelUsage }) {
        void writeUsage(db, { projectId, beadId, stage, modelId, usage });
        void appendEvent(db, {
          projectId,
          type: 'gateway_call_completed',
          payload: { stage, model: modelId, ...usage },
        });
      },
    });
  });
}
```

### Failover Orchestration

```typescript
async function attemptWithFailover<T>(
  modelChain: string[],
  stage: PipelineStage,
  caller: (modelId: string) => Promise<T>
): Promise<T> {
  const attempts: FailoverAttempt[] = [];

  for (const modelId of modelChain) {
    const family = MODEL_FAMILY_MAP[modelId]!;

    // Skip circuit-open providers
    if (isCircuitOpen(family)) {
      logger.warn({ provider: family, modelId }, 'Circuit open, skipping');
      continue;
    }

    try {
      const result = await caller(modelId);
      recordSuccess(family);
      return result;
    } catch (error) {
      recordFailure(family);
      const attempt: FailoverAttempt = {
        modelId,
        error: error as Error,
        timestamp: new Date(),
      };
      attempts.push(attempt);

      if (isHardFailure(error)) {
        // Auth error — don't retry, surface immediately
        throw error;
      }

      if (shouldFailover(error) && attempts.length < modelChain.length) {
        // Log failover event
        logger.warn({ from: modelId, stage, reason: classifyError(error) }, 'Gateway failover');
        void appendEvent(db, {
          projectId: currentProjectId,
          type: 'gateway_failover',
          payload: { stage, fromModel: modelId, reason: classifyError(error) },
        });
        continue; // try next in chain
      }

      throw error; // non-retryable error and no next provider
    }
  }

  throw new GatewayExhaustedError(stage, attempts);
}
```

### Custom Error Classes

```typescript
// packages/engine/src/gateway/errors.ts
export class GatewayExhaustedError extends Error {
  constructor(
    public readonly stage: PipelineStage,
    public readonly attempts: FailoverAttempt[]
  ) {
    super(
      `All providers exhausted for stage '${stage}' after ${attempts.length} attempts: ` +
      attempts.map(a => `${a.modelId} (${a.error.message})`).join(', ')
    );
    this.name = 'GatewayExhaustedError';
  }
}

export class BudgetExceededError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly limitCents: number,
    public readonly currentCents: number
  ) {
    super(`Project '${projectId}' budget exceeded: ${currentCents}¢ of ${limitCents}¢ limit`);
    this.name = 'BudgetExceededError';
  }
}
```

### Price Table

```typescript
// packages/engine/src/gateway/pricing.ts
// Prices in USD per 1M tokens; multiply by tokens/1_000_000 then convert to cents
export const PRICE_TABLE: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  // Anthropic (as of 2026-03 — update manually when prices change)
  'claude-sonnet-4-6': { inputPerMTok: 3.00, outputPerMTok: 15.00 },
  'claude-opus-4-5': { inputPerMTok: 15.00, outputPerMTok: 75.00 },
  'claude-haiku-4-5': { inputPerMTok: 0.80, outputPerMTok: 4.00 },
  // OpenAI
  'gpt-4o': { inputPerMTok: 2.50, outputPerMTok: 10.00 },
  'gpt-4o-mini': { inputPerMTok: 0.15, outputPerMTok: 0.60 },
  'gpt-4.1': { inputPerMTok: 2.00, outputPerMTok: 8.00 },
  // Google
  'gemini-2.5-pro': { inputPerMTok: 1.25, outputPerMTok: 10.00 },
  'gemini-2.5-flash': { inputPerMTok: 0.075, outputPerMTok: 0.30 },
  'gemini-2.0-flash': { inputPerMTok: 0.10, outputPerMTok: 0.40 },
};

export function calculateCostCents(modelId: string, inputTokens: number, outputTokens: number): number {
  const price = PRICE_TABLE[modelId];
  if (!price) return 0; // unknown model — record 0, don't fail
  const inputCost = (inputTokens / 1_000_000) * price.inputPerMTok;
  const outputCost = (outputTokens / 1_000_000) * price.outputPerMTok;
  return Math.ceil((inputCost + outputCost) * 100); // convert dollars to cents, round up
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `generateObject` as separate function | `output: Output.object({ schema })` param on `generateText`/`streamText` | AI SDK 5+ | `generateObject` still exists but `Output.*` is the v6 preferred pattern |
| `promptTokens` / `completionTokens` | `inputTokens` / `outputTokens` | AI SDK 5 rename | v6 uses the new names; old names may still work via aliases but use new names |
| Manual retry loops | `maxRetries` param | AI SDK 3+ | Built-in; set to 0 when gateway manages retries |
| Provider-specific streaming formats | Unified `StreamTextResult` | AI SDK 2+ | All providers return same TypeScript types via SDK abstraction |

**Deprecated/outdated:**
- `promptTokens` / `completionTokens` field names: Renamed to `inputTokens` / `outputTokens` in AI SDK 5. Code in old tutorials may still use old names — always use new names in this codebase.
- `react-hook-form` for AI SDK streaming: Not relevant here (backend-only gateway).

---

## Open Questions

1. **AI SDK `streamObject` token availability timing**
   - What we know: `onFinish` fires after stream closes and provides `usage`
   - What's unclear: Whether `usage` is populated for all three providers when streaming objects (Google Gemini's structured output mode may differ)
   - Recommendation: Implement with guard (`usage.inputTokens ?? 0`) and add a test that verifies usage is non-zero for each provider integration test

2. **`cauldron.config.ts` dynamic import in ESM context**
   - What we know: `packages/engine` is `"type": "module"` (ESM). Dynamic `import()` works in ESM.
   - What's unclear: Whether `tsx` (the runtime) handles `.ts` file dynamic imports cleanly when invoked at runtime vs build time
   - Recommendation: In production, the config should be compiled. For dev, `tsx` handles dynamic import of `.ts` files. Test this explicitly in Wave 0.

3. **Project settings migration approach**
   - What we know: Adding `settings JSONB` column to `projects` is the chosen approach
   - What's unclear: Whether Drizzle Kit generates `ALTER TABLE ADD COLUMN` cleanly for JSONB with default `'{}'::jsonb`
   - Recommendation: Test migration on the test DB before implementation. Use `.default({})` in Drizzle schema (maps to `'{}'::jsonb` in Postgres).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | (project already running) | — |
| PostgreSQL (test on 5433) | Integration tests for `llm_usage` writes | ✓ | (Phase 1 Docker Compose) | — |
| ANTHROPIC_API_KEY | D-12 startup validation, integration tests | Needs verification | — | Skip provider ping in test env via `SKIP_PROVIDER_VALIDATION=true` |
| OPENAI_API_KEY | D-12 startup validation, integration tests | Needs verification | — | Same |
| GOOGLE_GENERATIVE_AI_KEY | D-12 startup validation, integration tests | Needs verification | — | Same |
| `ai` package | Core | Not yet in engine | 6.0.138 | — (must install) |
| `@ai-sdk/anthropic` | Anthropic provider | Not yet in engine | 3.0.64 | — (must install) |
| `@ai-sdk/openai` | OpenAI provider | Not yet in engine | 3.0.48 | — (must install) |
| `@ai-sdk/google` | Google provider | Not yet in engine | 3.0.53 | — (must install) |
| `pino` | Structured logging | Not yet in engine | 10.3.1 | — (must install) |

**Missing dependencies with no fallback:**
- `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `pino` — all must be installed in `packages/engine` as part of Wave 0.

**Missing dependencies with fallback:**
- Provider API keys — can be skipped during unit tests via mock; skip startup validation with env flag for CI.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 |
| Config file | `packages/engine/vitest.config.ts` (does not exist yet — Wave 0 gap) |
| Integration config | `packages/engine/vitest.integration.config.ts` (does not exist yet — Wave 0 gap) |
| Quick run command | `cd packages/engine && vitest run src/**/*.test.ts` |
| Full suite command | `cd packages/engine && vitest run` |
| Integration run command | `cd packages/engine && vitest run --config vitest.integration.config.ts` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LLM-01 | Gateway instantiates with all three providers | unit | `vitest run src/gateway/gateway.test.ts` | ❌ Wave 0 |
| LLM-02 | Stage enum resolves correct model from config | unit | `vitest run src/gateway/config.test.ts` | ❌ Wave 0 |
| LLM-03 | Per-project DB overrides merge onto defaults | unit | `vitest run src/gateway/config.test.ts` | ❌ Wave 0 |
| LLM-03 | Project settings column survives restart (DB) | integration | `vitest run --config vitest.integration.config.ts` | ❌ Wave 0 |
| LLM-04 | Failover fires on 429/5xx, skips on 401 | unit | `vitest run src/gateway/failover.test.ts` | ❌ Wave 0 |
| LLM-04 | Circuit breaker opens after 3 failures | unit | `vitest run src/gateway/circuit-breaker.test.ts` | ❌ Wave 0 |
| LLM-05 | Token usage written to `llm_usage` table | integration | `vitest run --config vitest.integration.config.ts` | ❌ Wave 0 |
| LLM-05 | Per-project cost aggregation query returns correct total | integration | `vitest run --config vitest.integration.config.ts` | ❌ Wave 0 |
| LLM-06 | Same-family holdout call throws diversity error | unit | `vitest run src/gateway/diversity.test.ts` | ❌ Wave 0 |
| LLM-06 | Failover skips same-family providers for holdout | unit | `vitest run src/gateway/failover.test.ts` | ❌ Wave 0 |

### Unit Test Strategy

Unit tests use mock provider responses — no real API calls. Mock AI SDK functions using Vitest's `vi.mock('ai')`. Test:
- Model family classification
- Config loading and merging logic
- Failover state machine transitions
- Cross-model diversity rejection
- Error classification (429 vs 5xx vs 401)
- Cost calculation from price table
- Budget pre-check logic

### Integration Test Strategy

Integration tests run against the real test PostgreSQL (port 5433, same as Phase 1 tests). They test:
- `llm_usage` table inserts (with mocked LLM calls — no real API needed for DB tests)
- `projects.settings` JSONB reads/writes and merge behavior
- Event store writes for gateway events
- Budget aggregation queries

Real API calls (end-to-end provider tests) are scoped to a separate `test:providers` script that requires actual API keys — not run in CI by default.

### Sampling Rate

- **Per task commit:** `pnpm --filter @cauldron/engine test`
- **Per wave merge:** Full suite (`vitest run` across all packages)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/engine/vitest.config.ts` — unit test config (follow `packages/shared` pattern)
- [ ] `packages/engine/vitest.integration.config.ts` — integration test config with `maxWorkers: 1`
- [ ] `packages/engine/src/gateway/gateway.test.ts` — covers LLM-01, LLM-02
- [ ] `packages/engine/src/gateway/config.test.ts` — covers LLM-02, LLM-03
- [ ] `packages/engine/src/gateway/failover.test.ts` — covers LLM-04
- [ ] `packages/engine/src/gateway/circuit-breaker.test.ts` — covers LLM-04
- [ ] `packages/engine/src/gateway/diversity.test.ts` — covers LLM-06
- [ ] `packages/shared/src/db/schema/llm-usage.ts` — new schema file
- [ ] Drizzle migration for `llm_usage` table and `projects.settings` column
- [ ] `packages/engine/package.json` — add `ai`, `@ai-sdk/*`, `pino` dependencies

---

## Project Constraints (from CLAUDE.md)

The following directives apply to all Phase 2 implementation:

- **TypeScript end-to-end** — all gateway code must be TypeScript with strict mode
- **Vercel AI SDK only** — no direct provider HTTP calls, no other LLM client libraries
- **OSS dependencies** — only if they do 80%+ cleanly (no contortion). Gateway avoids all external circuit breaker or retry libraries — hand-rolled logic is small and justified.
- **Context window target** — gateway itself is a library; no constraint applies here (this is infrastructure, not an agent context)
- **No mutable spec/in-place editing** — not applicable to gateway layer
- **Node16 moduleResolution** — all relative imports in `packages/engine` must use `.js` extensions
- **No `updatedAt` on immutable entities** — `llm_usage` table has no `updatedAt` (append-only by design)
- **pnpm workspaces** — add dependencies with `pnpm add --filter @cauldron/engine`
- **Vitest 4** — `maxWorkers: 1` for integration tests sharing single PostgreSQL (same as Phase 1)

---

## Sources

### Primary (HIGH confidence)

- [ai-sdk.dev/docs/reference/ai-sdk-core/stream-text](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) — `onFinish` callback, `usage` properties, `experimental_transform`
- [ai-sdk.dev/docs/reference/ai-sdk-core/generate-text](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text) — `generateText` full signature, `usage` return
- [ai-sdk.dev/docs/reference/ai-sdk-errors/ai-api-call-error](https://ai-sdk.dev/docs/reference/ai-sdk-errors/ai-api-call-error) — `statusCode`, `isRetryable`, `APICallError.isInstance()`
- [ai-sdk.dev/providers/ai-sdk-providers/anthropic](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic) — `anthropic()` and `createAnthropic()`, model IDs
- [ai-sdk.dev/providers/ai-sdk-providers/openai](https://ai-sdk.dev/providers/ai-sdk-providers/openai) — `openai()`, model IDs
- [ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai) — `google()`, Gemini model IDs
- [ai-sdk.dev/cookbook/node/stream-object-record-token-usage](https://ai-sdk.dev/cookbook/node/stream-object-record-token-usage) — exact `onFinish` usage recording pattern
- `packages/shared/src/db/schema/event.ts` — existing event type enum conventions (read from codebase)
- `packages/shared/src/db/schema/project.ts` — existing project table for settings column addition
- `.planning/phases/02-llm-gateway/02-CONTEXT.md` — all locked decisions

### Secondary (MEDIUM confidence)

- [ai-sdk.dev/docs/reference/ai-sdk-errors](https://ai-sdk.dev/docs/reference/ai-sdk-errors) — complete error type list
- [github.com/vercel/ai/issues/7247](https://github.com/vercel/ai/issues/7247) — SDK does not respect rate-limit headers (confirms need for gateway-owned retry logic)
- [vercel.com/blog/ai-sdk-6](https://vercel.com/blog/ai-sdk-6) — AI SDK 6 features overview

### Tertiary (LOW confidence)

- npm version history for `@ai-sdk/*` packages — versions used from already-verified CLAUDE.md / STACK.md

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions locked in project, npm-verified on 2026-03-25
- Architecture patterns: HIGH — AI SDK official docs, existing codebase patterns read directly
- Pitfalls: HIGH — several verified against official GitHub issues (double retry, NaN tokens)
- Token tracking mechanism: HIGH — official AI SDK cookbook + reference docs
- Pricing data: LOW — model prices change frequently; table should be treated as initial approximation

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 for stack versions; 2026-04-01 for pricing table (verify before implementation)
