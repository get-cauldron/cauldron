---
phase: 11-engine-inngest-serve-evolution-bootstrap
plan: "03"
subsystem: api
tags: [inngest, hono, engine-server, docker-compose]
dependency_graph:
  requires: ["11-01", "11-02"]
  provides: [engine-server-entry-point, inngest-dual-poll]
  affects: [inngest-dev-server, docker-compose]
tech_stack:
  added: []
  patterns: [hono-node-server-serve, bootstrap-before-serve]
key_files:
  created:
    - packages/api/src/engine-server.ts
    - packages/api/src/__tests__/engine-server.test.ts
  modified:
    - packages/api/package.json
    - docker-compose.yml
decisions:
  - "startEngineServer checks process.argv[1] endsWith both 'engine-server' and 'engine-server.ts' for direct tsx execution compatibility"
  - "Inngest dev server polls both port 3001 (engine, 5 functions) and port 3000 (web, pipelineTriggerFunction) in single command"
metrics:
  duration: "2min"
  completed: "2026-03-27"
  tasks: 2
  files: 4
---

# Phase 11 Plan 03: Engine HTTP Server Entry Point Summary

**One-liner:** HTTP entry point mounts createInngestApp() on port 3001 via @hono/node-server, closing the orphan gap so all 6 Inngest functions are discoverable.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create engine-server.ts entry point | 4d8fb87 | packages/api/src/engine-server.ts, packages/api/src/__tests__/engine-server.test.ts, packages/api/package.json |
| 2 | Update docker-compose Inngest dev server for dual polling | 6e19055 | docker-compose.yml |

## What Was Built

### engine-server.ts

`startEngineServer(projectRoot, port=3001)` is the single entry point that:
1. Calls `bootstrap(projectRoot)` to configure scheduler/vault/evolution deps
2. Calls `createInngestApp()` to get the Hono app with all 5 engine functions
3. Serves via `@hono/node-server` `serve({ fetch: app.fetch, port })`
4. Logs `Engine Inngest server listening on port ${port}` to stdout
5. Returns the server instance for cleanup

Direct execution guard enables `tsx src/engine-server.ts` and `pnpm serve:engine`.

### Test Coverage

`engine-server.test.ts` verifies:
- bootstrap called before createInngestApp (dependency ordering enforced)
- serve called with `{ fetch: app.fetch, port: 3001 }` (correct adapter usage)
- Custom port propagated through to serve (configurable port)

### docker-compose.yml

Inngest dev server now polls both endpoints:
```
inngest dev -u http://host.docker.internal:3001/api/inngest -u http://host.docker.internal:3000/api/inngest
```

This enables discovery of all 6 functions: 5 engine functions (handleBeadDispatchRequested, handleBeadCompleted, handleMergeRequested, handleEvolutionConverged, handleEvolutionStarted) + 1 web function (pipelineTriggerFunction).

## Verification Results

- 18 test files, 83 tests — all pass
- TypeScript compiles cleanly (`tsc --noEmit` — no errors)
- `grep createInngestApp packages/api/src/engine-server.ts` — match found (no longer orphaned)
- Both port 3001 and port 3000 referenced in docker-compose.yml Inngest command

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — engine-server.ts is fully wired: bootstrap -> createInngestApp -> serve.

## Self-Check: PASSED

- packages/api/src/engine-server.ts — exists
- packages/api/src/__tests__/engine-server.test.ts — exists
- docker-compose.yml — updated, both ports present
- Commits 4d8fb87 and 6e19055 — verified in git log
