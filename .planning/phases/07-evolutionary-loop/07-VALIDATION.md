---
phase: 07
slug: evolutionary-loop
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | packages/engine/vitest.config.ts |
| **Quick run command** | `cd packages/engine && pnpm exec vitest run src/evolution` |
| **Full suite command** | `pnpm exec vitest run --config vitest.config.ts` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/engine && pnpm exec vitest run src/evolution`
- **After every plan wave:** Run `pnpm exec vitest run --config vitest.config.ts`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 07-01-T1 | 01 | 1 | EVOL-01, EVOL-02 | unit | `vitest run src/evolution/__tests__/evaluator.test.ts` | pending |
| 07-01-T2 | 01 | 1 | EVOL-03, EVOL-04 | unit | `vitest run src/evolution/__tests__/evolver.test.ts` | pending |
| 07-02-T1 | 02 | 1 | EVOL-05-09 | unit | `vitest run src/evolution/__tests__/convergence.test.ts` | pending |
| 07-02-T2 | 02 | 1 | EVOL-12 | unit | `vitest run src/evolution/__tests__/budget.test.ts` | pending |
| 07-03-T1 | 03 | 2 | EVOL-10 | unit | `vitest run src/evolution/__tests__/lateral.test.ts` | pending |
| 07-03-T2 | 03 | 2 | EVOL-11 | unit | `vitest run src/evolution/__tests__/escalation.test.ts` | pending |
| 07-04-T1 | 04 | 3 | EVOL-01-12 | integration | `vitest run src/evolution/__tests__/fsm.test.ts` | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements (vitest, Inngest, Drizzle all installed)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end evo cycle with CLI renamer | EVOL success criterion 3 | Requires live LLM calls + Docker services | Run full pipeline, verify generation > 0 seed exists |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
