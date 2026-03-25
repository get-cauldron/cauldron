---
phase: 2
slug: llm-gateway
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | packages/engine/vitest.config.ts (Wave 0 creates) |
| **Quick run command** | `pnpm --filter @cauldron/engine test` |
| **Full suite command** | `pnpm turbo test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @cauldron/engine test`
- **After every plan wave:** Run `pnpm turbo test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | LLM-01 | unit | `pnpm --filter @cauldron/engine test` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | LLM-02 | unit | `pnpm --filter @cauldron/engine test` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | LLM-04 | unit | `pnpm --filter @cauldron/engine test` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | LLM-06 | unit | `pnpm --filter @cauldron/engine test` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | LLM-03 | integration | `pnpm turbo test` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | LLM-05 | integration | `pnpm turbo test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/engine/vitest.config.ts` — Vitest configuration for engine package
- [ ] `packages/engine/src/gateway/__tests__/` — test directory structure
- [ ] `ai @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google pino` — dependencies installed in engine

*Existing shared package test infrastructure (setup.ts, Docker Compose) covers integration test needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| API key validation at startup | LLM-01 | Requires real provider credentials | Set valid keys, verify gateway init succeeds; unset one key, verify startup error |
| Provider failover under real 429 | LLM-04 | Rate limits are external | Trigger rate limit on primary provider, verify fallback is used |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
