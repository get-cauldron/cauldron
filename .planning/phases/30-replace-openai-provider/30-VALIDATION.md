---
phase: 30
slug: replace-openai-provider
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 |
| **Config file** | `packages/engine/vitest.config.ts` |
| **Quick run command** | `pnpm -F @get-cauldron/engine test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -F @get-cauldron/engine test` for engine changes, `pnpm typecheck` for all
- **After every plan wave:** Run `pnpm test && pnpm typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green + `pnpm build`
- **Max feedback latency:** 20 seconds

---

## Wave 0 Requirements

*Existing test infrastructure covers all phase requirements. Tests need updating (mock replacement), not creating from scratch.*

---

## Manual-Only Verifications

| Behavior | Why Manual | Test Instructions |
|----------|------------|-------------------|
| Ollama connectivity | Requires local Ollama running | Start Ollama, run `cauldron health`, verify Ollama check passes |
| Model auto-pull | Requires Ollama + network | Configure uncached model, run pipeline, verify auto-pull triggers |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
