---
phase: 22
slug: schema-migrations-integrity-indexes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-01
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/shared/vitest.config.ts` |
| **Quick run command** | `pnpm -F @get-cauldron/shared test -- --grep "event-sourcing\|constraint"` |
| **Full suite command** | `pnpm -F @get-cauldron/shared test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -F @get-cauldron/shared test -- --grep "event-sourcing\|constraint"`
- **After every plan wave:** Run `pnpm -F @get-cauldron/shared test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 0 | DATA-01 | integration | `pnpm -F @get-cauldron/shared test:integration -- --grep "constraint"` | ❌ W0 | ⬜ pending |
| 22-01-02 | 01 | 0 | DATA-03 | integration | `pnpm -F @get-cauldron/shared test:integration -- --grep "seed version"` | ❌ W0 | ⬜ pending |
| 22-02-01 | 02 | 1 | DATA-01 | migration | `pnpm db:migrate` | ✅ | ⬜ pending |
| 22-02-02 | 02 | 1 | DATA-02 | migration | `pnpm db:migrate` | ✅ | ⬜ pending |
| 22-02-03 | 02 | 1 | DATA-03 | migration | `pnpm db:migrate` | ✅ | ⬜ pending |
| 22-02-04 | 02 | 1 | DATA-04 | migration | `pnpm db:migrate` | ✅ | ⬜ pending |
| 22-03-01 | 03 | 2 | DATA-01 | integration | `pnpm -F @get-cauldron/shared test:integration` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/shared/src/db/__tests__/constraint-violations.integration.test.ts` — stubs for DATA-01 (event sequence unique violation) and DATA-03 (seed version unique violation)
- [ ] Test for appendEvent retry-on-conflict behavior after UNIQUE constraint

*Existing event-sourcing.integration.test.ts covers basic append/replay but NOT constraint violations.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Index scan verification | DATA-02, DATA-04 | Requires EXPLAIN ANALYZE on real DB | Run `EXPLAIN ANALYZE SELECT ... FROM events WHERE project_id = X ORDER BY sequence_number` and verify "Index Scan" in output |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
