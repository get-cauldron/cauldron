# Deferred Items — Phase 06

Items discovered during execution that are out-of-scope for the current task.

## Pre-existing Test Failures (agent-runner.test.ts)

**Discovered during:** 06-04 task 1
**Status:** Pre-existing before 06-04 changes (verified via git stash)

Two failing tests in `packages/engine/src/execution/__tests__/agent-runner.test.ts`:
1. `throws error when agent attempts to write outside worktree scope` — test expects rejection but gets successful resolution
2. `populates filesModified from git diff output after successful verification` — git diff mock not returning expected file list

These failures were present in commit `4336129` before any 06-04 work. They appear to be 06-03 (agent-runner) test issues that were left unresolved.

**Action needed:** Fix agent-runner.test.ts tests before the full engine test suite can report clean.
