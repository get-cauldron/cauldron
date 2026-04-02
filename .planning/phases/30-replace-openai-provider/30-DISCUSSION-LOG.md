# Phase 30: Replace OpenAI Provider - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 30-replace-openai-provider
**Areas discussed:** Replacement providers, Model replacement mapping, Holdout diversity, Embedding strategy, Cleanup scope, Ollama lifecycle, Local model pull/setup, Config structure, Provider capability tagging

---

## Replacement Providers

| Option | Description | Selected |
|--------|-------------|----------|
| Anthropic + Google only | Keep 2 existing non-OpenAI providers. Simplifies to 2 providers. | |
| Anthropic + Google + add a new provider | Add a 4th provider to maintain 3-provider diversity. More fallback options. | |
| Anthropic only | Single provider — simplest but eliminates cross-model holdout diversity. | |

**User's choice:** Anthropic + Google + add a new provider (free text: "Lets do both Mistral and the best Qwen for my machine")
**Notes:** User wants Mistral as reliable hosted third provider AND local Qwen via Ollama as experimental. Curious about local LLM power on M5 Max but acknowledges it may not be as strong.

---

## New Provider Selection

| Option | Description | Selected |
|--------|-------------|----------|
| xAI (Grok) | Vercel AI SDK has @ai-sdk/xai. Competitive models. | |
| Mistral | Official @ai-sdk/mistral. Strong open-weight models, EU-based. | |
| Groq | @ai-sdk/groq. Extremely fast inference. | |

**User's choice:** Rejected initial question — clarified that OpenAI was ditched for political reasons that make xAI/Grok equally distasteful. Asked about Qwen quality instead.
**Notes:** Political motivations are a hard constraint. Landed on Mistral (hosted) + local Qwen (experimental) after research into Qwen benchmarks and AI SDK support.

---

## Model Replacement Mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Anthropic-primary, Mistral-fallback | Claude Sonnet replaces gpt-4.1 in most stages. Mistral as fallback. | |
| Spread the load across all providers | Distribute primaries across Anthropic, Google, Mistral. Local Qwen for low-stakes. | ✓ |
| You decide | Claude maps replacements based on model strengths. | |

**User's choice:** Spread the load across all providers
**Notes:** Local Qwen assigned to low-stakes stages (context assembly, scoring) as a proving ground.

---

## Holdout Diversity

| Option | Description | Selected |
|--------|-------------|----------|
| Keep existing rule | Holdout rejects same-family as implementer. 4 providers = always 3 alternatives. | |
| Exclude local Qwen from holdout | Don't trust local model quality for holdout generation. Hosted only. | ✓ |
| Require different family AND tier | Stricter: different provider AND flagship-tier model. | |

**User's choice:** Exclude local Qwen from holdout
**Notes:** Holdout integrity matters too much to gamble on local model quality.

---

## Embedding Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Mistral embeddings | mistral-embed via AI SDK. Hosted, reliable, clean swap. | ✓ |
| Local Qwen embeddings via Ollama | Zero API cost, works offline. Quality may vary. | |
| Google embeddings | text-embedding-004 via @ai-sdk/google. Proven quality. | |
| Drop embeddings entirely | Rely solely on Jaccard similarity, skip vector embeddings. | |

**User's choice:** Mistral embeddings
**Notes:** Clean swap — same embed() API.

---

## Cleanup Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full removal | Uninstall package, remove env refs, update health checks, update test mocks. | ✓ |
| Remove but keep provider wiring | Remove package but keep commented switch case. | |
| Soft removal | Remove from defaults but keep package installed. | |

**User's choice:** Full removal
**Notes:** Clean break.

---

## Ollama Lifecycle Management

| Option | Description | Selected |
|--------|-------------|----------|
| Graceful skip | Silently remove local models from chains if Ollama not running. | |
| Warn and skip | Log warning but continue without local models. | |
| Hard requirement when configured | If config includes local models, Ollama MUST be running or startup fails. | ✓ |

**User's choice:** Hard requirement when configured
**Notes:** User opted in = Cauldron enforces.

---

## Local Model Pull/Setup

| Option | Description | Selected |
|--------|-------------|----------|
| Manual setup only | User runs ollama pull themselves. Cauldron just checks. | |
| CLI helper command | Add cauldron models pull that wraps ollama pull. | |
| Auto-pull on first run | If model not found locally, auto-pull it. | ✓ |

**User's choice:** Auto-pull on first run
**Notes:** Consistent with hard-requirement stance. If you configured it, Cauldron makes it work.

---

## Config Structure for Local Models

| Option | Description | Selected |
|--------|-------------|----------|
| Inline with tag prefix | Local models in chains with 'ollama:' prefix. Gateway resolves prefix. | ✓ |
| Separate local section | Dedicated localModels config block. | |
| Provider-level config | Each provider gets own config block. | |

**User's choice:** Inline with tag prefix
**Notes:** Minimal config change. `'ollama:qwen3-30b-a3b'` in fallback chains.

---

## Provider Capability Tagging

| Option | Description | Selected |
|--------|-------------|----------|
| Soft tags in config | Capability ratings per provider. Gateway uses for recommendations, not hard-blocking. | ✓ |
| Hard routing constraints | Tags become routing rules that hard-block providers from stages. | |
| Documentation only | Tags in comments/docs. Gateway ignores them. | |

**User's choice:** Soft tags in config

### Capability Dimensions

| Option | Description | Selected |
|--------|-------------|----------|
| coding, reasoning, instruction-following | Three core dimensions mapping to pipeline stages. | |
| Add creativity and speed | Five dimensions for more granular routing. | ✓ |
| You decide | Claude picks based on pipeline stages and benchmarks. | |

**User's choice:** Five dimensions: coding, reasoning, instruction-following, creativity, speed
**Notes:** Maps to stages: coding → implementation, reasoning → decomposition/evaluation, instruction-following → interview/holdout, creativity → evolution, speed → context assembly.

---

## Claude's Discretion

- Exact Mistral model assignments per stage
- Ollama provider package choice
- Auto-pull implementation details
- Capability tag default values per provider
- Health check implementation for Ollama
- Whether to add cauldron models CLI subcommand

## Deferred Ideas

None — discussion stayed within phase scope
