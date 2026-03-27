---
phase: 10
slug: wire-trpc-mutations-to-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `packages/web/vitest.config.ts`, `packages/engine/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @cauldron/web test -- --run` |
| **Full suite command** | `pnpm turbo test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @cauldron/web test -- --run`
- **After every plan wave:** Run `pnpm turbo test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | INTV-01..07 | integration | `pnpm --filter @cauldron/web test -- --run -t "sendAnswer"` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | HOLD-03..05 | integration | `pnpm --filter @cauldron/web test -- --run -t "sealHoldouts"` | ❌ W0 | ⬜ pending |
| 10-01-03 | 01 | 1 | DAG-01..05 | integration | `pnpm --filter @cauldron/web test -- --run -t "triggerDecomposition"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Integration test stubs for sendAnswer, sealHoldouts, triggerDecomposition mutations
- [ ] Test fixtures for mock DB with interview/vault/bead state

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full interview flow in browser | INTV-01 | Requires running Next.js + Inngest dev | Start dev env, open chat UI, submit answer, verify next question appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
