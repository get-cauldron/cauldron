---
phase: 14
slug: wire-interview-start-fix-seed-crystallization-path
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `packages/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @get-cauldron/web exec vitest run` |
| **Full suite command** | `pnpm --filter @get-cauldron/web exec vitest run && pnpm --filter @get-cauldron/cli exec vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @get-cauldron/web exec vitest run`
- **After every plan wave:** Run `pnpm --filter @get-cauldron/web exec vitest run && pnpm --filter @get-cauldron/cli exec vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | SEED-01, SEED-02 | unit | `pnpm --filter @get-cauldron/web exec vitest run src/trpc/routers/__tests__/interview-engine` | ✅ (extend) | ⬜ pending |
| 14-01-02 | 01 | 1 | SEED-01 | unit | `pnpm --filter @get-cauldron/web exec vitest run src/trpc/routers/__tests__/interview-engine` | ✅ (add tests) | ⬜ pending |
| 14-02-01 | 02 | 2 | WEB-01 | unit | `pnpm --filter @get-cauldron/web exec vitest run src/app/projects` | ❌ W0 | ⬜ pending |
| 14-02-02 | 02 | 2 | CLI-01 | unit | `pnpm --filter @get-cauldron/cli exec vitest run src/commands/__tests__/interview` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Extend `packages/web/src/trpc/routers/__tests__/interview-engine.test.ts` — add `startInterview` and `approveSummary` crystallizeSeed tests
- [ ] `packages/web/src/app/projects/[id]/interview/__tests__/page.test.tsx` — covers WEB-01 (startInterview auto-call on mount)
- [ ] `packages/cli/src/commands/__tests__/interview.test.ts` — covers CLI-01 (startInterview for new projects)

*Existing infrastructure covers test framework — only test files/cases need creating.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SSE receives seed_crystallized event | SC-6 | Requires running SSE stream and observing live events | Start SSE client for a project, crystallize a seed, verify event appears in stream |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
