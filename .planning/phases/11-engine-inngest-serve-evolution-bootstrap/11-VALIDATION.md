---
phase: 11
slug: engine-inngest-serve-evolution-bootstrap
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `packages/api/vitest.config.ts`, `packages/engine/vitest.config.ts` |
| **Quick run command** | `pnpm turbo test` |
| **Full suite command** | `pnpm turbo test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm turbo test`
- **After every plan wave:** Run `pnpm turbo test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | DAG-06..09, EXEC-01..09 | unit | `pnpm --filter @cauldron/api test -- --run` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | EVOL-01..12 | unit | `pnpm --filter @cauldron/api test -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for Inngest serve endpoint registration
- [ ] Test stubs for configureEvolutionDeps bootstrap call

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Inngest dev server discovers engine functions | DAG-06 | Requires running Inngest dev server | Start docker compose, check Inngest dashboard for registered functions |
| Pipeline trigger webhook reaches bead dispatch | EXEC-01 | Requires full stack running | Send webhook event, verify bead dispatch in Inngest UI |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
