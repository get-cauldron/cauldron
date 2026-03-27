---
phase: 10-wire-trpc-mutations-to-engine
plan: "01"
subsystem: web/trpc
tags: [trpc, interview, fsm, engine, wiring]
dependency_graph:
  requires:
    - packages/engine/src/interview/fsm.ts (InterviewFSM.submitAnswer)
    - packages/engine/src/gateway/gateway.ts (LLMGateway.create)
    - packages/engine/src/gateway/config.ts (loadConfig)
  provides:
    - packages/web/src/trpc/engine-deps.ts (getEngineDeps lazy factory)
    - packages/web/src/trpc/init.ts (extended context with getEngineDeps)
    - packages/web/src/trpc/routers/interview.ts (sendAnswer wired to FSM)
  affects:
    - All tRPC mutations that need engine dependencies (future plans can call ctx.getEngineDeps())
tech_stack:
  added: []
  patterns:
    - Lazy module-level caching for expensive async singletons (gateway/config)
    - Structural logger type to avoid transitive pino dependency in web package
    - vi.fn(function(){}) pattern for constructor mocks in Vitest
key_files:
  created:
    - packages/web/src/trpc/engine-deps.ts
    - packages/web/src/trpc/routers/__tests__/interview-engine.test.ts
  modified:
    - packages/web/src/trpc/init.ts
    - packages/web/src/trpc/routers/interview.ts
decisions:
  - Local Logger structural type (not pino import) in engine-deps.ts — keeps pino out of web package dep surface; cast to any at LLMGateway.create boundary
  - logger return type from getEngineDeps is `any` — avoids pino's BaseLogger.level/silent/msgPrefix requirements without adding pino as a web dependency
  - vi.fn(function(){}) for MockInterviewFSM — arrow functions cannot be used as constructors in Vitest
metrics:
  duration: "4min"
  completed: "2026-03-27T16:11:35Z"
  tasks_completed: 2
  files_changed: 4
---

# Phase 10 Plan 01: Wire tRPC sendAnswer to InterviewFSM Summary

**One-liner:** Extended tRPC context with lazy LLMGateway/config/logger factory, wired sendAnswer mutation to InterviewFSM.submitAnswer() replacing the DB-only stub.

## What Was Built

### Task 1: Engine-deps factory and tRPC context extension

Created `packages/web/src/trpc/engine-deps.ts` — a lazy singleton factory for the engine's runtime dependencies:

- `getEngineDeps()`: async function that initializes (once) a LLMGateway, GatewayConfig, and console logger. Subsequent calls return the cached instances.
- `makeConsoleLogger()`: returns a structurally pino-compatible logger backed by console methods — keeps the web package from needing pino as a direct dependency.
- `resetEngineDeps()`: clears all cached deps for test isolation.
- `CAULDRON_PROJECT_ROOT` env var controls the config search path; falls back to `process.cwd()`.

Extended `createTRPCContext` in `init.ts` to include `getEngineDeps` as a lazy reference. Mutations call `await ctx.getEngineDeps()` only when needed — read-only queries never pay the gateway construction cost.

### Task 2: sendAnswer wired to InterviewFSM.submitAnswer()

Replaced the DB-only stub in `packages/web/src/trpc/routers/interview.ts`:

- Added `import { InterviewFSM } from '@cauldron/engine'`
- Removed manual `InterviewTurn` construction and `ctx.db.update()` call in sendAnswer
- Now calls `await ctx.getEngineDeps()` then `new InterviewFSM(ctx.db, gateway, config, logger)`
- Calls `await fsm.submitAnswer(interview.id, projectId, { userAnswer: answer, freeformText })`
- Returns backward-compatible superset: all previous fields plus `nextQuestion` and `turn`
- Phase guard (`interview.phase !== 'gathering'`) kept as fast-fail before engine initialization

Created `packages/web/src/trpc/routers/__tests__/interview-engine.test.ts` with 5 test cases:
1. Verifies InterviewFSM constructor receives (db, gateway, config, logger)
2. Verifies submitAnswer is called with correct (interviewId, projectId, { userAnswer, freeformText })
3. Verifies TurnResult fields are mapped correctly to response shape
4. Verifies phase='reviewing' when thresholdMet=true
5. Verifies throws when no interview exists (FSM never instantiated)
6. Verifies throws when interview not in gathering phase (getEngineDeps never called)

## Verification Results

- `pnpm --filter @cauldron/web exec tsc --noEmit`: PASSED (0 errors)
- `pnpm --filter @cauldron/web test`: PASSED (13/13 tests, 3 test files)
- `grep -n "new InterviewFSM" packages/web/src/trpc/routers/interview.ts`: FOUND (line 115)
- `grep -n "getEngineDeps" packages/web/src/trpc/init.ts`: FOUND (lines 4, 8)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Type Handling] Pino not in web package deps**
- **Found during:** Task 1
- **Issue:** `import type { Logger } from 'pino'` failed — pino is not a direct dependency of `@cauldron/web`
- **Fix:** Defined a local structural Logger type in engine-deps.ts; used `as any` cast at `LLMGateway.create` boundary; returned `logger: any` from `getEngineDeps()` to allow InterviewFSM constructor assignment
- **Files modified:** packages/web/src/trpc/engine-deps.ts
- **Commit:** 6a4c1fb (updated in dc59389)

**2. [Rule 1 - Bug] Arrow function MockInterviewFSM couldn't be used as constructor**
- **Found during:** Task 2 (first test run)
- **Issue:** `vi.fn().mockImplementation(() => ...)` creates an arrow function which cannot be used with `new` in Vitest
- **Fix:** Used `vi.fn(function(this) { Object.assign(this, { submitAnswer }) })` pattern — per existing project decision from Phase 06.1
- **Files modified:** packages/web/src/trpc/routers/__tests__/interview-engine.test.ts
- **Commit:** dc59389

## Known Stubs

None — sendAnswer is fully wired to the real FSM. The previous DB-only stub has been completely replaced.

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | 6a4c1fb | feat(10-01): create engine-deps factory and extend tRPC context |
| 2 | dc59389 | feat(10-01): wire sendAnswer mutation to InterviewFSM.submitAnswer() |

## Self-Check: PASSED
