---
phase: 12
slug: security-tech-debt-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `packages/web/vitest.config.ts`, `packages/api/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @cauldron/web exec vitest run` |
| **Full suite command** | `pnpm --filter @cauldron/web exec vitest run && pnpm --filter @cauldron/cli exec vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter <affected-package> exec vitest run`
- **After every plan wave:** Run `pnpm --filter @cauldron/web exec vitest run && pnpm --filter @cauldron/cli exec vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | SC-1 (SSE auth) | unit | `pnpm --filter @cauldron/web exec vitest run src/app/api/events` | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 1 | SC-2 (--project-id) | unit | `pnpm --filter @cauldron/cli exec vitest run src/__tests__/kill` | ❌ W0 | ⬜ pending |
| 12-01-03 | 01 | 1 | SC-3 (VERIFICATION.md) | manual | N/A | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/web/src/app/api/events/__tests__/route.test.ts` — SSE auth gate tests (401 with wrong key, 200 in dev mode)
- [ ] `packages/api/src/__tests__/kill-project-id-flag.test.ts` — `--project-id` flag precedence tests

*Existing infrastructure covers test framework — only test files need creating.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| VERIFICATION.md status matches | SC-3 | Documentation file, not runtime code | Read `.planning/phases/09-cli/09-VERIFICATION.md` — confirm frontmatter `status: passed` and body `**Status:** passed` agree |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
