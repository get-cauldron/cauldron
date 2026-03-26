---
phase: 06-parallel-execution-engine
plan: 01
subsystem: intelligence
tags: [codebase-memory-mcp, knowledge-graph, child_process, execution-types, gateway, pipeline-stage]

# Dependency graph
requires:
  - phase: 05-dag-decomposition-scheduler
    provides: BeadDispatchPayload, ClaimResult, decomposition pipeline entry point
  - phase: 02-llm-gateway
    provides: LLMGateway, PipelineStage, GatewayConfig, STAGE_PREAMBLES
provides:
  - KnowledgeGraphAdapter class wrapping codebase-memory-mcp CLI with 5 typed methods
  - GraphSearchResult, TraceResult, DetectChangesResult, IndexResult, CodeSnippetResult types
  - AgentContext, ExecutionResult, TddLoopOptions, MergeResult, WorktreeInfo, MergeQueueEntry, TestRunnerConfig, TimeoutConfig, TokenBudget execution domain types
  - PipelineStage extended with context_assembly and conflict_resolution
  - STAGE_PREAMBLES entries for context_assembly and conflict_resolution
  - cauldron.config.ts model chains for both new stages
affects: [06-02, 06-03, 06-04, 06-05, context-assembly, worktree-manager, tdd-loop, merge-queue]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mock-friendly exec wrapper: custom execPromise() wraps child_process.exec to avoid promisify.custom symbol divergence between real and mocked exec"
    - "Tmp-file args pattern: JSON args written to temp file before exec to avoid shell injection"
    - "Double-parse MCP envelope: JSON.parse(stdout) -> check isError -> JSON.parse(content[0].text)"

key-files:
  created:
    - packages/engine/src/intelligence/types.ts
    - packages/engine/src/intelligence/adapter.ts
    - packages/engine/src/intelligence/__tests__/adapter.test.ts
    - packages/engine/src/execution/types.ts
  modified:
    - packages/engine/src/gateway/types.ts
    - packages/engine/src/gateway/gateway.ts
    - cauldron.config.ts
    - packages/shared/src/db/schema/project.ts
    - packages/engine/src/gateway/__tests__/gateway.test.ts

key-decisions:
  - "execPromise() custom wrapper instead of promisify(exec): real exec has util.promisify.custom symbol that changes resolution shape to {stdout,stderr}; mocked exec does not, causing promisify to resolve with just stdout string, breaking destructuring"
  - "ProjectSettings.models typed as Partial<Record<string, string[]>> instead of hardcoded stage union: avoids circular dependency (shared->engine) and allows new stages without shared package changes"
  - "KnowledgeGraphAdapter uses tmp file for args (not shell-escaped inline JSON) to prevent shell injection when special characters appear in repo paths or search patterns"

patterns-established:
  - "Pattern: KnowledgeGraphAdapter is project-agnostic via repoPath constructor param; dual instantiation (target project + Cauldron engine) wired in Plan 05 configureSchedulerDeps extension"
  - "Pattern: All intelligence module imports use .js extensions per Node16 moduleResolution"

requirements-completed: [CODE-01, CODE-02, CODE-04]

# Metrics
duration: 6min
completed: 2026-03-26
---

# Phase 6 Plan 1: Foundation Layer Summary

**KnowledgeGraphAdapter wrapping codebase-memory-mcp CLI via tmp-file exec pattern, 9 execution domain types for parallel agent coordination, and PipelineStage extended with context_assembly/conflict_resolution stages**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-26T16:14:44Z
- **Completed:** 2026-03-26T16:20:08Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- KnowledgeGraphAdapter with 5 typed methods (indexRepository, searchGraph, traceCallPath, getCodeSnippet, detectChanges) wrapping codebase-memory-mcp CLI via child_process.exec with tmp-file arg pattern
- 11 unit tests verifying double-parse MCP envelope, project name derivation, all public methods, and error handling
- Full execution domain type set: AgentContext, ExecutionResult, TddLoopOptions, MergeResult, WorktreeInfo, MergeQueueEntry, TestRunnerConfig, TimeoutConfig, TokenBudget
- PipelineStage extended with context_assembly and conflict_resolution; STAGE_PREAMBLES and cauldron.config.ts updated to match

## Task Commits

Each task was committed atomically:

1. **Task 1: Define intelligence types and build KnowledgeGraphAdapter with tests** - `b8e9bb6` (feat)
2. **Task 2: Define execution types, extend gateway stages, update config** - `7b1f7d3` (feat)

**Plan metadata:** (see final commit hash after docs commit)

_Note: Task 1 used TDD — RED (test first, import fails) then GREEN (adapter implemented, 11/11 pass)_

## Files Created/Modified

- `packages/engine/src/intelligence/types.ts` - GraphSearchResult, TraceResult, DetectChangesResult, IndexResult, CodeSnippetResult interfaces
- `packages/engine/src/intelligence/adapter.ts` - KnowledgeGraphAdapter class with 5 public methods, custom execPromise wrapper, tmp-file arg pattern
- `packages/engine/src/intelligence/__tests__/adapter.test.ts` - 11 unit tests with mocked child_process and fs
- `packages/engine/src/execution/types.ts` - 9 execution domain type interfaces for Phase 6 plans
- `packages/engine/src/gateway/types.ts` - PipelineStage extended with context_assembly | conflict_resolution
- `packages/engine/src/gateway/gateway.ts` - STAGE_PREAMBLES entries for both new stages
- `cauldron.config.ts` - model chains for context_assembly (gpt-4o-mini) and conflict_resolution (claude-sonnet-4-6)
- `packages/shared/src/db/schema/project.ts` - ProjectSettings.models broadened to Partial<Record<string, string[]>>
- `packages/engine/src/gateway/__tests__/gateway.test.ts` - testConfig updated with new stages (auto-fix)

## Decisions Made

- **execPromise() custom wrapper instead of promisify(exec):** Node.js real `exec` has `util.promisify.custom` symbol that resolves `{stdout, stderr}` — but vi.mock-ed exec doesn't, so promisify resolves with just the stdout string. Custom wrapper eliminates this divergence.
- **ProjectSettings.models as Partial<Record<string, string[]>>:** Avoiding circular dependency (shared package importing from engine package) while still supporting per-project overrides for any pipeline stage including new ones.
- **Tmp-file arg pattern:** Writing JSON args to a temp file before exec avoids shell injection when repo paths or search patterns contain special characters.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed gateway test fixture missing new PipelineStage entries**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** `gateway.test.ts` testConfig `models` typed as `Record<PipelineStage, string[]>` but only had 5 entries; `context_assembly` and `conflict_resolution` were missing after PipelineStage extension
- **Fix:** Added `context_assembly: ['gpt-4o-mini', 'gpt-4o']` and `conflict_resolution: ['claude-sonnet-4-6', 'gpt-4o']` to testConfig
- **Files modified:** `packages/engine/src/gateway/__tests__/gateway.test.ts`
- **Verification:** `tsc --noEmit` passes, all 211 tests pass
- **Committed in:** `7b1f7d3` (Task 2 commit)

**2. [Rule 1 - Bug] Broadened ProjectSettings.models type in shared package**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** `ProjectSettings.models` had hardcoded `'interview' | 'holdout' | 'implementation' | 'evaluation' | 'decomposition'` union — TS2739 error because PipelineStage now includes new stages but `this.projectSettings?.models?.[stage]` couldn't index with the extended type
- **Fix:** Changed to `Partial<Record<string, string[]>>` — preserves per-project override semantics, eliminates circular dependency risk, allows any stage
- **Files modified:** `packages/shared/src/db/schema/project.ts`
- **Verification:** `tsc --noEmit` passes, all 211 tests pass
- **Committed in:** `7b1f7d3` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - type correctness bugs revealed by TypeScript compilation)
**Impact on plan:** Both fixes essential for TypeScript correctness. No scope creep.

## Issues Encountered

- **execPromise vs promisify divergence:** First implementation used `promisify(childProcess.exec)` — tests failed with `"undefined" is not valid JSON`. Root cause: real `exec` has `util.promisify.custom` returning `{stdout, stderr}`, but mocked exec does not, so standard promisify resolves with just the stdout string. Destructuring `{ stdout }` from a string yields undefined. Fixed by writing a manual `execPromise()` wrapper using `new Promise((resolve, reject) => exec(cmd, (err, stdout) => ...))`.

## Next Phase Readiness

- KnowledgeGraphAdapter ready for Plan 02 (ContextAssembler) to query the knowledge graph
- Execution domain types exported and available for Plans 02-05 to import
- PipelineStage extended; gateway can route LLM calls to context_assembly and conflict_resolution models
- No blockers for Phase 6 continuation

---
*Phase: 06-parallel-execution-engine*
*Completed: 2026-03-26*
