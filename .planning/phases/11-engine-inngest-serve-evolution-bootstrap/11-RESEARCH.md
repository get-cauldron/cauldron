# Phase 11: Engine Inngest Serve & Evolution Bootstrap - Research

**Researched:** 2026-03-27
**Domain:** Inngest v4 serve configuration, Next.js Route Handlers, dependency injection bootstrapping
**Confidence:** HIGH

## Summary

Phase 11 closes two precisely identified integration gaps documented in the v1.0 milestone audit:
(1) the `cauldron-engine` Inngest client has 5 registered functions but no HTTP endpoint — Inngest cannot deliver any events to them; (2) `bootstrap.ts` calls `configureSchedulerDeps` and `configureVaultDeps` but not `configureEvolutionDeps`, causing `evolution_started` events to throw "Evolution dependencies not configured."

Both gaps are surgical. The code for all 5 engine functions is complete and individually tested. No logic rewrites are needed. This phase adds an HTTP serve layer and a single missing bootstrap call. All relevant functions already exist and are already exported from `@cauldron/engine` through the barrel chain.

**Primary recommendation:** Add a new Next.js route at `packages/web/src/app/api/inngest/engine/route.ts` that serves the `cauldron-engine` Inngest client with all 5 engine functions. Add `configureEvolutionDeps({ db, gateway })` in `packages/api/src/bootstrap.ts` alongside the existing configurators. Test that the Inngest dev server discovers and invokes each engine function.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DAG-06 | Synchronization gates (waits-for) fire when all upstream beads complete | Already implemented in `beadDispatchHandler` — needs serve endpoint to be reachable |
| DAG-07 | Cycle detection runs at DAG construction time | Already implemented in `validateDAG` — unblocked by serving engine functions |
| DAG-08 | Atomic bead claiming prevents race conditions | Already implemented via optimistic concurrency — unblocked by serving engine functions |
| DAG-09 | DAG state persisted (bead status, dependency edges, agent assignments) | Already implemented — unblocked by serving engine functions |
| EXEC-01 through EXEC-09 | Full parallel execution lifecycle (worktrees, context assembly, self-healing, merge queue) | All implemented in `beadDispatchHandler` and `mergeRequestedHandler` — need engine serve endpoint |
| CODE-01 through CODE-04 | Knowledge graph indexing, queries, re-indexing | Implemented in KnowledgeGraphAdapter — called from `beadDispatchHandler`, needs serve endpoint |
| TEST-01 through TEST-06 | Testing cube (unit, integration, E2E) generation during bead execution | Implemented in AgentRunner TDD loop — called from `beadDispatchHandler`, needs serve endpoint |
| EVOL-01 through EVOL-12 | Full evolutionary loop (evaluation, convergence, lateral thinking, escalation) | Implemented in `evolutionCycleHandler` — needs both serve endpoint AND `configureEvolutionDeps` call |
| HOLD-05 | Holdout tests remain sealed during execution | Enforced by key isolation — unblocked by serving engine functions correctly |
| HOLD-06 | Holdout tests unsealed only after convergence | Implemented in `convergenceHandler` (`handleEvolutionConverged`) — needs serve endpoint |
| HOLD-07 | Unsealed holdout results determine whether more evolution needed | Implemented in `convergenceHandler` — needs serve endpoint |
| HOLD-08 | Holdout test failure triggers new evolution cycle | Implemented in `convergenceHandler` emitting `evolution_started` — needs serve endpoint AND `configureEvolutionDeps` |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- TypeScript end-to-end — all new files in TypeScript
- Inngest 4 is the durable job orchestration layer (final decision, do not change)
- Each bead must fit in a commercial model's context window — not relevant to this phase
- OSS dependencies encouraged if they do 80%+ cleanly — no new dependencies expected in this phase
- The web package already has `inngest@4.1.0` and `@cauldron/engine` as dependencies — reuse both

## Standard Stack

### Core (already in place — no new installations required)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `inngest` | 4.1.0 | Durable job orchestration | Project constraint |
| `inngest/next` | (same pkg) | Next.js serve adapter | Used for existing `cauldron-web` serve endpoint |
| `@cauldron/engine` | workspace:* | Engine functions and configurators | All 5 functions already exported |

**No new npm dependencies required for this phase.**

### Function Inventory (already implemented, need serving)

| Function Export | Inngest ID | Trigger Event | Source File |
|-----------------|------------|---------------|-------------|
| `handleBeadDispatchRequested` | `dag/dispatch-bead` | `bead.dispatch_requested` | `engine/src/decomposition/events.ts` |
| `handleBeadCompleted` | `dag/on-bead-completed` | `bead.completed` | `engine/src/decomposition/events.ts` |
| `handleMergeRequested` | `execution/merge-bead` | `bead.merge_requested` | `engine/src/decomposition/events.ts` |
| `handleEvolutionConverged` | `holdout-vault/unseal-on-convergence` | `evolution_converged` | `engine/src/holdout/events.ts` |
| `handleEvolutionStarted` | `evolution/run-cycle` | `evolution_started` | `engine/src/evolution/events.ts` |

All 5 are exported via the `@cauldron/engine` barrel through sub-barrels: `decomposition/index.ts`, `holdout/index.ts`, `evolution/index.ts`.

### Configurators

| Configurator | Source | Currently Called in bootstrap.ts |
|-------------|--------|----------------------------------|
| `configureSchedulerDeps` | `decomposition/events.ts` | YES |
| `configureVaultDeps` | `holdout/events.ts` | YES |
| `configureEvolutionDeps` | `evolution/events.ts` | **NO — this is Gap 2** |

`configureEvolutionDeps` is already exported via `evolution/index.ts` → `engine/src/index.ts`. Only the call-site in bootstrap.ts is missing.

## Architecture Patterns

### Pattern 1: Dual Inngest Serve Endpoints in Next.js

**What:** Two separate serve endpoints for two separate Inngest client IDs within the same Next.js app.

**Why needed:** The `cauldron-web` client (id: `cauldron-web`) is served at `/api/inngest`. The `cauldron-engine` client (id: `cauldron-engine`) has no serve endpoint. Inngest identifies function apps by the client ID in the serve endpoint registration. A single serve call can only serve functions registered with one client instance.

**Verification (HIGH confidence):** `ServeHandlerOptions` takes a `client` and `functions` array — the client must match the one used to create the functions. All 5 engine functions use `inngest` from `holdout/events.ts` which has `id: 'cauldron-engine'`. Mixing clients would cause Inngest to reject the registration.

**Implementation:**

```typescript
// packages/web/src/app/api/inngest/engine/route.ts
import { serve } from 'inngest/next';
import { inngest } from '@cauldron/engine'; // re-exports the cauldron-engine client
import {
  handleBeadDispatchRequested,
  handleBeadCompleted,
  handleMergeRequested,
  handleEvolutionConverged,
  handleEvolutionStarted,
} from '@cauldron/engine';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    handleBeadDispatchRequested,
    handleBeadCompleted,
    handleMergeRequested,
    handleEvolutionConverged,
    handleEvolutionStarted,
  ],
});
```

**URL after this change:** `/api/inngest/engine` — Inngest dev server registers this app at this path.

**CRITICAL:** The `inngest` client from `@cauldron/engine` is NOT currently exported from the engine barrel. It is defined in `holdout/events.ts` and used by all engine functions. Before this pattern works, it must be re-exported from `holdout/index.ts` (which already does `export * from './events.js'`). The client named `inngest` is already exported from `holdout/events.ts` — verify it is not shadowed by any other export.

### Pattern 2: configureEvolutionDeps in bootstrap.ts

**What:** One additional function call in `packages/api/src/bootstrap.ts` after the existing configurators.

**Context:** `bootstrap.ts` is called once during CLI startup. It already imports `configureSchedulerDeps` and `configureVaultDeps` from `@cauldron/engine`. `configureEvolutionDeps` follows the identical pattern: takes `{ db, gateway }` and sets a module-level variable.

```typescript
// Add to existing imports in bootstrap.ts:
import {
  loadConfig,
  LLMGateway,
  inngest,
  configureSchedulerDeps,
  configureVaultDeps,
  configureEvolutionDeps,  // ADD THIS
} from '@cauldron/engine';

// In the bootstrap() function body, after existing configurators:
configureSchedulerDeps({ db, gateway, projectRoot });
configureVaultDeps({ db, gateway });
configureEvolutionDeps({ db, gateway });  // ADD THIS
```

**`budgetLimitCents` parameter:** `configureEvolutionDeps` accepts an optional `budgetLimitCents` (default: 10000 = $100 USD). For now, pass only `{ db, gateway }` and let it default. If the project config needs a custom budget, read it from `config` after loadConfig is called.

### Pattern 3: Pipeline Trigger → Engine Function Chain (Flow 6)

The git push → webhook → `pipelineTriggerFunction` → `bead.dispatch_requested` chain is partially broken because `pipelineTriggerFunction` emits `pipeline_trigger` DB events but does not actually send `bead.dispatch_requested` to the engine. The function's comment says: "The existing Inngest pipeline orchestration functions will pick up pipeline_trigger events with status: 'triggered' and start the pipeline." No engine function currently listens for this event.

**Gap:** For Flow 6 to work end-to-end (Git Push → Pipeline), `pipelineTriggerFunction` needs to send a `bead.dispatch_requested` event to trigger actual decomposition + execution, OR a handler for `pipeline_trigger` status=`triggered` must be added to the engine. The Phase 11 success criterion says "Pipeline trigger webhook reaches downstream bead dispatch through the engine functions" — this requires wiring this last hop.

**Recommended approach:** After `trigger-pipeline` step in `pipelineTriggerFunction`, add a `step.sendEvent` call that sends a `bead.dispatch_requested` event (after finding the latest seed for the project). This is the web-side Inngest function sending an event that the engine-side Inngest functions will receive. Both clients can `send` to the same Inngest dev server — cross-client event dispatch works because events are routed by name, not by client.

**Alternative approach if sendEvent semantics are wrong:** Have `pipelineTriggerFunction` call `runDecomposition` via tRPC instead. But this creates a tighter coupling and the audit intended Inngest event routing to be the mechanism.

### Recommended Project Structure Changes

```
packages/web/src/
├── app/api/inngest/
│   ├── route.ts              (existing — cauldron-web functions)
│   └── engine/
│       └── route.ts          (NEW — cauldron-engine functions)
├── inngest/
│   ├── client.ts             (cauldron-web client — unchanged)
│   └── pipeline-trigger.ts   (extend to send bead.dispatch_requested event)

packages/api/src/
└── bootstrap.ts              (add configureEvolutionDeps call)
```

### Anti-Patterns to Avoid

- **Serving engine functions from the web client:** Do not add engine functions to `/api/inngest/route.ts` — they were created with the `cauldron-engine` client and must be served by that client.
- **Creating a new engine Inngest client in the web package:** Do not `new Inngest({ id: 'cauldron-engine' })` in the web package — this creates a second, incompatible client instance that will fail registration. Import the existing singleton from `@cauldron/engine`.
- **Calling `configureEvolutionDeps` outside bootstrap:** The module-level singleton pattern means it must be called once at startup, not lazily per-request.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP endpoint for Inngest functions | Custom handler parsing Inngest protocol | `serve()` from `inngest/next` | Handles HMAC signature verification, probe responses, function registration sync |
| Event routing between clients | Custom event bus | Inngest's built-in event routing | Events sent to the dev server are routed to all registered functions regardless of client ID |
| Evolution dependency injection | New DI container | Existing `configureEvolutionDeps` module-level singleton | Already implemented, just not called |

**Key insight:** All code exists. This phase is entirely wiring, not implementation.

## Common Pitfalls

### Pitfall 1: Engine `inngest` Client Not Exported at Barrel Level

**What goes wrong:** `import { inngest } from '@cauldron/engine'` may conflict with the `inngest` npm package itself if not re-exported properly. The `inngest` constant in `holdout/events.ts` is the `cauldron-engine` Inngest client instance — it must be importable as a named export from `@cauldron/engine`.

**Why it happens:** The barrel (`engine/src/index.ts`) does `export * from './holdout/index.js'` which does `export * from './events.js'` — so `inngest` is re-exported. However, TypeScript may flag a naming collision between the `inngest` local export and the `inngest` npm package imports in the same file.

**How to avoid:** In `route.ts`, use an alias: `import { inngest as engineInngest } from '@cauldron/engine'` and pass `engineInngest` as the client. This is already the pattern used in `execution.ts` router: `import { runDecomposition, inngest as engineInngest } from '@cauldron/engine'`.

**Warning signs:** TypeScript error `Module '"@cauldron/engine"' has no exported member 'inngest'` — check barrel chain.

### Pitfall 2: Inngest Dev Server Not Discovering the Engine Route

**What goes wrong:** The Inngest dev server auto-discovers functions by polling known serve endpoints. If it has only `/api/inngest` registered, it will not automatically discover `/api/inngest/engine`.

**Why it happens:** Auto-discovery only happens on startup or when the dev server is told about a new endpoint. In development mode, the Inngest dev server discovers endpoints from `INNGEST_DEV_SERVER_URL` and the app registration probe.

**How to avoid:** When testing locally, verify the Inngest dev server shows both `cauldron-web` and `cauldron-engine` app registrations. The dev server UI at `http://localhost:8288` lists registered apps. If the engine app is missing, PUT a manual sync: `curl -X PUT http://localhost:8288/api/v1/syncs -d '{"url": "http://localhost:3000/api/inngest/engine"}'`. Document this in the integration test.

**Note from STATE.md:** Inngest v4 health check probe uses `POST /v1/events` — the health check in `health.ts` already tests this.

### Pitfall 3: Worker Bootstrap Not Called Before Inngest Receives Events

**What goes wrong:** If the Next.js server cold-starts and Inngest sends an event to `/api/inngest/engine` before `bootstrap.ts` has been called (i.e., before the CLI starts), `getSchedulerDeps()` throws "Scheduler dependencies not configured."

**Why it happens:** `configureSchedulerDeps` is called from the CLI's `bootstrap.ts`, not from the Next.js app initialization. The Next.js app initializes `configureSchedulerDeps` indirectly through... actually it does NOT. The web app's `engine-deps.ts` only constructs the gateway — it does not call `configureSchedulerDeps`, `configureVaultDeps`, or `configureEvolutionDeps`.

**This is a critical architectural issue.** The engine functions in Next.js (`/api/inngest/engine`) will throw dependency errors unless the configurators are also called from the web layer.

**How to avoid:** The engine serve route must call the configurators before returning the serve handler. Add an initialization step in the engine route file:

```typescript
// packages/web/src/app/api/inngest/engine/route.ts
import { getEngineDeps } from '../../../trpc/engine-deps.js';
import {
  configureSchedulerDeps,
  configureVaultDeps,
  configureEvolutionDeps,
} from '@cauldron/engine';
import { db } from '@cauldron/shared';

// Initialize once at module load time
// Next.js Route Handlers are Node.js server-side — this runs once per process
let initialized = false;
async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  const { gateway } = await getEngineDeps();
  const projectRoot = process.env['CAULDRON_PROJECT_ROOT'] ?? process.cwd();
  configureSchedulerDeps({ db, gateway, projectRoot });
  configureVaultDeps({ db, gateway });
  configureEvolutionDeps({ db, gateway });
  initialized = true;
}
```

However, `serve()` from `inngest/next` returns synchronous handlers — the initialization must happen before an event arrives. The safest approach: wrap each handler to call `ensureInitialized()` first, OR use the Inngest middleware API to run before each function.

**Alternative (simpler):** Keep the engine functions served only through the CLI path, and use `INNGEST_DEV=1` for local dev (which is already required per STATE.md Phase 06.2 decision). In this case, initialization happens in `bootstrap.ts` before the CLI starts Inngest serve.

**Recommended approach for this phase:** The engine serve should live as a Hono route in the CLI's server, not in Next.js — because the CLI's `bootstrap.ts` already configures all deps. The `@cauldron/cli` package has `@hono/node-server` and `hono` installed. Add a Hono Inngest serve handler alongside the existing Hono routes.

**Why Hono for engine serve, not Next.js:** The audit confirms the architectural split: web = UI + tRPC + web Inngest functions; engine/CLI = the actual execution layer with `configureSchedulerDeps` etc. The engine Inngest functions need deps that are configured in bootstrap — bootstrap runs in the CLI process. Serving them from Next.js requires duplicating the dep configuration in a Next.js initializer, creating two initialization paths that can diverge.

### Pitfall 4: Inngest `serve` Hono Adapter

**What goes wrong:** `inngest/next` works with Next.js. For Hono, the correct import is `inngest/hono`.

**Verification:** The installed inngest package has `hono.d.ts` in the package root — `inngest/hono` is a valid import. The Hono adapter follows the same `serve({ client, functions })` pattern.

```typescript
import { serve } from 'inngest/hono';
```

**Warning signs:** If the Hono server doesn't have `@hono/node-server`, the adapter won't work. Check `packages/api/package.json` — it has `"@hono/node-server": "^1.13.0"`. The adapter should work.

### Pitfall 5: Missing `inngest` Export Collision

**What goes wrong:** In `engine/src/holdout/events.ts`, the named export `inngest` (the Inngest client instance) may be invisible if TypeScript resolves `inngest` as the npm package name in consuming files.

**How to avoid:** Always use aliased import: `import { inngest as engineInngest } from '@cauldron/engine'`. The `execution.ts` router already uses this pattern, confirming it works.

## Code Examples

### Engine Serve Route (Next.js — only if deps are initialized here)

```typescript
// packages/web/src/app/api/inngest/engine/route.ts
// Source: inngest/next adapter (same pattern as existing /api/inngest/route.ts)
import { serve } from 'inngest/next';
import {
  inngest as engineInngest,  // cauldron-engine client
  handleBeadDispatchRequested,
  handleBeadCompleted,
  handleMergeRequested,
  handleEvolutionConverged,
  handleEvolutionStarted,
} from '@cauldron/engine';

export const { GET, POST, PUT } = serve({
  client: engineInngest,
  functions: [
    handleBeadDispatchRequested,
    handleBeadCompleted,
    handleMergeRequested,
    handleEvolutionConverged,
    handleEvolutionStarted,
  ],
});
```

### Engine Serve Route (Hono — preferred, co-located with bootstrap)

```typescript
// packages/api/src/inngest-serve.ts
import { serve } from 'inngest/hono';
import { Hono } from 'hono';
import {
  inngest as engineInngest,
  handleBeadDispatchRequested,
  handleBeadCompleted,
  handleMergeRequested,
  handleEvolutionConverged,
  handleEvolutionStarted,
} from '@cauldron/engine';

export function createInngestApp(): Hono {
  const app = new Hono();

  const handler = serve({
    client: engineInngest,
    functions: [
      handleBeadDispatchRequested,
      handleBeadCompleted,
      handleMergeRequested,
      handleEvolutionConverged,
      handleEvolutionStarted,
    ],
  });

  // Mount at /api/inngest so Inngest dev server finds it
  app.on(['GET', 'POST', 'PUT'], '/api/inngest', handler);
  return app;
}
```

### configureEvolutionDeps in bootstrap.ts

```typescript
// Diff showing the change to packages/api/src/bootstrap.ts
import {
  loadConfig,
  LLMGateway,
  inngest,
  configureSchedulerDeps,
  configureVaultDeps,
  configureEvolutionDeps,  // ADD
} from '@cauldron/engine';

// Inside bootstrap():
configureSchedulerDeps({ db, gateway, projectRoot });
configureVaultDeps({ db, gateway });
configureEvolutionDeps({ db, gateway });  // ADD
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| BullMQ alone for queue | Inngest 4 wrapping BullMQ | Phase 1 decision (final) | step.run, step.waitForEvent, durable execution |
| Single Inngest client per app | Separate clients per app ID | Phase 6.1 (separate cauldron-web/engine) | Must serve each client at its own endpoint |

**Key architectural fact:** Inngest v4 identifies function apps by the Inngest client ID configured at construction (`new Inngest({ id: 'cauldron-engine' })`). Each distinct ID must be served at its own HTTP endpoint. Functions created with client A cannot be served by client B.

## Open Questions

1. **Where should the engine serve endpoint live — Next.js or CLI/Hono?**
   - What we know: Both are viable. Hono is simpler because bootstrap already configures deps. Next.js requires adding dep initialization to the route.
   - Recommendation: Hono path is architecturally cleaner for this phase. The CLI already uses Hono via `@hono/node-server`. The engine functions are execution-layer concerns, not web-UI concerns.

2. **Does `pipelineTriggerFunction` need to be extended to trigger bead dispatch?**
   - What we know: Success criterion 4 says "Pipeline trigger webhook reaches downstream bead dispatch through the engine functions." Current `pipelineTriggerFunction` emits a DB event but does not send `bead.dispatch_requested`.
   - What's unclear: Whether the success criterion requires this to be a single unbroken Inngest event chain, or whether a tRPC call from the webhook handler is acceptable.
   - Recommendation: Extend `pipelineTriggerFunction` to call `runDecomposition` via the engine (after the trigger-pipeline step finds the latest seed) — this keeps the flow within Inngest's durable execution context.

3. **Should the 5 engine functions also be added to the Next.js serve endpoint as an alternative?**
   - What we know: The web package already imports `@cauldron/engine` and has `inngest@4.1.0`.
   - Recommendation: Do not add them to Next.js unless the team explicitly wants web-controlled execution. The Hono-based approach keeps execution concerns separate from UI concerns.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `inngest` | Inngest serve adapter | Already installed in @cauldron/api | 4.1.0 | — |
| `hono` | Hono app for serve endpoint | Already installed in @cauldron/api | ^4.12.9 | — |
| `@hono/node-server` | Node.js Hono server | Already installed in @cauldron/api | ^1.13.0 | — |
| Inngest dev server | Local function invocation | docker compose up inngest | — | — |
| PostgreSQL | Engine dep initialization | docker compose up postgres | — | — |

**No missing dependencies — all required packages are already installed.**

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 |
| Config file | `packages/web/vitest.config.ts` (jsdom), `packages/engine/vitest.config.ts` (node) |
| Quick run command | `cd packages/web && pnpm test` or `cd packages/engine && pnpm test` |
| Full suite command | `pnpm --filter @cauldron/web test && pnpm --filter @cauldron/engine test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DAG-06 through EXEC-09, CODE, TEST, EVOL, HOLD-05-08 | Engine Inngest functions reachable via HTTP | smoke | `curl http://localhost:3000/api/inngest/engine` (or Hono port) | ❌ Wave 0 |
| EVOL-01 through EVOL-12 | `configureEvolutionDeps` wired, evolutionCycleHandler executes | unit | `pnpm --filter @cauldron/engine test` (existing fsm.test.ts) | ✅ existing |
| bootstrap integration | All 3 configurators called | unit | `pnpm --filter @cauldron/api test __tests__/bootstrap.test.ts` | ✅ existing |

### Sampling Rate
- **Per task commit:** `pnpm --filter @cauldron/api test && pnpm --filter @cauldron/web test`
- **Per wave merge:** Full suite above plus typecheck
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Smoke test for engine Inngest serve endpoint — confirms HTTP discovery works
- [ ] `bootstrap.test.ts` update — verify `configureEvolutionDeps` is called (may already exist, check coverage)

## Sources

### Primary (HIGH confidence)
- Source code audit: `packages/engine/src/holdout/events.ts` — `inngest` client (id: `cauldron-engine`) defined here
- Source code audit: `packages/engine/src/decomposition/events.ts` — 3 InngestFunctions defined
- Source code audit: `packages/engine/src/evolution/events.ts` — `handleEvolutionStarted` and `configureEvolutionDeps` defined
- Source code audit: `packages/api/src/bootstrap.ts` — `configureEvolutionDeps` missing
- Source code audit: `packages/web/src/app/api/inngest/route.ts` — only `cauldron-web` served
- Source code audit: `packages/web/node_modules/inngest/next.d.ts` — `serve(ServeHandlerOptions)` takes `client` + `functions`
- `.planning/v1.0-MILESTONE-AUDIT.md` — defines both gaps precisely

### Secondary (MEDIUM confidence)
- `inngest/hono` adapter exists in installed package (`hono.d.ts` present) — Hono serve pattern mirrors Next.js
- Existing `execution.ts` router using `inngest as engineInngest` import alias — confirms barrel export works

## Metadata

**Confidence breakdown:**
- Gap identification: HIGH — directly read from milestone audit and source code
- Serve endpoint location (Next.js vs Hono): MEDIUM — architectural reasoning, both are viable
- configureEvolutionDeps gap: HIGH — confirmed by reading bootstrap.ts and evolution/events.ts
- Dep initialization in serve handler: HIGH — confirmed by reading how configureSchedulerDeps works

**Research date:** 2026-03-27
**Valid until:** Stable (Inngest 4 API is stable; no fast-moving libraries involved)
