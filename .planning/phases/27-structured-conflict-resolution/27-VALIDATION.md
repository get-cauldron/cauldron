---
phase: 27
slug: structured-conflict-resolution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 |
| **Config file** | `packages/engine/vitest.config.ts` |
| **Quick run command** | `pnpm -F @get-cauldron/engine test -- src/execution/__tests__/merge-queue.test.ts` |
| **Full suite command** | `pnpm -F @get-cauldron/engine test` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -F @get-cauldron/engine test -- src/execution/__tests__/merge-queue.test.ts`
- **After every plan wave:** Run `pnpm -F @get-cauldron/engine test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | CONC-05 | unit | `pnpm -F @get-cauldron/engine test -- src/execution/__tests__/merge-queue.test.ts` | ✅ (update) | ⬜ pending |
| 27-01-02 | 01 | 1 | CONC-05 | unit | `pnpm -F @get-cauldron/engine test -- src/execution/__tests__/merge-queue.test.ts` | ✅ (update) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. `merge-queue.test.ts` exists — test cases need updating, not creating from scratch.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
