---
phase: 9
slug: cli
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `packages/api/vitest.config.ts` (existing) |
| **Quick run command** | `pnpm --filter @cauldron/api test` |
| **Full suite command** | `pnpm turbo test --filter=@cauldron/api` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @cauldron/api test`
- **After every plan wave:** Run `pnpm turbo test --filter=@cauldron/api`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | CLI-01 | integration | `pnpm --filter @cauldron/api test` | TBD | ⬜ pending |
| TBD | TBD | TBD | CLI-02 | integration | `pnpm --filter @cauldron/api test` | TBD | ⬜ pending |
| TBD | TBD | TBD | CLI-03 | unit | `pnpm --filter @cauldron/api test` | TBD | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/trpc-types/` — New package exporting AppRouter type
- [ ] `packages/api/src/trpc-client.ts` — tRPC HTTP client setup

*Existing test infrastructure in packages/api is sufficient.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Interactive interview in terminal | CLI-01 | Requires running LLM engine and terminal interaction | Run `cauldron interview <project-id>`, answer questions, verify MC options display |
| Git push triggers pipeline | CLI-02 | Requires GitHub webhook delivery | Configure webhook on test repo, push a commit, verify pipeline starts |
| Streaming logs output | CLI-01 | Requires active bead execution and SSE | Run `cauldron logs <project-id>` during execution, verify colored prefixed output |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
