---
phase: 18
slug: async-asset-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 |
| **Config file** | `packages/engine/vitest.config.ts` |
| **Quick run command** | `pnpm -F @get-cauldron/engine test -- src/asset` |
| **Full suite command** | `pnpm -F @get-cauldron/engine test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -F @get-cauldron/engine test -- src/asset`
- **After every plan wave:** Run `pnpm -F @get-cauldron/engine test && pnpm typecheck && pnpm build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | ASSET-01 | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/job-store.test.ts` | W0 | pending |
| 18-01-02 | 01 | 1 | ASSET-01 | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/job-store.test.ts` | W0 | pending |
| 18-01-03 | 01 | 1 | ASSET-02 | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/job-store.test.ts` | W0 | pending |
| 18-02-01 | 02 | 1 | ASSET-02, ASSET-03 | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/events.test.ts` | W0 | pending |
| 18-02-02 | 02 | 1 | ASSET-05 | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/events.test.ts` | W0 | pending |
| 18-03-01 | 03 | 1 | ASSET-04 | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/comfyui-adapter.test.ts` | W0 | pending |
| 18-03-02 | 03 | 1 | ASSET-04 | unit | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/artifact-writer.test.ts` | W0 | pending |

*Status: pending / green / red / flaky*

**Note:** Integration tests (`job-store.integration.test.ts`) are deferred to Phase 19 when the full stack is available with real Postgres + ComfyUI. Phase 18 validates behavior through unit tests with mocked dependencies. The unit test coverage across Plans 01-03 covers all ASSET-01 through ASSET-05 requirements at the function level.

---

## Wave 0 Requirements

- [ ] `packages/engine/src/asset/__tests__/job-store.test.ts` — stubs for ASSET-01, ASSET-02, ASSET-04, ASSET-05
- [ ] `packages/engine/src/asset/__tests__/events.test.ts` — stubs for ASSET-02, ASSET-03, ASSET-05
- [ ] `packages/engine/src/asset/__tests__/artifact-writer.test.ts` — stubs for ASSET-04
- [ ] `packages/engine/src/asset/__tests__/comfyui-adapter.test.ts` — ComfyUI HTTP adapter unit tests with mocked fetch

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ComfyUI Docker service starts and accepts requests | ASSET-01 | Requires GPU hardware or CPU fallback runtime | Run `docker compose up -d comfyui` and verify `curl http://localhost:8188/system_stats` returns 200 |
| FLUX.2 workflow template produces correct output | ASSET-04 | Requires FLUX.2 model loaded in ComfyUI (Phase 19) | Submit template via ComfyUI API and verify image output |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
