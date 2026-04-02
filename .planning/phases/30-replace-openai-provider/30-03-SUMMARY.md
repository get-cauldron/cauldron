---
phase: 30-replace-openai-provider
plan: "03"
subsystem: cli/web/e2e/scripts
tags: [provider-swap, mistral, ollama, health-check, cleanup]
dependency_graph:
  requires:
    - 30-01 (ProviderFamily type, Mistral/Ollama gateway wiring)
  provides:
    - CLI health check with Mistral key + Ollama reachability + auto-pull
    - Zero OPENAI_API_KEY or gpt-* references in CLI, web, E2E, scripts, env, turbo
    - MISTRAL_API_KEY and OLLAMA_HOST in .env.example and turbo.json
  affects:
    - packages/cli/src/health.ts
    - packages/cli/src/bootstrap.ts
    - packages/web/e2e/helpers/live-infra.ts
    - packages/web/e2e/pipeline-live.spec.ts
    - packages/web/e2e/interview.spec.ts
    - packages/web/e2e/costs.spec.ts
    - packages/web/src/trpc/engine-deps.ts
    - packages/web/src/trpc/routers/__tests__/interview-engine.test.ts
    - packages/web/src/trpc/routers/__tests__/costs.wiring.test.ts
    - scripts/run-interview-automated.ts
    - .env.example
    - turbo.json
tech_stack:
  added:
    - "ollama ^0.6.3 (CLI package — for ensureModels auto-pull)"
  patterns:
    - ollama: prefix detection for Ollama model filtering
    - HTTP /api/tags reachability check for Ollama
    - ollamaClient.list() + ollamaClient.pull() for auto-pull
key_files:
  modified:
    - packages/cli/src/health.ts
    - packages/cli/src/bootstrap.ts
    - packages/cli/package.json
    - packages/web/e2e/helpers/live-infra.ts
    - packages/web/e2e/pipeline-live.spec.ts
    - packages/web/e2e/interview.spec.ts
    - packages/web/e2e/costs.spec.ts
    - packages/web/src/trpc/engine-deps.ts
    - packages/web/src/trpc/routers/__tests__/interview-engine.test.ts
    - packages/web/src/trpc/routers/__tests__/costs.wiring.test.ts
    - scripts/run-interview-automated.ts
    - .env.example
    - turbo.json
    - pnpm-lock.yaml
decisions:
  - CLI health check calls ensureOllama() only when config.models contains ollama: prefixed models — zero cost when Ollama not configured
  - ensureOllama hard-fails with descriptive error if Ollama unreachable (D-10)
  - ensureModels auto-pulls missing ollama models using ollamaClient.list() + ollamaClient.pull() with streaming progress (D-11)
  - ollama package added to CLI package.json (not engine) since health.ts lives in CLI
  - engine-deps.ts fallback config uses mistral-large-latest and ollama:qwen3-30b-a3b per plan spec
metrics:
  duration: "~15 minutes"
  completed_date: "2026-04-02"
  tasks_completed: 2
  files_modified: 14
---

# Phase 30 Plan 03: Remove OpenAI Artifacts from CLI, Web, Scripts, Env, Turbo - Summary

Eliminated all remaining OpenAI artifacts from CLI health checks, bootstrap, E2E helpers, web tRPC config, scripts, env templates, and turbo config. Added Mistral API key and Ollama health check with auto-pull to CLI startup.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update CLI health check and bootstrap for Mistral + Ollama (with auto-pull) | 1afa7c1 | health.ts, bootstrap.ts, package.json, pnpm-lock.yaml |
| 2 | Remove all OpenAI references from web, E2E, scripts, env, and turbo config | 7ce2f01 | live-infra.ts, pipeline-live.spec.ts, interview.spec.ts, costs.spec.ts, engine-deps.ts, interview-engine.test.ts, costs.wiring.test.ts, run-interview-automated.ts, .env.example, turbo.json |

## What Was Built

### CLI Health Check (health.ts)
- `AI_PROVIDER_KEYS` now contains `MISTRAL_API_KEY` instead of `OPENAI_API_KEY`
- `warnOptionalPrerequisites()` references `MISTRAL_API_KEY` in the warning message
- New `ensureOllama(config)` function: scans all model chains for `ollama:` prefix; hits `${OLLAMA_HOST}/api/tags` with 3s timeout; hard-fails if Ollama unreachable when ollama models are configured (D-10)
- New `ensureModels(ollamaHost, ollamaModels)` function: uses `ollamaClient.list()` to check present models; calls `ollamaClient.pull({ stream: true })` for any missing model (D-11)
- `HealthCheckOptions` extended with `config?: { models: Record<string, string[]> }` — callers without config skip Ollama check gracefully
- `healthCheck()` calls `ensureOllama(options.config)` after Redis check when config provided
- `ollama ^0.6.3` added to CLI `package.json` (the `ai-sdk-ollama` package lives in engine, CLI needed the bare `ollama` JS client for list/pull)

### CLI Bootstrap (bootstrap.ts)
- `OPENAI_API_KEY` replaced with `MISTRAL_API_KEY` in quote-strip loop

### Web / E2E / Scripts Cleanup
- `live-infra.ts`: `checkApiKeys()` now checks `MISTRAL_API_KEY` instead of `OPENAI_API_KEY`
- `pipeline-live.spec.ts`: All `gpt-4.1-mini` replaced with `mistral-small-latest`; prerequisite comment updated to `MISTRAL, ANTHROPIC, GOOGLE`; skip message updated
- `interview.spec.ts`: Both `model: 'gpt-4.1'` in test transcript fixtures replaced with `mistral-large-latest`
- `costs.spec.ts`: Test data model changed from `gpt-4.1` to `mistral-large-latest` in seeded records and assertion
- `engine-deps.ts`: Fallback config model chains updated — all `gpt-4.1`, `gpt-4.1-mini`, `gpt-4o-mini` replaced with Mistral equivalents (`mistral-large-latest`, `mistral-small-latest`, `ollama:qwen3-30b-a3b`)
- `interview-engine.test.ts`: All 3 `gpt-4.1` model string references replaced with `mistral-large-latest`
- `costs.wiring.test.ts`: `gpt-4o` model string replaced with `mistral-large-latest`
- `run-interview-automated.ts`: `OPENAI_API_KEY` in quote-strip loop replaced with `MISTRAL_API_KEY`
- `.env.example`: Removed `OPENAI_API_KEY=`, added `MISTRAL_API_KEY=` and `OLLAMA_HOST=http://localhost:11434`
- `turbo.json`: Replaced `OPENAI_API_KEY` with `MISTRAL_API_KEY` in `globalPassThroughEnv`; added `OLLAMA_HOST` to `globalPassThroughEnv`

## Deviations from Plan

### Auto-fixed Issues

None — all plan tasks executed as specified.

### Notes

The overall verification check `grep -r "gpt-"` found remaining `gpt-*` references in engine test files (`diversity.test.ts`, `failover.test.ts`, `pricing.test.ts`, `fsm.test.ts`) and `packages/shared` integration tests. These files are explicitly in **plan 02's** `files_modified` scope — they are not plan 03's responsibility. Plan 03 success criteria stating "No gpt-* model references in any source file" is a cross-plan dependency; the remaining references will be resolved by plan 02.

## Known Stubs

None.

## Self-Check: PASSED

- packages/cli/src/health.ts — FOUND (modified)
- packages/cli/src/bootstrap.ts — FOUND (modified)
- .env.example — FOUND (modified)
- turbo.json — FOUND (modified)
- Commit 1afa7c1: feat(30-03): update CLI health check for Mistral + Ollama auto-pull — FOUND
- Commit 7ce2f01: feat(30-03): remove all OpenAI references from web, E2E, scripts, env, turbo — FOUND
- pnpm -F @get-cauldron/web test: 173 tests passed
- pnpm -F @get-cauldron/cli typecheck: clean
- pnpm -F @get-cauldron/web typecheck: clean
