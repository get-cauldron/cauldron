---
phase: 15
slug: wire-holdout-generation-fix-cli-run
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | packages/web/vitest.config.ts, packages/cli/vitest.config.ts |
| **Quick run command** | `pnpm -F @get-cauldron/web test --run src/trpc/routers/__tests__/interview-engine.test.ts` |
| **Full suite command** | `pnpm test && pnpm typecheck` |
| **Estimated runtime** | ~5 seconds (quick), ~15 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm typecheck`
- **After every plan wave:** Run `pnpm test && pnpm typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | HOLD-01, HOLD-02, HOLD-03 | unit | `pnpm -F @get-cauldron/web test --run src/trpc/routers/__tests__/interview-engine.test.ts` | ✅ | ⬜ pending |
| 15-01-02 | 01 | 1 | WEB-05 | typecheck | `pnpm -F @get-cauldron/web exec tsc --noEmit` | ✅ | ⬜ pending |
| 15-02-01 | 02 | 2 | CLI-01 | unit | `pnpm -F @get-cauldron/cli test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files or fixtures needed — extending existing test suites.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Holdout cards appear in web interview page after crystallization | WEB-05 | Requires running Next.js dev server with real DB and LLM API keys | Create project, complete interview, approve summary, verify holdout cards appear |
| `cauldron run` completes full pipeline | CLI-01 | Requires running Docker stack + Inngest + LLM APIs | Run `cauldron run --project <id>` and observe completion through all stages |
| Cross-model diversity active during holdout generation | LLM-06 | Requires observing actual LLM gateway calls | Verify gateway log shows different provider for holdout vs interview stage |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
