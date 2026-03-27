# Phase 16: Bridge Evolution Loop & Fix Bead Dispatch - Research

**Researched:** 2026-03-27
**Domain:** Inngest event bridging, bead dispatch payload correctness, SSE auth, DAG live status
**Confidence:** HIGH

## Summary

Phase 16 closes four specific integration gaps identified in the v1.0 audit. Each gap has been verified by reading the actual source files — the problems are concrete and the fixes are surgical.

**Gap 1 — Evolution trigger bridge:** `convergenceHandler` in `packages/engine/src/holdout/events.ts` emits `evolution_started` as a DB event via `appendEvent()`, but `handleEvolutionStarted` in `packages/engine/src/evolution/events.ts` listens for an *Inngest* event named `evolution_started`. These are two different channels. A DB `appendEvent()` write does not produce an Inngest event. The evo loop therefore never fires on holdout failure.

**Gap 2 — Bead dispatch payload:** `triggerExecution` in `packages/web/src/trpc/routers/execution.ts` sends `bead.dispatch_requested` with only `{ seedId, projectId }` — missing `beadId`. The `beadDispatchHandler` in `packages/engine/src/decomposition/events.ts` destructures `const { beadId, seedId, projectId } = event.data` and uses `beadId` immediately in the `check-upstream-waits` step. Without `beadId`, the first DB query returns an empty set and the bead is never claimed. The same problem exists in `pipelineTriggerFunction` in the web package. The evolution re-dispatch path (`evolutionCycleHandler`) sends `bead.dispatch_requested` without individual beadIds — but this is intentional because evolution dispatch triggers decomposition first, which creates new beads and then dispatches them individually.

**Gap 3 — Missing `bead_claimed` event:** After `claimBead()` succeeds in `beadDispatchHandler`, no `bead_claimed` event is appended. The event type exists in the `eventTypeEnum` schema (`packages/shared/src/db/schema/event.ts`), but the scheduler never emits it. The live DAG therefore has no way to show beads transitioning to `active` status.

**Gap 4 — Web SSE auth:** `useSSE` in `packages/web/src/hooks/useSSE.ts` uses the native browser `EventSource` which does not support custom request headers. When `CAULDRON_API_KEY` is set in the environment, the SSE route returns 401 for all web dashboard connections. The CLI already handles this correctly (via `eventsource` v4's custom `fetch` option), but the web hook does not.

**Primary recommendation:** Fix each gap as a targeted change to the specific file that owns it. No new infrastructure required — all four fixes are additive within existing patterns.

## Standard Stack

No new dependencies are introduced in this phase. All fixes use the existing stack.

### Core (already in project)
| Library | Version | Purpose | Relevant to Phase |
|---------|---------|---------|-------------------|
| `inngest` | 4.x | Durable event orchestration | Gap 1: `step.sendEvent` bridge |
| `@get-cauldron/shared` | workspace | DB client, `appendEvent`, event enum | Gap 3: `bead_claimed` event |
| `eventsource` | 4.x | SSE client with auth headers | Already used in CLI; web uses native `EventSource` |
| Vitest | 4.x | Unit test framework | All new code needs test coverage |

No new packages to install.

## Architecture Patterns

### Pattern 1: Inngest Event Bridge (fixing Gap 1)

The convergence handler must send an Inngest event so the evolution FSM fires. The correct pattern is `step.sendEvent()` inside a durable step, not `appendEvent()`.

**Current (broken):**
```typescript
// packages/engine/src/holdout/events.ts — Step 4
await step.run('emit-failure-event', async () => {
  await appendEvent(db, {
    projectId,
    seedId,
    type: 'evolution_started',
    payload: { failureReport: evalResult.failureReport, triggeredBy: 'holdout_failure' },
  });
});
```

**Fixed (dual-emit — DB event for audit trail + Inngest event for trigger):**
```typescript
await step.run('emit-failure-event', async () => {
  await appendEvent(db, {
    projectId,
    seedId,
    type: 'evolution_started',
    payload: { failureReport: evalResult.failureReport, triggeredBy: 'holdout_failure' },
  });
});
// Inngest event triggers handleEvolutionStarted FSM
await step.sendEvent('trigger-evolution-cycle', {
  name: 'evolution_started',
  data: {
    seedId,
    projectId,
    codeSummary,
    failureReport: evalResult.failureReport,
  },
});
```

The `step.sendEvent` signature in the existing codebase is:
`step.sendEvent(stepId: string, event: { name: string; data: Record<string, unknown> })`

This matches the `evolutionCycleHandler` event shape exactly: it expects `{ seedId, projectId, codeSummary, failureReport?, lineageRootId? }`.

**CRITICAL:** The `convergenceHandler` function signature currently does NOT include `step.sendEvent`. The `step` parameter type only has `step.run`. This must be extended to include `step.sendEvent` as well. The `handleEvolutionConverged` Inngest wrapper passes `ctx as any` so the type widening is safe.

### Pattern 2: Bead Dispatch With BeadId (fixing Gap 2)

`triggerExecution` in the web tRPC router must first query ready beads, then dispatch each one individually. The pattern already exists in `runDecomposition` in `pipeline.ts` and in `beadCompletionHandler` in `events.ts`:

```typescript
// packages/web/src/trpc/routers/execution.ts — triggerExecution fix
const readyBeads = await ctx.db
  .select()
  .from(beads)
  .where(
    and(
      eq(beads.seedId, input.seedId),
      eq(beads.status, 'pending'),
      sql`NOT EXISTS (SELECT 1 FROM bead_edges ...)`
    )
  );

for (const bead of readyBeads) {
  await engineInngest.send({
    name: 'bead.dispatch_requested',
    data: {
      beadId: bead.id,
      seedId: input.seedId,
      projectId: input.projectId,
      moleculeId: bead.moleculeId,
    } satisfies BeadDispatchPayload,
  });
}
```

Alternatively, call `findReadyBeads` which is already exported from `@get-cauldron/engine`. This is cleaner and avoids duplicating the SQL.

The same fix applies to `pipelineTriggerFunction` in `packages/web/src/inngest/pipeline-trigger.ts`. After `find-latest-seed`, it dispatches `bead.dispatch_requested` with only `{ seedId, projectId }`. It must also find ready beads and dispatch each individually with `beadId`.

**Note on evolution re-dispatch:** The evolution paths in `evolutionCycleHandler` (both lateral and normal) send `bead.dispatch_requested` with `{ seedId, projectId, tier, ... }` — without `beadId`. This is correct behavior for the *initial* dispatch that triggers decomposition of a new evolved seed. The decomposition pipeline (`runDecomposition`) then creates and dispatches individual beads with proper `beadId`s. This path does NOT need to change.

### Pattern 3: bead_claimed Event Emission (fixing Gap 3)

After `claimBead()` succeeds in `beadDispatchHandler`, emit the event before proceeding to execution. The `bead_claimed` event type already exists in the enum — no migration needed.

```typescript
// packages/engine/src/decomposition/events.ts — after Step 3 (claim-bead) succeeds
// Step 3.5: Emit bead_claimed for live DAG active status
await step.run('emit-claimed', async () => {
  await appendEvent(db, {
    projectId,
    seedId,
    beadId,
    type: 'bead_claimed',
    payload: { beadId, agentId: 'inngest-worker' },
  });
});
```

This event is used by the web DAG visualization to show beads in `active` status — it bridges the gap between `bead_dispatched` and `bead_completed`.

### Pattern 4: Web SSE Auth (fixing Gap 4)

The browser native `EventSource` API does not support sending custom headers. The solution is to pass the auth token as a query parameter when `CAULDRON_API_KEY` is set, and update the server-side SSE route to accept it via query param in addition to the `Authorization` header.

The server-side route already supports query param auth:
```typescript
// packages/web/src/app/api/events/[projectId]/route.ts — already implemented
const lastEventIdHeader = request.headers.get('last-event-id');
const url = new URL(request.url);
const lastEventIdParam = url.searchParams.get('lastEventId');
```

The route reads `lastEventId` from query params. The same pattern can be used for the auth token.

**Server update (add query param auth fallback):**
```typescript
const expectedKey = process.env['CAULDRON_API_KEY'];
if (expectedKey) {
  const authHeader = request.headers.get('Authorization');
  const providedKey = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : url.searchParams.get('token'); // query param fallback for browser EventSource
  if (providedKey !== expectedKey) {
    return new Response('Unauthorized', { status: 401 });
  }
}
```

**Client update (`useSSE` hook):** Read `NEXT_PUBLIC_CAULDRON_API_KEY` from the environment and append `?token=<key>` to the URL when set.

```typescript
// packages/web/src/hooks/useSSE.ts
const apiKey = process.env['NEXT_PUBLIC_CAULDRON_API_KEY'];
const fullUrl = lastIdRef.current > 0
  ? `${url}?lastEventId=${lastIdRef.current}${apiKey ? `&token=${apiKey}` : ''}`
  : apiKey
    ? `${url}?token=${apiKey}`
    : url;
```

The `NEXT_PUBLIC_` prefix is required for Next.js to expose the variable to the browser bundle. A new env var `NEXT_PUBLIC_CAULDRON_API_KEY` must be documented alongside `CAULDRON_API_KEY` in `.env.example`.

**Security note:** Passing API keys as query params is acceptable for v1 SSE auth because (a) the connection is expected to be TLS-protected in production, (b) this is an internal tool not a public SaaS, and (c) the alternative (proxy/server-component approach) is significantly more complex. The CLI already uses the `Authorization` header path, which is the better approach when available.

### Anti-Patterns to Avoid

- **Don't replace `appendEvent` with `step.sendEvent`:** The DB event must still be written for audit trail. Both must fire.
- **Don't refactor `triggerExecution` to call `runDecomposition`:** That mutates DB (creates beads). `triggerExecution` runs after decomposition — it only dispatches already-existing ready beads.
- **Don't put the auth token in `localStorage`:** The SSE stream URL is built server-side in the Next.js component tree. Use `NEXT_PUBLIC_` env var — it is inlined at build time and not dynamic.
- **Don't change the evolution re-dispatch payload:** The `bead.dispatch_requested` event from `evolutionCycleHandler` without a `beadId` is intentional — it signals "start decomposition for this new seed". The handler (`beadDispatchHandler`) currently reads `beadId` directly, which would fail. However, this dispatch actually goes through the same `handleBeadDispatchRequested` function... wait — let me re-examine.

**Critical re-examination of Gap 2 scope:**

Looking at `beadDispatchHandler` again: it destructures `const { beadId, seedId, projectId } = event.data` and immediately uses `beadId` in a DB query. If `beadId` is undefined, the `WHERE bead_edges.to_bead_id = undefined` query returns empty results (not an error), and the handler falls through to `claimBead(db, undefined, ...)` which will fail to find the bead.

The evolution re-dispatch from `evolutionCycleHandler` sends `{ seedId, projectId, tier, previousSeedId? }` — no `beadId`. This would cause the handler to run with `beadId = undefined`, which is silently broken.

**However:** The evolution dispatch is meant to trigger *decomposition*, not dispatch an individual bead. Looking at the `bead.dispatch_requested` event semantics — when it comes from `runDecomposition`, it carries a `beadId`. When it comes from the evolution handler, it doesn't. These are two different semantic uses of the same event name.

**Resolution:** The evolution handler should NOT send `bead.dispatch_requested` — it should send a different event, or more correctly: it should call `runDecomposition` by routing through the engine's decomposition pipeline. Alternatively, `beadDispatchHandler` needs a guard: if `beadId` is absent, treat the event as a "trigger decomposition" signal rather than a direct bead dispatch.

Looking at the existing test structure and CLAUDE.md decisions: Phase 11 decision states "pipelineTriggerFunction uses step.sendEvent (durable, inside Inngest function); triggerExecution uses engineInngest.send() (outside Inngest context, tRPC mutation)". The evolution handler IS inside an Inngest function and uses `step.sendEvent`.

**The cleanest fix for evolution re-dispatch:** Have `beadDispatchHandler` detect `beadId` absence and, in that case, trigger decomposition for the given `seedId` (loading the seed from DB, calling `runDecomposition`). This way a single Inngest function handles both paths. This is the minimal change that doesn't require a new Inngest event name or new function registration.

Alternatively, add a separate `handleSeedDecomposeRequested` function triggered by a new `seed.decompose_requested` event — cleaner semantically, requires registering in `inngest-serve.ts`.

**Recommended approach:** The cleanest minimal fix: update `beadDispatchHandler` to branch on `beadId` presence. When missing, run decomposition then dispatch ready beads. When present, run the normal dispatch path. The event schema becomes a discriminated union: `{ seedId, projectId } | { beadId, seedId, projectId, moleculeId }`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE auth with custom headers in browser | Custom WebSocket upgrade | Query param token on `EventSource` URL | Browser `EventSource` API has no header support; query param is the standard workaround |
| Finding ready beads | Inline SQL query in tRPC router | `findReadyBeads(db, seedId)` from `@get-cauldron/engine` | Already implemented with correct NOT EXISTS subquery, parent_child exclusion |
| Durable Inngest event sending | Direct `inngest.send()` inside a step | `step.sendEvent()` | `step.sendEvent` is idempotent across retries; `inngest.send()` inside a step would re-emit on each retry |

## Common Pitfalls

### Pitfall 1: step.sendEvent Type — Step Parameter Widening
**What goes wrong:** `convergenceHandler`'s `step` parameter type only declares `step.run`. Adding `step.sendEvent` requires widening the parameter type.
**Why it happens:** The function was designed for testability with a minimal `step` interface. The test suite passes a fake step with only `.run()`.
**How to avoid:** Add `sendEvent` to the `step` interface in `convergenceHandler`. Update existing tests to add a `sendEvent: vi.fn()` to the mock step object.
**Warning signs:** TypeScript error "Property 'sendEvent' does not exist on type..."

### Pitfall 2: Duplicate DB Events on Retry
**What goes wrong:** If `emit-failure-event` step runs successfully, then `trigger-evolution-cycle` sendEvent fails and the Inngest function retries, the DB event is appended again but the Inngest event fires only once (Inngest step idempotency).
**Why it happens:** `step.run` is idempotent across retries — it won't re-execute. So putting BOTH the `appendEvent` and `step.sendEvent` in the same `step.run` block prevents double-emit.
**How to avoid:** Combine `appendEvent` + `step.sendEvent` inside a single `step.run('emit-evolution-trigger', ...)` block. This ensures both happen atomically per Inngest's step memoization.

### Pitfall 3: NEXT_PUBLIC_ Env Var Build-Time Inlining
**What goes wrong:** `NEXT_PUBLIC_CAULDRON_API_KEY` is inlined at build time in Next.js. If the key changes, a rebuild is required. If the var is undefined at build time (e.g., in CI), the client code has `undefined` hardcoded.
**Why it happens:** Next.js replaces `process.env['NEXT_PUBLIC_*']` references with literal values during the webpack build.
**How to avoid:** Treat `undefined` as "auth disabled" — `const apiKey = process.env['NEXT_PUBLIC_CAULDRON_API_KEY']` then `apiKey ? `?token=${apiKey}` : ''`. The component renders without auth when key is absent (dev mode).

### Pitfall 4: triggerExecution Dispatching Zero Beads
**What goes wrong:** If `triggerExecution` is called before decomposition completes, `findReadyBeads` returns empty and nothing is dispatched. The mutation succeeds silently.
**Why it happens:** `triggerExecution` is a fire-and-forget — no feedback if beads were dispatched.
**How to avoid:** Return the count of dispatched beads in the mutation response so CLI/web can detect and warn on zero-dispatch.

### Pitfall 5: BeadDispatchPayload `moleculeId` Required
**What goes wrong:** `BeadDispatchPayload` has `moleculeId: string | null` as required. If `triggerExecution` builds the payload manually without calling `findReadyBeads`, it may omit `moleculeId`.
**Why it happens:** Manual payload construction is error-prone.
**How to avoid:** Use `satisfies BeadDispatchPayload` constraint when constructing the payload to let TypeScript catch missing fields at compile time. Or use `findReadyBeads` which returns full `Bead` objects.

### Pitfall 6: Evolution Dispatch Missing beadId — Silent Undefined
**What goes wrong:** `beadDispatchHandler` uses `beadId` from `event.data` immediately. If `beadId` is undefined (evolution dispatch path), `claimBead(db, undefined, ...)` runs DB queries with `WHERE id = undefined` which returns empty or throws.
**Why it happens:** The function was designed for single-bead dispatch but the evolution cycle reuses the same event name for a different semantic purpose.
**How to avoid:** Add an early guard: `if (!beadId) { /* handle as seed decompose trigger */ }`. Or rename the evolution dispatch event to `seed.decompose_requested` and register a new handler.

## Code Examples

Verified patterns from the existing codebase:

### Correct step.sendEvent Usage (from evolution/events.ts)
```typescript
// Source: packages/engine/src/evolution/events.ts:231
await step.sendEvent('trigger-decomposition-lateral', {
  name: 'bead.dispatch_requested',
  data: {
    seedId: lateralSeed.id,
    projectId,
    tier: 'full',
  },
});
```

### Correct BeadDispatchPayload Construction (from decomposition/pipeline.ts)
```typescript
// Source: packages/engine/src/decomposition/pipeline.ts:83
const payload: BeadDispatchPayload = {
  beadId: bead.id,
  seedId: seed.id,
  projectId,
  moleculeId: bead.moleculeId,
};
await inngest.send({ name: 'bead.dispatch_requested', data: payload });
```

### Correct appendEvent + Inngest dual-emit pattern (to be established)
```typescript
// New pattern for Gap 1 fix in holdout/events.ts
await step.run('emit-evolution-trigger', async () => {
  // Write DB audit event
  await appendEvent(db, {
    projectId,
    seedId,
    type: 'evolution_started',
    payload: { failureReport: evalResult.failureReport, triggeredBy: 'holdout_failure' },
  });
  // Trigger Inngest FSM (same step for retry idempotency)
  await inngest.send({
    name: 'evolution_started',
    data: { seedId, projectId, codeSummary, failureReport: evalResult.failureReport },
  });
});
```

Note: Using `inngest.send()` rather than `step.sendEvent()` inside `step.run` is acceptable here because `step.run` already provides idempotency. `step.sendEvent` is only needed when called *outside* a `step.run` block.

### findReadyBeads usage (from decomposition/pipeline.ts)
```typescript
// Source: packages/engine/src/decomposition/pipeline.ts:78
const readyBeads = await findReadyBeads(db, seed.id);
for (const bead of readyBeads) {
  // ...dispatch each bead
}
```

## Runtime State Inventory

Step 2.5: SKIPPED — this is a bug-fix/bridge phase, not a rename or migration.

## Environment Availability

Step 2.6: SKIPPED — no new external dependencies. All tools already present from previous phases.

## Validation Architecture

nyquist_validation is enabled in `.planning/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `packages/engine/vitest.config.ts`, `packages/web/vitest.config.ts` |
| Quick run command | `pnpm -F @get-cauldron/engine test -- --grep "convergence\|dispatch\|claim"` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HOLD-07 | Unsealed holdout results determine additional evolution cycles | unit | `pnpm -F @get-cauldron/engine test -- src/holdout/__tests__/events.test.ts` | Yes |
| HOLD-08 | Holdout failure triggers evolution cycle (Inngest event bridge) | unit | `pnpm -F @get-cauldron/engine test -- src/holdout/__tests__/events.test.ts` | Yes — needs new test case |
| EVOL-01 | Post-execution evaluation assesses goal attainment | unit | `pnpm -F @get-cauldron/engine test -- src/evolution/__tests__/fsm.test.ts` | Yes |
| EVOL-02 | Evaluation uses weighted principles from seed | unit | `pnpm -F @get-cauldron/engine test -- src/evolution/__tests__/evaluator.test.ts` | Yes |
| EVOL-03 | Goal not met → new evolved seed with parent reference | unit | `pnpm -F @get-cauldron/engine test -- src/evolution/__tests__/fsm.test.ts` | Yes |
| EVOL-04 | Evolution decomposes new/changed ACs into new beads | unit | `pnpm -F @get-cauldron/engine test -- src/evolution/__tests__/fsm.test.ts` | Yes |
| EVOL-05 | Convergence: ontology stability >= 0.95 | unit | `pnpm -F @get-cauldron/engine test -- src/evolution/__tests__/convergence.test.ts` | Yes |
| EVOL-06 | Convergence: stagnation (unchanged 3 generations) | unit | `pnpm -F @get-cauldron/engine test -- src/evolution/__tests__/convergence.test.ts` | Yes |
| EVOL-07 | Convergence: oscillation detection | unit | `pnpm -F @get-cauldron/engine test -- src/evolution/__tests__/convergence.test.ts` | Yes |
| EVOL-08 | Convergence: repetitive feedback >= 70% | unit | `pnpm -F @get-cauldron/engine test -- src/evolution/__tests__/convergence.test.ts` | Yes |
| EVOL-09 | Hard cap: max 30 evolution generations | unit | `pnpm -F @get-cauldron/engine test -- src/evolution/__tests__/convergence.test.ts` | Yes |
| EVOL-10 | Lateral thinking activates on stagnation | unit | `pnpm -F @get-cauldron/engine test -- src/evolution/__tests__/lateral-thinking.test.ts` | Yes |
| EVOL-11 | Human escalation triggers when convergence unlikely | unit | `pnpm -F @get-cauldron/engine test -- src/evolution/__tests__/fsm.test.ts` | Yes |
| EVOL-12 | Token budget circuit breaker halts evolution | unit | `pnpm -F @get-cauldron/engine test -- src/evolution/__tests__/fsm.test.ts` | Yes |
| DAG-05 | Beads execute concurrently without explicit deps | unit | `pnpm -F @get-cauldron/engine test -- src/decomposition/__tests__/events.test.ts` | Yes — needs new test for bead_claimed |
| EXEC-03 | Multiple agents execute independent beads concurrently | unit | `pnpm -F @get-cauldron/engine test -- src/decomposition/__tests__/events.test.ts` | Yes |
| WEB-03 | Live DAG shows bead status (pending, active, completed, failed) | unit | `pnpm -F @get-cauldron/web test -- src/app/api/events/__tests__/route.test.ts` | Yes — needs bead_claimed coverage |
| WEB-04 | Real-time streaming via SSE | unit | `pnpm -F @get-cauldron/web test -- src/app/api/events/__tests__/route.test.ts` | Yes — needs token query param auth test |

### Wave 0 Gaps

The following test cases must be added (test FILES already exist):

- [ ] `packages/engine/src/holdout/__tests__/events.test.ts` — add test: "When evaluation fails, step.sendEvent fires evolution_started Inngest event"
- [ ] `packages/engine/src/holdout/__tests__/events.test.ts` — update mock `step` objects to include `sendEvent: vi.fn()`
- [ ] `packages/engine/src/decomposition/__tests__/events.test.ts` — add test: "After successful claim, bead_claimed event is emitted"
- [ ] `packages/web/src/app/api/events/__tests__/route.test.ts` — add test: "Returns 200 when CAULDRON_API_KEY is set and correct `token` query param is provided"
- [ ] `packages/web/src/trpc/routers/execution.ts` test — add test: "triggerExecution dispatches bead.dispatch_requested with beadId for each ready bead"

## State of the Art

All code changes in this phase use existing Inngest v4 patterns established in prior phases. No new APIs involved.

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `appendEvent()` for cross-handler triggers | `step.sendEvent()` for Inngest + `appendEvent()` for DB audit | Phase 11 established this dual-emit pattern | Evolution loop fires correctly |
| Browser `EventSource` without auth | `EventSource` URL with `?token=` query param | This phase | Web dashboard SSE works when API key is set |

## Open Questions

1. **Evolution re-dispatch semantic: separate event vs. conditional handler**
   - What we know: `evolutionCycleHandler` sends `bead.dispatch_requested` without `beadId`; `beadDispatchHandler` requires `beadId`
   - What's unclear: Is the cleanest fix (a) branch in `beadDispatchHandler` on `beadId` presence, or (b) introduce `seed.decompose_requested` event + new handler?
   - Recommendation: Branch in `beadDispatchHandler` — less infrastructure, consistent with Inngest function count (5 functions already registered in `inngest-serve.ts`). Add `beadId?: string` to the event data type, check presence at top of handler, and route to decomposition path if absent.

2. **`codeSummary` in evolution trigger**
   - What we know: `evolutionCycleHandler` requires `codeSummary` in event data; `convergenceHandler` has `codeSummary` in its event data
   - What's unclear: Is there a meaningful `codeSummary` to pass at this point?
   - Recommendation: Pass the same `codeSummary` from the `evolution_converged` event through to the `evolution_started` trigger. It's already in scope.

## Sources

### Primary (HIGH confidence)
- Direct code reading — `/packages/engine/src/holdout/events.ts` — convergenceHandler step parameter, appendEvent vs. sendEvent
- Direct code reading — `/packages/engine/src/evolution/events.ts` — handleEvolutionStarted trigger, evolutionCycleHandler event shape
- Direct code reading — `/packages/engine/src/decomposition/events.ts` — beadDispatchHandler payload destructuring, bead_claimed absence
- Direct code reading — `/packages/engine/src/decomposition/scheduler.ts` — claimBead implementation
- Direct code reading — `/packages/web/src/trpc/routers/execution.ts` — triggerExecution missing beadId
- Direct code reading — `/packages/web/src/inngest/pipeline-trigger.ts` — pipeline trigger missing beadId
- Direct code reading — `/packages/web/src/hooks/useSSE.ts` — native EventSource, no header support
- Direct code reading — `/packages/web/src/app/api/events/[projectId]/route.ts` — existing query param support for lastEventId
- Direct code reading — `/packages/shared/src/db/schema/event.ts` — bead_claimed exists in enum

### Secondary (MEDIUM confidence)
- MDN Web API docs (training knowledge): Browser `EventSource` does not support custom headers — well-established browser API limitation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing stack, no new dependencies
- Architecture: HIGH — gaps identified by reading actual source; patterns verified from existing working code
- Pitfalls: HIGH — each pitfall derived from concrete code analysis, not speculation

**Research date:** 2026-03-27
**Valid until:** 2026-06-27 (stable codebase — Inngest v4 API is stable)

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HOLD-07 | Unsealed holdout results determine whether additional evolution cycles needed | convergenceHandler already evaluates and stores; Gap 1 fix (step.sendEvent) makes the trigger reach evolutionCycleHandler |
| HOLD-08 | Holdout failure triggers new evolutionary cycle with failure context | Fixed by Gap 1: add step.sendEvent('evolution_started') after holdout failure in convergenceHandler |
| EVOL-01 | Post-execution evaluation assesses goal attainment | evolutionCycleHandler already calls evaluateGoalAttainment; reachable after Gap 1 fix |
| EVOL-02 | Evaluation uses weighted principles from seed | evaluateGoalAttainment in evolution/evaluator.ts already implements this; no change needed |
| EVOL-03 | Goal not met → new immutable evolved seed with parent reference | mutateSeed in evolution/mutator.ts already implements; reachable after Gap 1 fix |
| EVOL-04 | Evolution decomposes new/changed ACs into new beads | evolutionCycleHandler sends bead.dispatch_requested after mutation; Gap 2 fix ensures correct payload |
| EVOL-05 | Convergence: ontology stability >= 0.95 across 2 generations | checkConvergence in evolution/convergence.ts already implements; reachable after Gap 1 fix |
| EVOL-06 | Convergence: stagnation unchanged for 3 generations | checkStagnation in evolution/convergence.ts already implements; reachable after Gap 1 fix |
| EVOL-07 | Convergence: oscillation (period-2 cycling) detection | checkConvergence handles oscillation; reachable after Gap 1 fix |
| EVOL-08 | Convergence: repetitive feedback >= 70% | checkConvergence handles repetitive feedback; reachable after Gap 1 fix |
| EVOL-09 | Hard cap: max 30 evolution generations | checkConvergence enforces generation cap; reachable after Gap 1 fix |
| EVOL-10 | Lateral thinking activates on stagnation | runLateralThinking in evolution/lateral-thinking.ts; reachable after Gap 1 fix |
| EVOL-11 | Human escalation triggers when convergence unlikely | evolutionCycleHandler emits evolution_escalated; reachable after Gap 1 fix |
| EVOL-12 | Token budget circuit breaker halts evolution | checkLineageBudget in evolution/budget.ts; reachable after Gap 1 fix |
| DAG-05 | Parallel-by-default execution without explicit dependencies | beadCompletionHandler already dispatches ready beads; Gap 3 fix adds bead_claimed for live status |
| EXEC-03 | Multiple agents execute independent beads concurrently | Gap 2 fix (beadId in triggerExecution) ensures all ready beads get individual dispatch events for parallel pickup |
| WEB-03 | Live DAG showing pending, active, completed, failed bead status | Gap 3 fix (bead_claimed event emission) enables active status transitions in DAG |
| WEB-04 | Real-time streaming of agent logs via SSE | Gap 4 fix (useSSE query param auth) ensures web SSE connections work when CAULDRON_API_KEY is set |
</phase_requirements>
