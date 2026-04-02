# Phase 30: Replace OpenAI Provider - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove `@ai-sdk/openai` entirely from Cauldron and replace all OpenAI model references with a new multi-provider configuration: Anthropic (primary hosted), Google (hosted), Mistral (hosted, new), and local Qwen via Ollama (experimental). Includes gateway provider wiring, config restructuring, capability tagging, embedding migration, and full cleanup of OpenAI artifacts.

</domain>

<decisions>
## Implementation Decisions

### Provider Lineup
- **D-01:** Four provider families post-migration: Anthropic (`@ai-sdk/anthropic`), Google (`@ai-sdk/google`), Mistral (`@ai-sdk/mistral` — new dependency), and local Qwen via Ollama (`ollama-ai-provider` or `ai-sdk-ollama`).
- **D-02:** OpenAI removal is motivated by political reasons. xAI/Grok is equally excluded for the same reasons. These are hard constraints, not preferences.
- **D-03:** Mistral serves as the primary new hosted provider — has official first-party `@ai-sdk/mistral` package (lowest maintenance risk).
- **D-04:** Local Qwen via Ollama is experimental — user wants to explore local LLM power on M5 Max (64GB, 40 GPU cores). Best local candidate: Qwen3-30B-A3B (MoE, 3B active params).

### Model Replacement Mapping
- **D-05:** Spread load across all 4 providers — no single provider dominates. Assign primaries per stage based on model strengths. Local Qwen assigned to low-stakes stages (context assembly, scoring) as a proving ground.
- **D-06:** Researcher/planner should produce a concrete mapping table: each pipeline stage → primary model + fallback chain, replacing all `gpt-4.1`, `gpt-4.1-mini`, `gpt-4o-mini` references in `cauldron.config.ts`.

### Holdout Diversity
- **D-07:** Existing cross-model diversity rule (Phase 2 D-07/D-18) unchanged: holdout rejects same-family as implementer.
- **D-08:** Local Qwen is EXCLUDED from holdout test generation. Holdout rotates between hosted providers only (Anthropic, Google, Mistral). Quality bar for holdout integrity is too high for local models.

### Embedding Strategy
- **D-09:** Replace `openai.embedding('text-embedding-3-large')` in `packages/engine/src/evolution/embeddings.ts` with Mistral embeddings (`mistral-embed`). Same `embed()` API from Vercel AI SDK — clean swap.

### Ollama Lifecycle Management
- **D-10:** If `cauldron.config.ts` includes any `ollama:*` model, Ollama MUST be running or startup fails. Hard requirement — no silent degradation. User opted in, Cauldron enforces.
- **D-11:** Auto-pull on first run: if configured local model isn't found in Ollama, Cauldron pulls it automatically. Consistent with hard-requirement stance — if you configured it, Cauldron makes it work.

### Config Structure
- **D-12:** Local models represented inline in fallback chains with `ollama:` prefix: e.g., `'ollama:qwen3-30b-a3b'`. Gateway resolves the prefix to the Ollama provider. Minimal config change to existing `cauldron.config.ts` shape.
- **D-13:** No separate `localModels` config block — local models are first-class members of fallback chains, just with a provider prefix.

### Provider Capability Tags
- **D-14:** Each provider gets soft capability ratings in `cauldron.config.ts` across 5 dimensions: `coding`, `reasoning`, `instruction-following`, `creativity`, `speed`. Values: `'strong' | 'moderate' | 'weak'`.
- **D-15:** Tags are advisory — gateway uses them for stage assignment recommendations and logging, but does not hard-block. Human configures stage→model mapping; tags inform the choice.
- **D-16:** Capability tags map to pipeline stages: coding → implementation/execution, reasoning → decomposition/evaluation, instruction-following → interview/holdout, creativity → evolution, speed → context assembly.

### Cleanup Scope
- **D-17:** Full removal: uninstall `@ai-sdk/openai` from `packages/engine/package.json`, remove all `OPENAI_API_KEY` references from env examples, health checks (`packages/cli/src/health.ts`), bootstrap (`packages/cli/src/bootstrap.ts`), E2E helpers, and test scripts.
- **D-18:** Update all test mocks that reference `@ai-sdk/openai` (`gateway.test.ts`, `embeddings.test.ts`).
- **D-19:** Remove `openai` case from `packages/engine/src/gateway/providers.ts` switch statement.

### Claude's Discretion
- Exact Mistral model assignments per stage (based on available models and benchmarks)
- Ollama provider package choice (`ollama-ai-provider` vs `ai-sdk-ollama` — pick whichever has better AI SDK v6 compatibility)
- Auto-pull implementation details (CLI output, progress reporting)
- Capability tag default values per provider (based on current benchmarks)
- Health check implementation for Ollama availability
- Whether to add a `cauldron models` CLI subcommand or keep model management purely config-driven

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Gateway Implementation
- `packages/engine/src/gateway/providers.ts` — Provider switch statement (openai case to remove, new cases to add)
- `packages/engine/src/gateway/__tests__/gateway.test.ts` — Gateway tests with OpenAI mocks to replace
- `cauldron.config.ts` — Model routing config with all OpenAI model references

### Embeddings
- `packages/engine/src/evolution/embeddings.ts` — OpenAI embedding usage to replace with Mistral
- `packages/engine/src/evolution/__tests__/embeddings.test.ts` — Embedding test mocks

### Env & Health
- `packages/cli/src/health.ts` — OPENAI_API_KEY health check
- `packages/cli/src/bootstrap.ts` — OPENAI_API_KEY bootstrap validation
- `packages/web/e2e/helpers/live-infra.ts` — E2E infrastructure helpers
- `scripts/run-interview-automated.ts` — Automated interview script

### Phase 2 Context
- `.planning/phases/02-llm-gateway/02-CONTEXT.md` — Original gateway design decisions (D-01 through D-25)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Gateway provider resolution** (`providers.ts`): Switch statement maps provider family string to AI SDK provider instance. Adding Mistral/Ollama follows the same pattern.
- **Embed API** (`embeddings.ts`): Uses Vercel AI SDK `embed()` — provider swap is a one-line change.
- **Config shape** (`cauldron.config.ts`): Stage → model chain mapping. New models slot directly into existing arrays.
- **Health check pattern** (`health.ts`): Validates env vars and pings providers. Extend for Mistral + Ollama.

### Established Patterns
- Provider family parsed from model string (e.g., `'claude-sonnet-4-6'` → `'anthropic'`). New prefix `'ollama:'` needs parser update.
- Test mocks use `vi.mock('@ai-sdk/openai')` — same pattern for new providers.
- Circuit breaker and failover already handle multi-provider chains — no architectural change needed.

### Integration Points
- `cauldron.config.ts` — all model references updated
- `packages/engine/package.json` — remove `@ai-sdk/openai`, add `@ai-sdk/mistral` + Ollama provider
- `providers.ts` — new switch cases for mistral and ollama
- `.env.example` — remove `OPENAI_API_KEY`, add `MISTRAL_API_KEY`

</code_context>

<specifics>
## Specific Ideas

- User's machine: Apple M5 Max, 64GB RAM, 40 GPU cores, Metal 4 — Qwen3-30B-A3B (MoE, 3B active) is the target local model
- OpenAI removal is political — same politics exclude xAI/Grok. Do not suggest either as alternatives.
- Qwen3-30B-A3B matches GPT-5-High on SWE-Bench at 10x efficiency — good quality for non-critical stages
- Mistral embeddings (`mistral-embed`) replace OpenAI `text-embedding-3-large` for evolution lineage

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 30-replace-openai-provider*
*Context gathered: 2026-04-02*
