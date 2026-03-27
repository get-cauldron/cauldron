---
phase: 17
slug: ui-testing-e2e-testing-and-final-checks
status: draft
nyquist_compliant: false
wave_0_complete: false
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

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 0 | D-17 | build | `pnpm build` | ❌ W0 | ⬜ pending |
| 17-01-02 | 01 | 0 | D-07 | infra | `docker compose up postgres-e2e -d` | ❌ W0 | ⬜ pending |
| 17-01-03 | 01 | 0 | D-03 | install | `pnpm -F @get-cauldron/web add @axe-core/playwright` | ❌ W0 | ⬜ pending |
| 17-01-04 | 01 | 0 | D-08 | unit | `pnpm -F @get-cauldron/web test` | ❌ W0 | ⬜ pending |
| 17-02-01 | 02 | 1 | D-10,D-11 | component | `pnpm -F @get-cauldron/web test` | ❌ W0 | ⬜ pending |
| 17-03-01 | 03 | 2 | D-01,D-02,D-03 | e2e | `pnpm -F @get-cauldron/web test:e2e` | ❌ W0 | ⬜ pending |
| 17-04-01 | 04 | 3 | D-16,D-18,D-19 | audit | `pnpm audit --audit-level high` | ❌ W0 | ⬜ pending |
| 17-05-01 | 05 | 3 | D-21,D-22,D-23 | CI | GitHub PR trigger | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Fix `pnpm build` failure (SSE route import issue) — blocks D-17
- [ ] Add `postgres-e2e` service to `docker-compose.yml` (port :5434) — blocks E2E DB setup
- [ ] Install `@axe-core/playwright` — blocks D-03
- [ ] `e2e/helpers/db.ts` — shared E2E factory functions (D-08)
- [ ] `e2e/fixtures/interview-responses.json` — LLM mock payloads (D-09)

*All E2E and component test files are created in their respective plan waves.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Lighthouse report quality | D-20 | Informational only, no thresholds | Run `lhci autorun`, review report HTML |
| Visual snapshot baselines | D-02 | First run creates baselines | Visually review snapshot diffs after first E2E run |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
