---
phase: 3
slug: interview-seed-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 3 — Validation Strategy

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
| 03-01-01 | 01 | 1 | INTV-01 | unit | `pnpm --filter engine test -- --run` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | INTV-02 | unit | `pnpm --filter engine test -- --run` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | INTV-03 | unit | `pnpm --filter engine test -- --run` | ❌ W0 | ⬜ pending |
| 03-01-04 | 01 | 1 | INTV-04 | unit | `pnpm --filter engine test -- --run` | ❌ W0 | ⬜ pending |
| 03-01-05 | 01 | 1 | INTV-05 | unit | `pnpm --filter engine test -- --run` | ❌ W0 | ⬜ pending |
| 03-01-06 | 01 | 1 | INTV-06 | unit | `pnpm --filter engine test -- --run` | ❌ W0 | ⬜ pending |
| 03-01-07 | 01 | 1 | INTV-07 | unit | `pnpm --filter engine test -- --run` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | SEED-01 | unit+integration | `pnpm turbo test` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | SEED-02 | integration | `pnpm turbo test` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 2 | SEED-03 | unit | `pnpm --filter engine test -- --run` | ❌ W0 | ⬜ pending |
| 03-02-04 | 02 | 2 | SEED-04 | integration | `pnpm turbo test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/engine/src/interview/__tests__/` — test directory for interview module
- [ ] `packages/shared/src/db/__tests__/seed-immutability.test.ts` — stub for SEED-02 DB trigger test
- [ ] Existing vitest infrastructure covers framework needs

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cross-model perspective diversity visible in output | INTV-01 + D-10 | Requires live API keys for multiple providers | Run interview with perspectiveModels configured; verify transcript shows different models |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
