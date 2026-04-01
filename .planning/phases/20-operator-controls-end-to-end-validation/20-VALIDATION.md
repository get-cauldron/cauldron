---
phase: 20
slug: operator-controls-end-to-end-validation
status: draft
nyquist_compliant: true
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
| 20-01-01 | 01 | 1 | OPS-01 | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/settings-enforcement.test.ts` | W0 | pending |
| 20-01-02 | 01 | 1 | OPS-02 | unit + behavioral | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/settings-enforcement.test.ts && pnpm -F @get-cauldron/mcp test -- src/__tests__/generate-image-enforcement.test.ts` | W0 | pending |
| 20-02-01 | 02 | 2 | OPS-03 | typecheck | `pnpm typecheck` | n/a | pending |
| 20-02-02 | 02 | 2 | OPS-03 | integration | `pnpm test:integration -- src/asset/__tests__/e2e-pipeline.integration.test.ts` | W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `packages/engine/src/asset/__tests__/settings-enforcement.test.ts` — stubs for OPS-01/OPS-02 mode and concurrency enforcement
- [ ] `packages/engine/src/asset/__tests__/e2e-pipeline.integration.test.ts` — stubs for OPS-03 full wiring path including style/seed provenance
- [ ] `packages/mcp/src/__tests__/generate-image-enforcement.test.ts` — stubs for MCP enforcement wiring (active/paused/disabled mode branching)

*Existing infrastructure covers test framework setup; only new test files needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full pipeline with real ComfyUI | OPS-03 | Requires GPU hardware + running ComfyUI container | Run `cauldron verify assets --real` with docker compose up |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
