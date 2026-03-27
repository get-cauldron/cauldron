---
phase: 11-engine-inngest-serve-evolution-bootstrap
verified: 2026-03-27T18:00:00Z
status: passed
score: 7/7 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 5/7
  gaps_closed:
    - "Inngest dev server can discover and invoke all 5 engine functions — createInngestApp() is now mounted via engine-server.ts on port 3001"
    - "Pipeline trigger webhook reaches downstream bead dispatch through engine Inngest functions — engine serve endpoint is no longer orphaned"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Inngest dev server discovers all 6 functions from both endpoints"
    expected: "All 5 engine functions and pipelineTriggerFunction appear in the Inngest dashboard at http://localhost:8288 after running docker-compose up and pnpm serve:engine"
    why_human: "Requires running Docker Compose stack with Inngest dev server, a live engine server, and visual inspection of the Inngest dashboard"
  - test: "End-to-end pipeline trigger dispatches to engine bead execution"
    expected: "A cauldron/pipeline.trigger event triggers pipelineTriggerFunction, which sends bead.dispatch_requested, which is received by handleBeadDispatchRequested and begins dispatching beads"
    why_human: "Requires full stack (Docker, Inngest dev server, running engine server on port 3001, real project with crystallized seed)"
---

# Phase 11: Engine Inngest Serve & Evolution Bootstrap Verification Report

**Phase Goal:** Engine Inngest functions are reachable via HTTP so Inngest can deliver events, and evolution dependencies are configured at bootstrap — making bead execution, merge queue, and evolutionary loop operational in production.
**Verified:** 2026-03-27T18:00:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (Plan 11-03 executed)

## Re-Verification Summary

Previous verification (gaps_found, 5/7) identified one blocking gap: `createInngestApp()` was defined in `packages/api/src/inngest-serve.ts` but never imported or mounted on any HTTP server, making all 5 engine functions unreachable by the Inngest broker.

Plan 11-03 closed this gap by creating `packages/api/src/engine-server.ts` — a startup entry point that calls `bootstrap()` then `createInngestApp()` then `serve()` via `@hono/node-server` on port 3001. `docker-compose.yml` was also updated to poll both port 3001 (engine) and port 3000 (web) for Inngest function discovery.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Inngest dev server can discover and invoke all 5 engine functions at http://localhost:3001/api/inngest | VERIFIED | `engine-server.ts` imports `createInngestApp`, calls `serve({ fetch: app.fetch, port: 3001 })` — no longer orphaned; commit 4d8fb87 |
| 2 | Engine function dependencies (scheduler, vault, evolution) are initialized before any event handler runs | VERIFIED | `startEngineServer` calls `await bootstrap(projectRoot)` before `createInngestApp()` — ordering enforced at lines 17-19 |
| 3 | `configureEvolutionDeps` is called at CLI bootstrap alongside configureSchedulerDeps and configureVaultDeps | VERIFIED | `packages/api/src/bootstrap.ts` line 60: `configureEvolutionDeps({ db, gateway })` |
| 4 | pipelineTriggerFunction sends a bead.dispatch_requested Inngest event after recording the DB trigger event | VERIFIED | `packages/web/src/inngest/pipeline-trigger.ts` lines 151-157: `step.sendEvent('dispatch-bead-execution', { name: 'bead.dispatch_requested', ... })` |
| 5 | triggerExecution mutation sends a bead.dispatch_requested Inngest event so beads are dispatched to agents | VERIFIED | `packages/web/src/trpc/routers/execution.ts` lines 114-120: `engineInngest.send({ name: 'bead.dispatch_requested', ... })` |
| 6 | Pipeline trigger webhook reaches downstream bead dispatch through engine Inngest functions | VERIFIED | Events are sent correctly; engine handlers are now reachable via `startEngineServer` serving on port 3001 that Inngest dev server polls |
| 7 | pipelineTriggerFunction returns a distinct status when no seed exists for the project | VERIFIED | `packages/web/src/inngest/pipeline-trigger.ts` lines 143-147: returns `{ status: 'no_seed', projectId }` when `latestSeed` is null |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/api/src/engine-server.ts` | HTTP entry point importing createInngestApp and serving via @hono/node-server on port 3001 | VERIFIED | Exports `startEngineServer`; imports `bootstrap` and `createInngestApp`; calls `serve({ fetch: app.fetch, port })`; direct execution guard present |
| `packages/api/src/__tests__/engine-server.test.ts` | Test verifying bootstrap->createInngestApp->serve call chain | VERIFIED | 2 tests: default port 3001 and custom port; all assertions pass |
| `packages/api/src/inngest-serve.ts` | Hono app serving cauldron-engine client with all 5 functions | VERIFIED | Previously ORPHANED — now imported and called by engine-server.ts |
| `packages/api/src/__tests__/inngest-serve.test.ts` | Smoke test confirming ENGINE_FUNCTIONS has 5 entries | VERIFIED | Passes; asserts ENGINE_FUNCTIONS.length === 5 and all 5 function IDs |
| `packages/api/src/bootstrap.ts` | configureEvolutionDeps call during CLI startup | VERIFIED | Line 60 calls `configureEvolutionDeps({ db, gateway })` |
| `packages/web/src/inngest/pipeline-trigger.ts` | Inngest event dispatch to engine after pipeline trigger | VERIFIED | `step.sendEvent` with `bead.dispatch_requested` |
| `packages/web/src/trpc/routers/execution.ts` | Inngest event dispatch from triggerExecution mutation | VERIFIED | `engineInngest.send()` with `bead.dispatch_requested` |
| `docker-compose.yml` | Inngest dev server polls both port 3001 and port 3000 | VERIFIED | Single command: `inngest dev -u http://host.docker.internal:3001/api/inngest -u http://host.docker.internal:3000/api/inngest` |
| `packages/api/package.json` | serve:engine script | VERIFIED | `"serve:engine": "tsx src/engine-server.ts"` present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/api/src/engine-server.ts` | `packages/api/src/inngest-serve.ts` | `import { createInngestApp } from './inngest-serve.js'` | WIRED | Line 3: import; line 19: `const app = createInngestApp()` — previously NOT_WIRED, now closed |
| `packages/api/src/engine-server.ts` | `packages/api/src/bootstrap.ts` | `import { bootstrap } from './bootstrap.js'` | WIRED | Line 2: import; line 17: `await bootstrap(projectRoot)` before serve |
| `packages/api/src/engine-server.ts` | `@hono/node-server` | `import { serve } from '@hono/node-server'` | WIRED | Line 1: import; line 21: `serve({ fetch: app.fetch, port })` |
| `packages/api/src/inngest-serve.ts` | `@cauldron/engine` barrel | `import { inngest as engineInngest, handle* }` | WIRED | All 5 handler imports confirmed |
| `packages/api/src/bootstrap.ts` | `packages/engine/src/evolution/events.ts` | `configureEvolutionDeps({ db, gateway })` | WIRED | Import line 23, call line 60 |
| `packages/web/src/inngest/pipeline-trigger.ts` | engine `handleBeadDispatchRequested` | `step.sendEvent` with `bead.dispatch_requested` | WIRED | Event sent correctly; engine handlers now reachable |
| `packages/web/src/trpc/routers/execution.ts` | engine `handleBeadDispatchRequested` | `engineInngest.send` with `bead.dispatch_requested` | WIRED | Event sent correctly; engine handlers now reachable |
| `docker-compose.yml` inngest service | port 3001 and port 3000 | `-u` flags in inngest dev command | WIRED | Both URLs present in single command line |

### Data-Flow Trace (Level 4)

Not applicable — phase produces API/orchestration wiring, not data-rendering components.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `createInngestApp` imported in engine-server.ts | `grep "createInngestApp" packages/api/src/engine-server.ts` | Lines 3, 19 — import and call | PASS |
| `bootstrap` called before serve in engine-server.ts | order inspection of engine-server.ts | bootstrap line 17, createInngestApp line 19, serve line 21 | PASS |
| Default port is 3001 | `grep "3001" packages/api/src/engine-server.ts` | Line 15: `port = 3001` | PASS |
| Docker-compose polls both endpoints | `grep "host.docker.internal" docker-compose.yml` | Single line with both 3001 and 3000 URLs | PASS |
| `serve:engine` script present | `grep "serve:engine" packages/api/package.json` | `"serve:engine": "tsx src/engine-server.ts"` | PASS |
| `configureEvolutionDeps` called in bootstrap | `grep "configureEvolutionDeps" packages/api/src/bootstrap.ts` | Import line 23, call line 60 | PASS |
| Full API test suite green | `pnpm --filter @cauldron/cli exec vitest run` | 18 test files, 83 tests — all pass | PASS |
| TypeScript compiles cleanly (API) | `pnpm --filter @cauldron/cli exec tsc --noEmit` | No errors | PASS |
| Commits exist in git log | `git show --stat 4d8fb87 6e19055` | Both commits confirmed: engine-server.ts + docker-compose update | PASS |

### Requirements Coverage

All 38 requirement IDs listed across phase 11 plans are pre-existing requirements implemented in earlier phases (Phases 4-7). Phase 11 provides the HTTP serve endpoint and bootstrap wiring that makes those already-implemented functions reachable at runtime.

| Requirement Group | Source Plan | Prior Phase | Status in Phase 11 | Evidence |
|-------------------|-------------|-------------|---------------------|----------|
| DAG-06..09 | 11-01, 11-03 | Phase 5 | REACHABILITY SATISFIED | Engine serve app mounted on port 3001 via engine-server.ts; Inngest dev server polls it |
| EXEC-01..09 | 11-01, 11-03 | Phase 6 | REACHABILITY SATISFIED | Bead execution functions reachable via mounted serve endpoint; bootstrap configures deps before serve |
| CODE-01..04 | 11-01 | Phase 6 | SATISFIED | No changes needed; code intelligence already implemented in earlier phase |
| TEST-01..06 | 11-01 | Phase 6 | SATISFIED | No changes needed; test generation already in bead execution handlers |
| EVOL-01..12 | 11-01 | Phase 7 | SATISFIED | configureEvolutionDeps wired in bootstrap; evolution functions reachable via mounted serve endpoint |
| HOLD-05..08 | 11-01 | Phase 4 | REACHABILITY SATISFIED | handleEvolutionConverged registered and now reachable via mounted serve endpoint |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | None found |

No blockers, no warnings. The previously-flagged ORPHANED artifact (`inngest-serve.ts`) is now fully wired via `engine-server.ts`.

### Human Verification Required

#### 1. Inngest Dev Server Discovers All 6 Functions

**Test:** After running `docker-compose up` and `pnpm --filter @cauldron/cli run serve:engine` (pointing at a project root), open the Inngest dashboard at `http://localhost:8288`.
**Expected:** All 6 functions appear — 5 engine functions from port 3001 (pipeline-dispatch-bead, dag-on-bead-completed, execution-merge-bead, holdout-vault-unseal-on-convergence, evolution-run-cycle) and 1 web function from port 3000 (pipelineTriggerFunction).
**Why human:** Requires running Inngest dev server, live HTTP servers on both ports, and visual inspection of the dashboard.

#### 2. End-to-End Pipeline Trigger Dispatches to Engine Bead Execution

**Test:** With the full stack running, send a `cauldron/pipeline.trigger` event via the Inngest dev server. Verify that `pipelineTriggerFunction` runs, finds a seed, sends `bead.dispatch_requested`, and that `handleBeadDispatchRequested` picks it up and begins dispatching beads.
**Expected:** Bead execution begins; bead status transitions from `pending` to `claimed` to `completed` visible in the database.
**Why human:** Requires full stack (Docker, Inngest dev server, running engine server on port 3001, real project with a crystallized seed).

### Gaps Summary

No gaps remain. The single blocking gap from the initial verification has been closed:

- `createInngestApp()` is no longer orphaned — `engine-server.ts` imports and mounts it via `@hono/node-server` on port 3001
- `bootstrap()` runs before `createInngestApp()` ensuring all deps (scheduler, vault, evolution) are configured before any handler can be invoked
- The Inngest dev server is configured via `docker-compose.yml` to discover functions from both port 3001 (5 engine functions) and port 3000 (pipelineTriggerFunction)
- A `serve:engine` npm script enables running the engine server directly via `pnpm --filter @cauldron/cli run serve:engine`
- 18 test files, 83 tests — all pass; TypeScript compiles cleanly

The two human verification items are integration-level tests that require a running Docker Compose stack and cannot be verified programmatically. All code-level wiring is complete.

---

_Verified: 2026-03-27T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
