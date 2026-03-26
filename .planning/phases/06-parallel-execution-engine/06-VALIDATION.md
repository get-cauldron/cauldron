---
phase: 6
slug: parallel-execution-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `packages/engine/vitest.config.ts` (unit) + `packages/engine/vitest.integration.config.ts` (integration) |
| **Quick run command** | `pnpm --filter @cauldron/engine test` |
| **Full suite command** | `pnpm --filter @cauldron/engine test && pnpm --filter @cauldron/engine test:integration` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @cauldron/engine test`
- **After every plan wave:** Run `pnpm --filter @cauldron/engine test && pnpm --filter @cauldron/engine test:integration && pnpm -r build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | CODE-01 | unit | `vitest run src/intelligence/__tests__/adapter.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | CODE-02 | unit | `vitest run src/intelligence/__tests__/adapter.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | CODE-03 | integration | `vitest run --config vitest.integration.config.ts` | ❌ W0 | ⬜ pending |
| 06-01-04 | 01 | 1 | CODE-04 | unit | `vitest run src/intelligence/__tests__/adapter.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 1 | EXEC-02 | unit | `vitest run src/execution/__tests__/worktree-manager.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 1 | EXEC-04 | unit | `vitest run src/execution/__tests__/context-assembler.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-03 | 02 | 1 | EXEC-05 | unit | `vitest run src/execution/__tests__/agent-runner.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-04 | 02 | 1 | EXEC-06 | unit | `vitest run src/execution/__tests__/merge-queue.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-05 | 02 | 1 | EXEC-09 | unit | `vitest run src/execution/__tests__/timeout-supervisor.test.ts` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 2 | TEST-06 | integration | `vitest run --config vitest.integration.config.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/engine/src/intelligence/__tests__/adapter.test.ts` — stubs for CODE-01, CODE-02, CODE-04; mocks `child_process.exec`
- [ ] `packages/engine/src/execution/__tests__/worktree-manager.test.ts` — stubs for EXEC-02; mocks `simple-git`
- [ ] `packages/engine/src/execution/__tests__/context-assembler.test.ts` — stubs for EXEC-04; mocks `KnowledgeGraphAdapter`
- [ ] `packages/engine/src/execution/__tests__/agent-runner.test.ts` — stubs for EXEC-05; mocks `LLMGateway`
- [ ] `packages/engine/src/execution/__tests__/merge-queue.test.ts` — stubs for EXEC-06
- [ ] `packages/engine/src/execution/__tests__/timeout-supervisor.test.ts` — stubs for EXEC-09
- [ ] `packages/engine/src/intelligence/adapter.integration.test.ts` — stubs for CODE-03; requires live `codebase-memory-mcp` binary + real git repo

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cross-worktree isolation | EXEC-01 | Requires multiple concurrent processes with real filesystem | Start 2 bead executions, verify no file leakage between worktrees |
| LLM conflict resolution quality | EXEC-07 | Subjective quality of merge conflict resolution | Create intentional conflict, verify LLM resolution is semantically correct |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
