---
phase: 06-parallel-execution-engine
plan: "02"
subsystem: execution
tags: [worktree, context-assembly, knowledge-graph, token-budget, git, tdd]
dependency_graph:
  requires: [06-01]
  provides: [WorktreeManager, ContextAssembler, detectTestRunner]
  affects: [06-03, 06-04]
tech_stack:
  added: [simple-git]
  patterns: [git-worktree-isolation, token-budget-trimming, llm-pruning, tdd-red-green]
key_files:
  created:
    - packages/engine/src/execution/worktree-manager.ts
    - packages/engine/src/execution/test-detector.ts
    - packages/engine/src/execution/__tests__/worktree-manager.test.ts
    - packages/engine/src/execution/context-assembler.ts
    - packages/engine/src/execution/__tests__/context-assembler.test.ts
  modified:
    - packages/engine/package.json
    - pnpm-lock.yaml
decisions:
  - "simple-git used for worktree operations via .raw() — thin wrapper around git CLI with TypeScript types"
  - "existsSync idempotency check prevents duplicate worktree creation on reconnect/retry"
  - "Branch pre-deletion before worktree add avoids stale branch conflicts (Research Pitfall 3)"
  - "LLM pruning fallback: if generateObject fails, all candidates returned rather than throwing"
  - "D-23 enforced in buildTestRunner: e2eCommand omitted for beads without UI/API/CLI keywords"
metrics:
  duration: "4 minutes"
  completed_date: "2026-03-26"
  tasks_completed: 2
  files_created: 5
  files_modified: 2
---

# Phase 06 Plan 02: Worktree Isolation and Context Assembly Summary

Git worktree lifecycle management (create/commit/merge/cleanup) and knowledge-graph-driven agent context assembly with 180k token budget enforcement, scoped seed excerpts, and LLM pruning pass.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | WorktreeManager, TestDetector with simple-git | 63a59dc | worktree-manager.ts, test-detector.ts, worktree-manager.test.ts |
| 2 | ContextAssembler with knowledge graph queries and token budget | 9670591 | context-assembler.ts, context-assembler.test.ts |

## What Was Built

### WorktreeManager (`packages/engine/src/execution/worktree-manager.ts`)

Manages git worktree lifecycle for parallel bead execution:
- `createWorktree(beadId)` — creates `.cauldron/worktrees/{beadId}` with `cauldron/bead-{shortId}` branch; idempotent via `existsSync` check; pre-deletes stale branch to avoid conflicts
- `removeWorktree(beadId)` — force-removes worktree, prunes stale references, deletes the branch
- `commitWorktreeChanges(path, message)` — stages all and commits scoped to worktree path, returns commit hash
- `mergeWorktreeToMain(beadId, branch)` — checks out main, merges with `--no-ff`; returns success or conflict info with conflicted file list

### TestDetector (`packages/engine/src/execution/test-detector.ts`)

Identifies the test infrastructure of a target project:
- Priority: (1) `scripts.test` keyword, (2) config file presence (vitest beats jest), (3) devDependencies, (4) default vitest
- Sets `e2eCommand` only when `playwright.config.ts` or `playwright.config.js` exists
- Returns `TestRunnerConfig` with `unitCommand`, `integrationCommand`, `typecheckCommand`

### ContextAssembler (`packages/engine/src/execution/context-assembler.ts`)

Assembles a fully-scoped `AgentContext` for agent execution:
- `assemble()` — full pipeline: extract keywords → search graph → trace call paths → LLM prune → fetch snippets → build seed excerpt → apply token budget
- `extractKeywords(spec, title)` — word frequency analysis with stop word filtering, returns top 15 terms
- `buildSeedExcerpt(seed, coversCriteria)` — goal + all constraints + only matching AC entries (D-09)
- `buildSystemPrompt()` — implementer role, TDD-first instructions, constraints, output format, anti-mocking rules (D-11)
- `applyTokenBudget(context, 180_000)` — priority trimming: distant snippets → signature-only truncation → dependency output truncation (D-10)
- LLM pruning via `gateway.generateObject({ stage: 'context_assembly' })` with Zod schema (D-07)

## Test Coverage

- 11 WorktreeManager/TestDetector tests (mocked simple-git and node:fs)
- 10 ContextAssembler tests (mocked KnowledgeGraphAdapter and LLMGateway)
- Total engine tests after plan: 232 (all passing)
- TypeScript: zero errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test mock missing existsSync=true for package.json check**
- **Found during:** Task 1 GREEN phase
- **Issue:** `detectTestRunner` checks `existsSync(pkgPath)` before reading package.json. Initial tests had `existsSync` mocked to `false` globally, causing `readFileSync` to never be called and defaulting to vitest even for jest tests.
- **Fix:** Updated test cases that test script-based detection to mock `existsSync.mockReturnValueOnce(true)` for the package.json check before the package contents assertion.
- **Files modified:** `packages/engine/src/execution/__tests__/worktree-manager.test.ts`
- **Commit:** Included in 63a59dc

## Self-Check: PASSED

Files verified:
- packages/engine/src/execution/worktree-manager.ts: FOUND
- packages/engine/src/execution/test-detector.ts: FOUND
- packages/engine/src/execution/context-assembler.ts: FOUND
- packages/engine/src/execution/__tests__/worktree-manager.test.ts: FOUND
- packages/engine/src/execution/__tests__/context-assembler.test.ts: FOUND

Commits verified:
- 63a59dc: feat(06-02): WorktreeManager, TestDetector with simple-git — FOUND
- 9670591: feat(06-02): ContextAssembler with knowledge graph queries and token budget — FOUND
