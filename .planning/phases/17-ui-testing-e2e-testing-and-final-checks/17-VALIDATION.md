---
phase: 17
slug: ui-testing-e2e-testing-and-final-checks
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-27
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.1 (component) + Playwright 1.58.2 (E2E) |
| **Config file** | `packages/web/vitest.config.ts` + `packages/web/playwright.config.ts` |
| **Quick run command** | `pnpm test && pnpm typecheck` |
| **Full suite command** | `pnpm test && pnpm build && pnpm -F @get-cauldron/web test:e2e` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test && pnpm typecheck`
- **After every plan wave:** Run `pnpm test && pnpm build && pnpm -F @get-cauldron/web test:e2e`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 17-01-T1 | 01 | 1 | D-16,D-17 | build | `pnpm build && pnpm typecheck && pnpm test` | ⬜ pending |
| 17-01-T2 | 01 | 1 | D-07,D-08,D-09 | infra | `pnpm typecheck && docker compose config --services` | ⬜ pending |
| 17-02-T1 | 02 | 2 | D-10,D-11,D-14 | component | `pnpm -F @get-cauldron/web test` | ⬜ pending |
| 17-02-T2 | 02 | 2 | D-10,D-12 | component | `pnpm -F @get-cauldron/web test` | ⬜ pending |
| 17-02-T3 | 02 | 2 | D-10,D-11 | component | `pnpm -F @get-cauldron/web test` | ⬜ pending |
| 17-03-T1 | 03 | 2 | D-01,D-02,D-03,D-06,D-13 | e2e | `pnpm -F @get-cauldron/web test:e2e` | ⬜ pending |
| 17-03-T2 | 03 | 2 | D-01,D-05,D-13,D-15 | e2e | `pnpm -F @get-cauldron/web test:e2e` | ⬜ pending |
| 17-04-T1 | 04 | 2 | D-01,D-04,D-13,D-15 | e2e | `pnpm -F @get-cauldron/web test:e2e` | ⬜ pending |
| 17-04-T2 | 04 | 2 | D-01,D-02,D-03,D-04,D-06,D-13 | e2e | `pnpm -F @get-cauldron/web test:e2e` | ⬜ pending |
| 17-05-T1 | 05 | 3 | D-21,D-22,D-23,D-24,D-25 | CI | `test -f .github/workflows/ci.yml` | ⬜ pending |
| 17-05-T2 | 05 | 3 | D-18,D-19 | audit | `pnpm build && pnpm typecheck && pnpm test && pnpm lint` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Fix `pnpm build` failure (SSE route import issue) — Plan 01 Task 1
- [x] Add `postgres-e2e` service to `docker-compose.yml` (port :5434) — Plan 01 Task 2
- [x] Install `@axe-core/playwright` — Plan 01 Task 1
- [x] `e2e/helpers/db.ts` — shared E2E factory functions (D-08) — Plan 01 Task 2
- [x] `e2e/helpers/accessibility.ts` — axe-core wrapper — Plan 01 Task 2
- [x] `e2e/helpers/routes.ts` — route constants — Plan 01 Task 2
- [x] `src/__tests__/helpers/sse-mock.ts` — EventSource mock — Plan 01 Task 2
- [x] `src/__tests__/helpers/trpc-wrapper.tsx` — tRPC test wrapper — Plan 01 Task 2

*All Wave 0 infrastructure is created in Plan 01 (Wave 1). Downstream plans (02-05) depend on Plan 01.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Lighthouse report quality | D-20 | Informational only, no thresholds | Run `lhci autorun`, review report HTML |
| Visual snapshot baselines | D-02 | First run creates baselines | Visually review snapshot diffs after first E2E run |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
