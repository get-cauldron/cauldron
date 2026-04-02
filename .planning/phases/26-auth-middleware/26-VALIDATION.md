---
phase: 26
slug: auth-middleware
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 |
| **Config file** | `packages/web/vitest.config.ts` (unit), `packages/web/vitest.wiring.config.ts` (wiring) |
| **Quick run command** | `pnpm -F @get-cauldron/web test` |
| **Full suite command** | `pnpm -F @get-cauldron/web test:wiring` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm typecheck && pnpm -F @get-cauldron/web test`
- **After every plan wave:** Run `pnpm build && pnpm -F @get-cauldron/web test:wiring`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 1 | SEC-02 | unit | `pnpm -F @get-cauldron/web test -- src/trpc/routers/__tests__/auth-middleware.test.ts` | ❌ W0 | ⬜ pending |
| 26-01-02 | 01 | 1 | SEC-02 | unit | `pnpm -F @get-cauldron/web test -- src/trpc/routers/__tests__/auth-middleware.test.ts` | ❌ W0 | ⬜ pending |
| 26-01-03 | 01 | 1 | SEC-02 | wiring | `pnpm -F @get-cauldron/web test:wiring` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/web/src/trpc/routers/__tests__/auth-middleware.test.ts` — stubs for SEC-02 (UNAUTHORIZED on mutations, queries still public, dev bypass)

*Existing wiring tests already pass `authenticated: true` — no test harness changes needed.*

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
