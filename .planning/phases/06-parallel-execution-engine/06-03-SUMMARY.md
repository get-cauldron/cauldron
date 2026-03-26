---
phase: 06-parallel-execution-engine
plan: 03
subsystem: execution
tags: [agent, tdd, self-healing, timeout, vitest, execution-loop]

requires:
  - phase: 06-02
    provides: WorktreeManager with commitWorktreeChanges, ContextAssembler, KnowledgeGraphAdapter
  - phase: 02-llm-gateway
    provides: LLMGateway.generateText for agent implementation calls

provides:
  - AgentRunner with runWithTddLoop: TDD self-healing loop generating tests first, then implementation, retrying on failures
  - TimeoutSupervisor with idle/soft/hard timeout thresholds and configurable callbacks
  - writeAgentOutput with EXEC-08 worktree scope validation
  - runVerification running all three test levels (unit, integration, E2E where applicable)

affects: [06-04, 06-05, bead-dispatch-handler, inngest-workers]

tech-stack:
  added: []
  patterns:
    - "AgentRunner: gateway.generateText for agent LLM calls (not streaming — implementation requires complete response)"
    - "execPromise: manual callback wrapper instead of promisify(exec) — avoids mock destructuring undefined in tests"
    - "vi.hoisted() for mock factories in vitest when vi.mock factory uses outer variables"
    - "exec callback signature (err, stdout: string, stderr: string) — NOT (err, {stdout, stderr})"

key-files:
  created:
    - packages/engine/src/execution/agent-runner.ts
    - packages/engine/src/execution/timeout-supervisor.ts
    - packages/engine/src/execution/__tests__/agent-runner.test.ts
    - packages/engine/src/execution/__tests__/timeout-supervisor.test.ts
  modified: []

key-decisions:
  - "execPromise uses manual Promise wrapper (not promisify) because test mocks don't carry util.promisify.custom — same pattern established in Phase 06-01"
  - "parseCodeBlocks regex requires file extension in path comment to avoid false positives from freeform LLM prose"
  - "ESCAPE_RESPONSE test uses .ts extension (../../etc/malicious.ts) because path traversal check works on any extension — regex filters non-file comments"
  - "exec callback is (err, stdout: string, stderr: string) — test mocks must call cb(err, stdoutStr, stderrStr) not cb(err, {stdout, stderr})"

patterns-established:
  - "TDD loop pattern: agentGenerateTests (iteration 0 only) -> agentGenerateImplementation -> commit -> runVerification -> iterate"
  - "Anti-mocking directive injected into every agent system prompt call"
  - "Worktree scope validation: resolve(join(worktreePath, filePath)).startsWith(resolve(worktreePath))"
  - "TimeoutSupervisor pattern: start/stop lifecycle, recordActivity() resets idle, all timers cleared on stop()"

requirements-completed: [EXEC-01, EXEC-03, EXEC-05, EXEC-09, TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06]

duration: 6min
completed: 2026-03-26
---

# Phase 6 Plan 3: Agent Execution Loop and Timeout Supervisor Summary

**TDD self-healing agent loop (tests-first, up to 5 retries with error feedback, worktree scope enforcement) plus configurable idle/soft/hard timeout supervisor**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-26T16:29:21Z
- **Completed:** 2026-03-26T16:34:52Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- AgentRunner.runWithTddLoop orchestrates the full TDD cycle: generates tests first (iteration 0), then implementation, commits after each iteration, runs all verification levels, passes error output back on failure, up to maxIterations (default 5)
- writeAgentOutput validates every file path against the worktree scope using resolve() path prefix check (EXEC-08 security requirement)
- TimeoutSupervisor tracks idle/soft/hard thresholds with configurable callbacks; stop() clears all timers; recordActivity() resets idle timer and clears idle_warning status
- 23 new tests across both files (12 for AgentRunner, 11 for TimeoutSupervisor); all 268 engine unit tests pass

## Task Commits

1. **Task 1: AgentRunner with TDD self-healing loop** - `5dd70f6` (feat)
2. **Task 2: TimeoutSupervisor with idle/soft/hard timeout tracking** - `f547305` (feat)

## Files Created/Modified

- `packages/engine/src/execution/agent-runner.ts` — AgentRunner class with runWithTddLoop, agentGenerateTests, agentGenerateImplementation, runVerification, writeAgentOutput, parseCodeBlocks
- `packages/engine/src/execution/timeout-supervisor.ts` — TimeoutSupervisor class with start/stop lifecycle, recordActivity, three timer thresholds
- `packages/engine/src/execution/__tests__/agent-runner.test.ts` — 12 unit tests covering TDD loop, error retry, scope validation, E2E gating, filesModified
- `packages/engine/src/execution/__tests__/timeout-supervisor.test.ts` — 11 unit tests covering all timeout thresholds, state transitions, custom config

## Decisions Made

- `execPromise` uses a manual Promise wrapper (not `util.promisify`) — same pattern from Phase 06-01 STATE.md note; test mocks don't carry `util.promisify.custom` so promisify would yield `undefined` on destructure
- `parseCodeBlocks` requires a recognized file extension in the path comment line (`// path/to/file.ts`) to avoid capturing freeform LLM prose as code blocks; path traversal validation happens independently via `resolve()` scope check
- exec callback is `(err, stdout: string, stderr: string)` — not `(err, { stdout, stderr })`; test mocks call `cb(null, stdoutStr, stderrStr)` accordingly
- `vi.hoisted()` required for mock variables referenced in `vi.mock()` factory functions — hoisting is Vitest's behavior, variables declared before `vi.mock()` are not yet initialized at evaluation time

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test mock callback signature for exec**
- **Found during:** Task 1 (agent-runner tests, GREEN phase)
- **Issue:** Test helpers passed `cb(null, { stdout, stderr })` (an object) but real exec callback signature is `(err, stdout: string, stderr: string)` — caused `filesModified` test to return empty array
- **Fix:** Updated `execSuccess()` and `execFail()` helpers and all manual exec mocks to call `cb(err, stdoutStr, stderrStr)` directly
- **Files modified:** packages/engine/src/execution/__tests__/agent-runner.test.ts
- **Verification:** All 12 agent-runner tests pass
- **Committed in:** 5dd70f6 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed path traversal test to use .ts extension**
- **Found during:** Task 1 (path escape test, GREEN phase)
- **Issue:** Test used `// ../../etc/passwd` (no extension) but parseCodeBlocks regex requires a file extension — path was never parsed, no error thrown
- **Fix:** Changed test escape path to `// ../../etc/malicious.ts`; path traversal check is agnostic to extension (uses resolve() scope check)
- **Files modified:** packages/engine/src/execution/__tests__/agent-runner.test.ts
- **Verification:** scope violation test now correctly expects rejection
- **Committed in:** 5dd70f6 (Task 1 commit)

**3. [Rule 1 - Bug] Fixed vi.mock() variable hoisting issue**
- **Found during:** Task 1 (RED phase — suite error, not test failure)
- **Issue:** `mockExec = vi.fn()` declared before `vi.mock()` but Vitest hoists `vi.mock()` to file top — `mockExec` not yet initialized when factory runs
- **Fix:** Wrapped mock variables in `vi.hoisted()` to ensure they're initialized before mock factory evaluation
- **Files modified:** packages/engine/src/execution/__tests__/agent-runner.test.ts
- **Verification:** Test suite loads without `ReferenceError: Cannot access before initialization`
- **Committed in:** 5dd70f6 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 bugs in test setup)
**Impact on plan:** All fixes required for test correctness; no scope change.

## Issues Encountered

None beyond the auto-fixed mock issues above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- AgentRunner ready for integration into bead dispatch handler (Phase 06-04)
- TimeoutSupervisor ready to be instantiated alongside AgentRunner in the execution worker
- Both classes expect dependency injection (LLMGateway, WorktreeManager) — ready for Inngest function composition

## Self-Check: PASSED

- FOUND: packages/engine/src/execution/agent-runner.ts
- FOUND: packages/engine/src/execution/timeout-supervisor.ts
- FOUND: packages/engine/src/execution/__tests__/agent-runner.test.ts
- FOUND: packages/engine/src/execution/__tests__/timeout-supervisor.test.ts
- FOUND: .planning/phases/06-parallel-execution-engine/06-03-SUMMARY.md
- FOUND commit: 5dd70f6
- FOUND commit: f547305

---
*Phase: 06-parallel-execution-engine*
*Completed: 2026-03-26*
