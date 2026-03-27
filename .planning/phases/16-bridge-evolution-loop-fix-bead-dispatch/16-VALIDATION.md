---
phase: 16
slug: bridge-evolution-loop-fix-bead-dispatch
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 |
| **Config file** | `packages/engine/vitest.config.ts`, `packages/web/vitest.config.ts` |
| **Quick run command** | `pnpm -F @get-cauldron/engine test -- --grep "convergence\|dispatch\|claim"` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -F @get-cauldron/engine test && pnpm -F @get-cauldron/web test`
- **After every plan wave:** Run `pnpm test && pnpm typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | HOLD-07, HOLD-08 | unit | `pnpm -F @get-cauldron/engine test -- src/holdout/__tests__/events.test.ts` | ✅ | ⬜ pending |
| 16-01-02 | 01 | 1 | DAG-05, EXEC-03, WEB-03 | unit | `pnpm -F @get-cauldron/engine test -- src/decomposition/__tests__/events.test.ts` | ✅ | ⬜ pending |
| 16-01-03 | 01 | 1 | EXEC-03 | unit | `pnpm -F @get-cauldron/web test` | ✅ | ⬜ pending |
| 16-01-04 | 01 | 1 | WEB-03, WEB-04 | unit | `pnpm -F @get-cauldron/web test -- src/app/api/events/__tests__/route.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/engine/src/holdout/__tests__/events.test.ts` — add test case: "step.sendEvent fires evolution_started Inngest event on holdout failure"
- [ ] `packages/engine/src/holdout/__tests__/events.test.ts` — update mock step objects to include `sendEvent: vi.fn()`
- [ ] `packages/engine/src/decomposition/__tests__/events.test.ts` — add test case: "bead_claimed event emitted after successful claim"
- [ ] `packages/web/src/app/api/events/__tests__/route.test.ts` — add test case: "SSE returns 200 with correct token query param"

*Existing test files cover all phase requirements — only new test cases needed, not new files.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Web SSE live DAG update | WEB-03 | Requires browser + running dev server | Start dev, open DAG page, trigger bead dispatch, verify active status appears |
| Git push → pipeline trigger | EXEC-03 | Requires git webhook + Inngest | Push to repo with webhook configured, verify beads dispatch |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
