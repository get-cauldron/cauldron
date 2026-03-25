---
phase: 1
slug: persistence-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/shared/vitest.config.ts (created in Wave 0) |
| **Quick run command** | `pnpm --filter shared test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter shared test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | INFR-01 | unit | `pnpm install` | TBD | pending |
| TBD | TBD | TBD | INFR-02 | integration | `pnpm --filter shared test` | TBD | pending |
| TBD | TBD | TBD | INFR-03 | integration | `docker compose up -d && pnpm --filter shared test` | TBD | pending |
| TBD | TBD | TBD | INFR-04 | integration | `pnpm --filter shared test` | TBD | pending |
| TBD | TBD | TBD | INFR-05 | integration | `pnpm --filter shared test:migrate` | TBD | pending |
| TBD | TBD | TBD | INFR-06 | integration | `docker compose up -d` | TBD | pending |

*Status: pending — will be populated after plans are created*

---

## Wave 0 Requirements

- [ ] `packages/shared/vitest.config.ts` — Vitest configuration with PostgreSQL test container support
- [ ] `packages/shared/src/test/setup.ts` — Test setup with Docker PostgreSQL connection
- [ ] `vitest` + `@testcontainers/postgresql` — dependencies installed

*Wave 0 sets up the test infrastructure that all subsequent waves depend on.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Docker Compose health checks | INFR-06 | Requires running Docker daemon | Run `docker compose up -d` and verify all services report healthy |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
