---
phase: 4
slug: holdout-vault
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `packages/engine/vitest.config.ts` |
| **Quick run command** | `pnpm --filter engine test -- --run` |
| **Full suite command** | `pnpm turbo test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter engine test -- --run`
- **After every plan wave:** Run `pnpm turbo test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | HOLD-01 | unit | `pnpm --filter engine test -- --run` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | HOLD-03 | unit | `pnpm --filter engine test -- --run` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | HOLD-04 | unit+integration | `pnpm turbo test` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 2 | HOLD-02 | unit | `pnpm --filter engine test -- --run` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 2 | HOLD-05 | unit | `pnpm --filter engine test -- --run` | ❌ W0 | ⬜ pending |
| 04-02-03 | 02 | 2 | HOLD-06 | unit | `pnpm --filter engine test -- --run` | ❌ W0 | ⬜ pending |
| 04-02-04 | 02 | 2 | HOLD-07 | unit | `pnpm --filter engine test -- --run` | ❌ W0 | ⬜ pending |
| 04-02-05 | 02 | 2 | HOLD-08 | unit | `pnpm --filter engine test -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/engine/src/holdout/__tests__/` — test directory for holdout module
- [ ] Existing vitest infrastructure covers framework needs

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cross-model holdout generation uses different provider | HOLD-01 | Requires live API keys | Run holdout generation with real keys; verify gateway logs show different provider family |
| Agent process env lacks HOLDOUT_ENCRYPTION_KEY | HOLD-04 | Process-level verification | Run child_process.spawnSync test that checks env isolation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
