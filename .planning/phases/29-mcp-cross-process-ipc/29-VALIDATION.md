---
phase: 29
slug: mcp-cross-process-ipc
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 |
| **Config file** | `packages/engine/vitest.config.ts`, `packages/mcp/vitest.config.ts` |
| **Quick run command** | `pnpm -F @get-cauldron/engine test -- src/asset/__tests__/ipc-publisher.test.ts` |
| **Full suite command** | `pnpm -F @get-cauldron/engine test && pnpm -F @get-cauldron/mcp test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command for the relevant package
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 12 seconds

---

## Wave 0 Requirements

- [ ] `packages/engine/src/asset/__tests__/ipc-publisher.test.ts` — stubs for ARCH-01 (publish, error handling)
- [ ] `packages/mcp/src/__tests__/ipc-subscriber.test.ts` — stubs for ARCH-01 (subscribe, callback, error handling)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cross-process message delivery | ARCH-01 | Requires two running processes + Redis | Start Inngest worker + MCP server, trigger asset job, verify MCP receives push notification |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 12s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
