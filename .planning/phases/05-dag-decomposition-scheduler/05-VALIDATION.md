---
phase: 5
slug: dag-decomposition-scheduler
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | packages/engine/vitest.config.ts |
| **Quick run command** | `pnpm --filter @cauldron/engine test -- --run` |
| **Full suite command** | `pnpm turbo test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @cauldron/engine test -- --run`
- **After every plan wave:** Run `pnpm turbo test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | DAG-01 | unit + integration | `pnpm --filter @cauldron/engine test` | TBD | pending |

*Status: pending / green / red / flaky*

*To be populated after plans are created.*

---

## Wave 0 Requirements

- Existing test infrastructure covers framework and fixtures
- Integration test setup with real PostgreSQL already established (Phase 1)
- Inngest test patterns established (Phase 4)

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Concurrent claim stress test | DAG-08 | Requires real concurrent DB connections | Run stress test script against Docker PostgreSQL |
| Diamond DAG fan-in verification | DAG-06 | Requires Inngest dev server running | Dispatch diamond DAG, verify waits-for gates fire correctly |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
