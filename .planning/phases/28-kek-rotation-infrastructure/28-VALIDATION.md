---
phase: 28
slug: kek-rotation-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 |
| **Config file** | `packages/engine/vitest.config.ts` (unit), `packages/shared/vitest.config.ts` (shared) |
| **Quick run command** | `pnpm -F @get-cauldron/engine test -- src/holdout/__tests__/kek-rotation.test.ts` |
| **Full suite command** | `pnpm -F @get-cauldron/engine test && pnpm -F @get-cauldron/shared test` |
| **Estimated runtime** | ~12 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -F @get-cauldron/engine test -- src/holdout/__tests__/kek-rotation.test.ts`
- **After every plan wave:** Run `pnpm -F @get-cauldron/engine test && pnpm -F @get-cauldron/shared test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 28-01-01 | 01 | 1 | SEC-01 | unit | `pnpm -F @get-cauldron/engine test -- src/holdout/__tests__/kek-rotation.test.ts` | ❌ W0 | ⬜ pending |
| 28-01-02 | 01 | 1 | SEC-01 | unit | `pnpm -F @get-cauldron/engine test -- src/holdout/__tests__/kek-rotation.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/engine/src/holdout/__tests__/kek-rotation.test.ts` — stubs for SEC-01 (rotation, dual-encrypt fallback, audit trail)

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
