---
phase: 8
slug: web-dashboard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (unit/integration) + playwright 1.58.x (E2E) |
| **Config file** | `packages/web/vitest.config.ts` (Wave 0 creates) |
| **Quick run command** | `pnpm --filter @cauldron/web test` |
| **Full suite command** | `pnpm turbo test --filter=@cauldron/web && pnpm --filter @cauldron/web test:e2e` |
| **Estimated runtime** | ~30 seconds (unit), ~60 seconds (E2E) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @cauldron/web test`
- **After every plan wave:** Run `pnpm turbo test --filter=@cauldron/web`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | WEB-01 | integration | `pnpm --filter @cauldron/web test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | WEB-02 | unit | `pnpm --filter @cauldron/web test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | WEB-03 | E2E | `pnpm --filter @cauldron/web test:e2e` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | WEB-04 | integration | `pnpm --filter @cauldron/web test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | WEB-05 | E2E | `pnpm --filter @cauldron/web test:e2e` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | WEB-06 | E2E | `pnpm --filter @cauldron/web test:e2e` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | WEB-07 | unit | `pnpm --filter @cauldron/web test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | WEB-08 | visual | manual | ❌ | ⬜ pending |
| TBD | TBD | TBD | WEB-09 | integration | `pnpm --filter @cauldron/web test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/web/vitest.config.ts` — Vitest configuration for web package
- [ ] `packages/web/playwright.config.ts` — Playwright E2E configuration
- [ ] `packages/web/src/__tests__/` — test directory structure
- [ ] Next.js 16 scaffold with App Router
- [ ] shadcn/ui initialization with HZD theme
- [ ] tRPC client/server setup

*Test stubs will be populated by the planner based on task breakdown.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| HZD visual identity | WEB-08 | Subjective visual assessment | Review rendered pages against UI-SPEC color, typography, and spacing contracts |
| DAG node animations | WEB-03 | CSS transitions not automatable without screenshot comparison | Verify teal glow on status transitions in browser |
| Dynamic hex background | WEB-08 | CSS background animation | Verify hex grid brightens near active elements |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
