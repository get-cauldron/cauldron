---
phase: 20
slug: operator-controls-end-to-end-validation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-01
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 |
| **Config file** | `packages/engine/vitest.config.ts` |
| **Quick run command** | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/settings-enforcement.test.ts` |
| **Full suite command** | `pnpm test` (unit) + `pnpm test:integration` (Docker Postgres) |
| **Estimated runtime** | ~15 seconds (unit), ~45 seconds (integration) |

---

## Sampling Rate

- **After every task commit:** Run relevant unit test file
- **After every plan wave:** Run `pnpm typecheck && pnpm test && pnpm build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | OPS-01 | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/settings-enforcement.test.ts` | ❌ W0 | ⬜ pending |
| 20-01-02 | 01 | 1 | OPS-02 | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/settings-enforcement.test.ts` | ❌ W0 | ⬜ pending |
| 20-02-01 | 02 | 1 | OPS-01 | unit | `pnpm -F @get-cauldron/cli test -- src/commands/config.test.ts` | ❌ W0 | ⬜ pending |
| 20-02-02 | 02 | 1 | OPS-01 | unit | `pnpm -F @get-cauldron/web test -- src/trpc/routers/projects.test.ts` | ❌ W0 | ⬜ pending |
| 20-03-01 | 03 | 2 | OPS-03 | integration | `pnpm test:integration` | ❌ W0 | ⬜ pending |
| 20-03-02 | 03 | 2 | OPS-03 | unit | `pnpm -F @get-cauldron/cli test -- src/commands/verify.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/engine/src/asset/__tests__/settings-enforcement.test.ts` — stubs for OPS-01/OPS-02 mode and concurrency enforcement
- [ ] `packages/engine/src/asset/__tests__/e2e-pipeline.integration.test.ts` — stubs for OPS-03 full wiring path
- [ ] `packages/cli/src/commands/config.test.ts` — stubs for `config set` key parsing and tRPC call
- [ ] `packages/cli/src/commands/verify.test.ts` — stubs for `verify assets` output and exit codes

*Existing infrastructure covers test framework setup; only new test files needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full pipeline with real ComfyUI | OPS-03 | Requires GPU hardware + running ComfyUI container | Run `cauldron verify assets --real` with docker compose up |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
