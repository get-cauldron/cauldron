---
phase: 11-engine-inngest-serve-evolution-bootstrap
verified: 2026-03-27T17:45:00Z
status: gaps_found
score: 5/7 must-haves verified
gaps:
  - truth: "Inngest dev server can discover and invoke all 5 engine functions (handleBeadDispatchRequested, handleBeadCompleted, handleMergeRequested, handleEvolutionConverged, handleEvolutionStarted)"
    status: partial
    reason: "createInngestApp() factory exists with all 5 functions correctly wired, but the function is never imported or mounted anywhere outside its own test. No server actually calls createInngestApp() and serves the resulting Hono app over HTTP, so the Inngest broker cannot reach the engine functions."
    artifacts:
      - path: "packages/api/src/inngest-serve.ts"
        issue: "ORPHANED — createInngestApp() defined but never mounted on any HTTP server outside of test"
    missing:
      - "A CLI command or server entry point must import createInngestApp() from inngest-serve.ts and mount it on a running HTTP server (e.g., via @hono/node-server) so the Inngest dev server can reach /api/inngest"
  - truth: "Pipeline trigger webhook reaches downstream bead dispatch through engine Inngest functions"
    status: partial
    reason: "pipelineTriggerFunction correctly sends bead.dispatch_requested. However, for the engine's handleBeadDispatchRequested to receive this event, the createInngestApp() Hono serve endpoint must be mounted and reachable by the Inngest broker — which it currently is not."
    artifacts:
      - path: "packages/api/src/inngest-serve.ts"
        issue: "ORPHANED — serve endpoint exists but is not mounted; Inngest broker cannot route bead.dispatch_requested to engine handlers"
    missing:
      - "Same fix as above: mount createInngestApp() on a running HTTP server so Inngest can deliver bead.dispatch_requested events to engine functions"
human_verification:
  - test: "Inngest dev server discovers and invokes engine functions"
    expected: "All 5 engine functions (handleBeadDispatchRequested, handleBeadCompleted, handleMergeRequested, handleEvolutionConverged, handleEvolutionStarted) appear in the Inngest dashboard at http://localhost:8288 after mounting createInngestApp() and starting the server"
    why_human: "Requires running Docker Compose stack with Inngest dev server, a live HTTP server serving createInngestApp(), and visual inspection of Inngest dashboard"
  - test: "End-to-end pipeline trigger dispatches to engine bead execution"
    expected: "A GitHub push webhook event triggers pipelineTriggerFunction, which sends bead.dispatch_requested, which is received and processed by handleBeadDispatchRequested in the engine"
    why_human: "Requires full stack (Docker, Inngest dev server, mounted engine serve endpoint, real project with seed)"
---

# Phase 11: Engine Inngest Serve & Evolution Bootstrap Verification Report

**Phase Goal:** Engine Inngest functions are reachable via HTTP so Inngest can deliver events, and evolution dependencies are configured at bootstrap — making bead execution, merge queue, and evolutionary loop operational in production.
**Verified:** 2026-03-27T17:45:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Inngest dev server can discover and invoke all 5 engine functions | PARTIAL | `createInngestApp()` correctly wires all 5 functions via `inngest/hono` adapter at `/api/inngest`, but the factory is orphaned — never mounted on any running HTTP server |
| 2 | Engine function dependencies (scheduler, vault, evolution) are initialized before any event handler runs | VERIFIED | `bootstrap.ts` calls `configureSchedulerDeps`, `configureVaultDeps`, `configureEvolutionDeps` in sequence before returning |
| 3 | `configureEvolutionDeps` is called at CLI bootstrap alongside configureSchedulerDeps and configureVaultDeps | VERIFIED | `packages/api/src/bootstrap.ts` line 60: `configureEvolutionDeps({ db, gateway })` called after `configureVaultDeps` |
| 4 | pipelineTriggerFunction sends a bead.dispatch_requested Inngest event after recording the DB trigger event | VERIFIED | `packages/web/src/inngest/pipeline-trigger.ts` lines 151-157: `step.sendEvent('dispatch-bead-execution', { name: 'bead.dispatch_requested', data: { seedId, projectId } })` |
| 5 | triggerExecution mutation sends a bead.dispatch_requested Inngest event so beads are dispatched to agents | VERIFIED | `packages/web/src/trpc/routers/execution.ts` lines 114-120: `engineInngest.send({ name: 'bead.dispatch_requested', data: { seedId, projectId } })` |
| 6 | Pipeline trigger webhook reaches downstream bead dispatch through engine Inngest functions | PARTIAL | Events are sent correctly but engine handlers are unreachable because `createInngestApp()` is not mounted on any server the Inngest broker can reach |
| 7 | pipelineTriggerFunction returns a distinct status when no seed exists for the project | VERIFIED | `packages/web/src/inngest/pipeline-trigger.ts` lines 143-147: returns `{ status: 'no_seed', projectId }` when `latestSeed` is null |

**Score:** 5/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/api/src/inngest-serve.ts` | Hono app serving cauldron-engine client with all 5 functions | ORPHANED | File exists, all 5 functions registered, mounts at `/api/inngest` — but `createInngestApp()` is never imported or called outside test context |
| `packages/api/src/__tests__/inngest-serve.test.ts` | Smoke test confirming serve() is called with all 5 engine functions | VERIFIED | 1 test, passes, asserts `ENGINE_FUNCTIONS.length === 5` and all 5 function IDs in `serve()` call |
| `packages/api/src/bootstrap.ts` | configureEvolutionDeps call during CLI startup | VERIFIED | Line 60 calls `configureEvolutionDeps({ db, gateway })` |
| `packages/web/src/inngest/pipeline-trigger.ts` | Inngest event dispatch to engine after pipeline trigger | VERIFIED | `step.sendEvent` with `bead.dispatch_requested` added after `trigger-pipeline` step |
| `packages/web/src/trpc/routers/execution.ts` | Inngest event dispatch from triggerExecution mutation | VERIFIED | `engineInngest.send()` call with `bead.dispatch_requested` after audit `appendEvent` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/api/src/inngest-serve.ts` | `@cauldron/engine` barrel | `import { inngest as engineInngest, handle* }` | WIRED | All 5 handler imports confirmed in file |
| `packages/api/src/bootstrap.ts` | `packages/engine/src/evolution/events.ts` | `configureEvolutionDeps({ db, gateway })` | WIRED | Import on line 23, call on line 60 |
| `packages/web/src/inngest/pipeline-trigger.ts` | engine `handleBeadDispatchRequested` | `step.sendEvent` with name `bead.dispatch_requested` | PARTIAL | Event sent correctly, but engine listener unreachable (serve endpoint not mounted) |
| `packages/web/src/trpc/routers/execution.ts` | engine `handleBeadDispatchRequested` | `engineInngest.send` with name `bead.dispatch_requested` | PARTIAL | Event sent correctly, but engine listener unreachable (serve endpoint not mounted) |
| `packages/api/src/inngest-serve.ts` | any HTTP server | `createInngestApp()` imported and mounted | NOT_WIRED | `createInngestApp` only referenced in its own test — no production code imports or mounts it |

### Data-Flow Trace (Level 4)

Not applicable — phase produces API/orchestration wiring, not data-rendering components.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| ENGINE_FUNCTIONS has 5 items | `grep -c "handle" packages/api/src/inngest-serve.ts` | 5 handle* identifiers | PASS |
| `configureEvolutionDeps` called in bootstrap | `grep 'configureEvolutionDeps' packages/api/src/bootstrap.ts` | Line 23 (import), Line 60 (call) | PASS |
| `bead.dispatch_requested` sent in pipeline-trigger | `grep 'bead.dispatch_requested' packages/web/src/inngest/pipeline-trigger.ts` | Line 152 | PASS |
| `bead.dispatch_requested` sent in execution.ts | `grep 'bead.dispatch_requested' packages/web/src/trpc/routers/execution.ts` | Line 115 | PASS |
| inngest/hono adapter used (not inngest/next) | `grep 'inngest/hono' packages/api/src/inngest-serve.ts` | Line 1 confirmed | PASS |
| Full test suite green | `pnpm turbo test` | 103 tests pass (81 cli + 22 web) | PASS |
| TypeScript compiles cleanly | `pnpm --filter @cauldron/cli exec tsc --noEmit` | No errors | PASS |
| TypeScript compiles cleanly (web) | `pnpm --filter @cauldron/web exec tsc --noEmit` | No errors | PASS |
| `createInngestApp` mounted in production code | `grep -r 'createInngestApp' packages/api/src --include=*.ts \| grep -v test` | Only definition found, no caller | FAIL |

### Requirements Coverage

All 38 requirement IDs listed in the plan frontmatter are pre-existing requirements completed in earlier phases (Phases 4-7 per REQUIREMENTS.md). This phase provides the HTTP serve endpoint and bootstrap wiring that makes those already-implemented functions *reachable at runtime*.

| Requirement Group | Source Plan | Prior Phase | Status in Phase 11 | Evidence |
|-------------------|-------------|-------------|---------------------|----------|
| DAG-06..09 | 11-01 | Phase 5 | REACHABILITY PARTIAL | Engine serve app created but not mounted; handlers still unreachable via Inngest |
| EXEC-01..09 | 11-01 | Phase 6 | REACHABILITY PARTIAL | Same — bead execution functions exist but unreachable until serve endpoint is mounted |
| CODE-01..04 | 11-01 | Phase 6 | SATISFIED | No changes needed; code intelligence already implemented |
| TEST-01..06 | 11-01 | Phase 6 | SATISFIED | No changes needed; test generation already in bead execution handlers |
| EVOL-01..12 | 11-01 | Phase 7 | PARTIAL | configureEvolutionDeps now wired in bootstrap (VERIFIED); evolution functions still unreachable via Inngest |
| HOLD-05..08 | 11-01 | Phase 4 | REACHABILITY PARTIAL | handleEvolutionConverged registered in serve app but not mounted |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/api/src/inngest-serve.ts` | 29 | `createInngestApp` function never called outside test | BLOCKER | Inngest dev server cannot discover engine functions; all 5 event handlers are effectively unreachable in production |
| `packages/web/src/app/api/inngest/route.ts` | 1-12 | Web Inngest route uses `inngest/next` and only serves `pipelineTriggerFunction` — does not include engine functions | WARNING | Engine functions must be served by a separate endpoint, which is not yet mounted |

### Human Verification Required

#### 1. Engine Function Discovery

**Test:** After mounting `createInngestApp()` on a running HTTP server, start Docker Compose and open the Inngest dashboard at `http://localhost:8288`.
**Expected:** All 5 engine functions (pipeline-dispatch-bead, dag-on-bead-completed, execution-merge-bead, holdout-vault-unseal-on-convergence, evolution-run-cycle) appear as registered functions in the Inngest UI.
**Why human:** Requires running Inngest dev server, a live HTTP server, and visual inspection of the dashboard.

#### 2. End-to-End Pipeline Trigger Chain

**Test:** With the full stack running, send a `cauldron/pipeline.trigger` event via the Inngest dev server. Verify that `pipelineTriggerFunction` runs, finds a seed, sends `bead.dispatch_requested`, and that `handleBeadDispatchRequested` picks it up and begins dispatching beads.
**Expected:** Bead execution begins; bead status transitions from `pending` to `claimed` to `completed` visible in the database.
**Why human:** Requires full stack (Docker, Inngest dev server, mounted engine serve endpoint, real project with a crystallized seed).

### Gaps Summary

Phase 11 successfully delivers:
- A properly implemented Hono-based `createInngestApp()` factory with all 5 engine functions correctly registered via the `inngest/hono` adapter
- `configureEvolutionDeps` wired in `bootstrap.ts` alongside scheduler and vault deps — evolution handlers will no longer throw on missing deps
- `pipelineTriggerFunction` now sends `bead.dispatch_requested` after trigger, with a distinct `no_seed` return path
- `triggerExecution` tRPC mutation now dispatches `bead.dispatch_requested` via `engineInngest.send()`
- All 4 commits verified, all 103 tests passing, TypeScript compiles cleanly

**The single blocking gap:** `createInngestApp()` is never mounted on a running HTTP server. It is defined in `packages/api/src/inngest-serve.ts` and used only in its smoke test. No production entry point (CLI command, server startup, or otherwise) imports and serves the resulting Hono app. Until this app is mounted on a live HTTP port that the Inngest dev server knows to poll, the Inngest broker cannot deliver events to any of the 5 engine functions — making bead execution, merge queue, holdout convergence, and evolution all dead code at runtime despite being fully implemented.

The fix is straightforward: import `createInngestApp` in the CLI's execute command or a dedicated server startup path, mount it via `@hono/node-server`, and register the port with the Inngest dev server config. This is the `Plan 02` mounting step referenced in the Plan 01 summary ("Plan 02 can mount `createInngestApp()` on the CLI Hono server alongside existing routes"), but Plan 02 was scoped to pipeline/execution event wiring rather than server mounting, leaving this as an unaddressed gap.

---

_Verified: 2026-03-27T17:45:00Z_
_Verifier: Claude (gsd-verifier)_
