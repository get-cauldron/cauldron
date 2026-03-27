# Phase 10: Wire tRPC Write Mutations to Engine - Research

**Researched:** 2026-03-27
**Domain:** tRPC mutation → engine function wiring (Next.js web layer + @cauldron/engine)
**Confidence:** HIGH

## Summary

Phase 9's tRPC refactoring introduced three stub mutations in the web layer that record DB events without ever calling the engine functions that perform the actual work. The code gap is narrow and surgical: each stub needs to be replaced with a real engine call. The engine functions themselves are complete, tested, and working — Phase 6.2 demonstrated the full pipeline operating via direct calls. This phase re-routes the three write paths through the engine.

The three breaks are: (1) `interview.sendAnswer` appends a partial user turn without calling `InterviewFSM.submitAnswer()` — LLM scoring never runs and the interview cannot advance; (2) `interview.sealHoldouts` sets `status='sealed'` in the DB without calling `sealVault()` — ciphertext/iv/authTag columns remain null and encryption never occurs; (3) `execution.triggerDecomposition` appends a `decomposition_started` DB event with no Inngest listener — `runDecomposition()` is never invoked. Fixing all three restores Flow 1 (Interview → Seal → Decompose) and satisfies INTV-01 through INTV-07, HOLD-03 through HOLD-05, and DAG-01 through DAG-05.

The primary architectural challenge is dependency injection: the current `createTRPCContext` in `packages/web/src/trpc/init.ts` only provides `db` and `authenticated`. The engine mutations require `LLMGateway`, `GatewayConfig`, pino logger, and Inngest client. The solution is to construct these lazily within the tRPC context (or extend the context factory to build them once per request from environment variables) — the web package already declares `@cauldron/engine` as a direct dependency, so no new package wiring is needed.

**Primary recommendation:** Extend `createTRPCContext` to lazily initialize `gateway`, `config`, and `logger` from environment variables; then replace each stub mutation body with the corresponding engine call.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INTV-01 | Multi-perspective panel question generation | `InterviewFSM.submitAnswer()` calls `runActivePerspectives()` internally — wiring FSM satisfies this |
| INTV-02 | MC answer suggestions per question | `rankCandidates()` inside FSM returns `mcOptions` — reachable once FSM is called |
| INTV-03 | Deterministic ambiguity scoring per response | `scoreTranscript()` inside FSM with `temperature=0` — unreachable until sendAnswer calls FSM |
| INTV-04 | Interview continues until score >= 0.8 | `CLARITY_THRESHOLD=0.8` inside FSM loop — needs FSM instantiated in production |
| INTV-05 | Brownfield variant scoring weights | `brownfieldScoresSchema` in `scorer.ts` — FSM auto-selects based on `interview.mode` |
| INTV-06 | Structured summary for review | `synthesizeFromTranscript()` inside FSM — reachable once FSM path is live |
| INTV-07 | User approves summary before seed generation | `approveAndCrystallize()` requires reviewing phase, which FSM transitions to — gate becomes functional |
| HOLD-03 | AES-256-GCM encryption at rest | `sealVault()` in `packages/engine/src/holdout/vault.ts` — currently bypassed in sealHoldouts |
| HOLD-04 | Encryption key inaccessible to agent processes | `HOLDOUT_ENCRYPTION_KEY` env var only needed in web/API process — already isolated by architecture |
| HOLD-05 | Holdout tests remain sealed during execution | Seal transition via `sealVault()` must actually write ciphertext columns — currently null |
| DAG-01 | Seed AC decomposed into molecules/beads | `runDecomposition()` in `pipeline.ts` — never called from triggerDecomposition |
| DAG-02 | Each bead sized to fit in 200k context window | Validated inside `decomposeSeed()` — unreachable from tRPC triggerDecomposition |
| DAG-03 | Bead size validated at decomposition time | `validateBeadSizes()` inside decomposer — same unreachability as DAG-01 |
| DAG-04 | Four dependency types supported | Persisted by `persistDecomposition()` — needs runDecomposition called |
| DAG-05 | Parallel-by-default execution | `findReadyBeads()` + Inngest dispatch inside `runDecomposition()` — blocked by same gap |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- TypeScript end-to-end — all new code must be `.ts`/`.tsx`
- Vercel AI SDK for LLM interface — engine already uses it; no direct SDK calls in web tRPC layer
- OSS dependencies: use existing libraries, no new packages unless clearly justified
- `node:crypto` AES-256-GCM for holdout encryption — already implemented in `engine/src/holdout/crypto.ts`; tRPC sealHoldouts just needs to call the vault function
- GSD workflow enforcement: changes go through GSD plan execution, not ad-hoc edits
- No mocks in integration tests — use real Postgres with test transactions

## Standard Stack

### Core (already in place — no new dependencies)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@cauldron/engine` | workspace:* | InterviewFSM, sealVault, runDecomposition | Already in web package.json |
| `@cauldron/shared` | workspace:* | DbClient, appendEvent, schema tables | Already in web package.json |
| `inngest` | ^4.1.0 | Inngest client for event dispatch in runDecomposition | Already in web package.json |
| `pino` | not yet in web | Logger required by InterviewFSM and LLMGateway | Must be added OR use console-based minimal logger stub |
| `@trpc/server` | 11.15.1 | tRPC context extension | Already in web package.json |

**Version verification:** All packages confirmed present in `packages/web/package.json` from direct read. `pino` is NOT currently in web's package.json — see Architecture Patterns for the logger strategy.

**Installation (only if pino logger approach chosen):**
```bash
pnpm add pino --filter @cauldron/web
```

Alternatively, use a minimal console-logger stub in the web layer to avoid adding pino. The engine accepts `Logger` from pino's type — a compatible object `{ info: console.log, warn: console.warn, error: console.error, debug: () => {} }` satisfies the interface structurally.

## Architecture Patterns

### Pattern 1: Extend tRPC Context with Lazy Engine Deps

The current context factory in `packages/web/src/trpc/init.ts`:

```typescript
// CURRENT — only provides db and authenticated
export const createTRPCContext = cache(async (req?: Request) => {
  const authenticated = validateApiKey(req);
  return { db, authenticated };
});
```

The pattern to add engine deps lazily:

```typescript
// Source: packages/api/src/bootstrap.ts (existing pattern)
// LLMGateway.create accepts { db, config, logger, validateKeys }
// loadConfig(projectRoot) reads cauldron.config.ts from disk

// Extended context — engine deps built once and cached
import { LLMGateway, loadConfig } from '@cauldron/engine';
import { inngest } from '../inngest/client.js'; // cauldron-web Inngest client

let _gateway: LLMGateway | null = null;
let _config: GatewayConfig | null = null;

async function getEngineDeps() {
  if (!_gateway || !_config) {
    const projectRoot = process.cwd();
    _config = await loadConfig(projectRoot);
    const logger = makeLogger(); // pino or minimal console stub
    _gateway = await LLMGateway.create({ db, config: _config, logger, validateKeys: false });
  }
  return { gateway: _gateway, config: _config };
}
```

**Key decision:** `validateKeys: false` in the web context — the web layer should not fail to start if API keys are absent (e.g., read-only dashboard use). The engine mutations that call LLMs will fail naturally if keys are missing when the mutation actually runs.

### Pattern 2: sendAnswer — Call FSM.submitAnswer() Synchronously

The FSM `submitAnswer()` makes LLM calls (scoring + perspectives + ranking) — this takes several seconds. The web tRPC mutation must either:
- **Option A (recommended):** Call FSM synchronously, return the full TurnResult — the client awaits the response. This matches how Phase 6.2 worked via direct engine calls. The web dashboard already handles async responses via tRPC's async mutation.
- **Option B (deferred async):** Dispatch to an Inngest function for async processing. More complex, requires a new Inngest function, and the client would need polling or SSE to get the result.

**Recommendation: Option A — synchronous FSM call.** The Phase 8 comment in the stub mutation ("LLM scoring runs async via engine") is aspirational documentation that was never implemented. The actual UX benefit of truly async scoring is marginal given the interview is already interactive. Inngest async for the interview path adds complexity without clear benefit for Phase 10 scope.

FSM constructor signature (from `fsm.ts`):
```typescript
new InterviewFSM(
  db: DbClient,        // from ctx.db
  gateway: LLMGateway, // from ctx.gateway (extended context)
  config: GatewayConfig, // from ctx.config (extended context)
  logger: Logger,       // minimal console stub or pino
)
```

`submitAnswer()` signature:
```typescript
async submitAnswer(
  interviewId: string,
  projectId: string,
  answer: { userAnswer: string; freeformText?: string },
): Promise<TurnResult>
```

The mutation currently has `projectId` and `answer`/`freeformText` as inputs but needs `interviewId`. The mutation already queries for the interview by `projectId` — `interview.id` is available before the engine call.

### Pattern 3: sealHoldouts — Call sealVault() Per Approved Vault Entry

Current stub:
```typescript
// Sets status='sealed' without calling sealVault()
await ctx.db.update(holdoutVault).set({ status: 'sealed', encryptedAt: new Date() })...
```

`sealVault()` signature (from `vault.ts`):
```typescript
async function sealVault(
  db: DbClient,
  params: { vaultId: string; projectId: string }
): Promise<void>
```

`sealVault()` requires the vault to be in `'approved'` status (not `'sealed'`) — it handles the transition internally. The current stub's approach of finding entries with `status === 'approved'` is correct for identifying which vaults to seal.

**Critical finding:** The current stub calls `approveHoldout` which sets `status='approved'` on individual holdout entries, then `sealHoldouts` currently sets `status='sealed'` directly bypassing `sealVault()`. The fix is: call `sealVault(ctx.db, { vaultId: entry.id, projectId })` for each approved entry instead of the direct DB update. `sealVault()` handles the `approved → sealed` transition, writes ciphertext/iv/authTag, and nullifies draftScenarios.

**Important:** `sealVault()` requires `approveScenarios()` to have been called first (it checks that `draftScenarios` has `_approved: true` entries). The existing `approveHoldout` tRPC mutation only sets the vault row's `status='approved'` — it does NOT call `approveScenarios()`. The plan must address this: either call `approveScenarios()` in `approveHoldout`, or call it as a prerequisite inside `sealVault()` wrapper logic. Looking at the vault code: `sealVault()` reads `vault.draftScenarios` and filters by `_approved: true`. This field is set by `approveScenarios()`. The current `approveHoldout` just does `db.update(...).set({ status: 'approved' })` without touching `draftScenarios._approved`.

**This is a deeper gap than it appears.** The `sealHoldouts` fix needs to also ensure `_approved` flags are set on the `draftScenarios` JSONB. The plan should call `approveScenarios(db, { vaultId, approvedIds: 'all' })` before `sealVault()` for any entry in `approved` status with unapproved draft scenarios — OR fix `approveHoldout` to call `approveScenarios()`.

### Pattern 4: triggerDecomposition — Call runDecomposition() or Dispatch Inngest Event

`runDecomposition()` signature:
```typescript
async function runDecomposition(options: RunDecompositionOptions): Promise<RunDecompositionResult>

interface RunDecompositionOptions {
  db: DbClient;
  gateway: LLMGateway;
  inngest: Inngest;  // needs the engine's inngest client, not web's
  seed: Seed;
  projectId: string;
  maxRetries?: number;
  tokenBudget?: number;
}
```

**Critical:** `runDecomposition()` accepts an `Inngest` instance parameter. It calls `inngest.send({ name: 'bead.dispatch_requested', ... })` to dispatch ready beads. The engine Inngest functions are registered with `cauldron-engine` client (id: `'cauldron-engine'`) from `packages/engine/src/holdout/events.ts`. The web layer has a separate client (`id: 'cauldron-web'`).

**Design decision for Phase 10:** The `triggerDecomposition` mutation should call `runDecomposition()` directly, passing the engine's `inngest` client (imported from `@cauldron/engine`). The engine Inngest client (`cauldron-engine`) sends `bead.dispatch_requested` events. Whether those events are actually processed depends on Phase 11 (serving the engine Inngest functions). For Phase 10, the goal is to get `runDecomposition()` called — the decomposition DB rows will be written and events dispatched even if the bead dispatch handlers aren't served yet.

```typescript
// Import from engine
import { inngest as engineInngest } from '@cauldron/engine'; // re-exported from holdout/events.ts

// In the mutation:
const seed = await ctx.db.select().from(seeds).where(eq(seeds.id, input.seedId)).limit(1);
await runDecomposition({
  db: ctx.db,
  gateway: ctx.gateway,
  inngest: engineInngest,
  seed: seed[0],
  projectId: input.projectId,
});
```

**Verify export:** `packages/engine/src/index.ts` exports `* from './holdout/index.js'` — `holdout/events.ts` is re-exported from `holdout/index.ts` which does `export * from './events.js'`. Confirmed: `inngest` is exported from the engine package.

### Pattern 5: Minimal Console Logger for Web Context

To avoid adding pino to the web package, create a minimal logger stub:

```typescript
// packages/web/src/trpc/engine-logger.ts
import type { Logger } from 'pino';

// Structurally compatible with pino.Logger — web layer doesn't need pino levels
export function makeConsoleLogger(): Logger {
  return {
    info: (obj: unknown, msg?: string) => console.log('[engine]', msg ?? obj),
    warn: (obj: unknown, msg?: string) => console.warn('[engine]', msg ?? obj),
    error: (obj: unknown, msg?: string) => console.error('[engine]', msg ?? obj),
    debug: () => {},
    trace: () => {},
    fatal: (obj: unknown, msg?: string) => console.error('[engine:fatal]', msg ?? obj),
    child: () => makeConsoleLogger(),
  } as unknown as Logger;
}
```

However, pino is already in `packages/api` — it is a known good dependency. The cleaner path is adding it to web. The decision is the planner's to make based on tradeoff.

### Anti-Patterns to Avoid
- **Don't add a new Inngest function for sendAnswer LLM scoring** — adds async complexity, polling requirements, and is explicitly out of scope for Phase 10. Phase 10 goal is synchronous wiring.
- **Don't import engine's `inngest` client via deep path** — use barrel export from `@cauldron/engine` directly.
- **Don't duplicate LLMGateway construction logic** — the same pattern from `bootstrap.ts` should be extracted into a shared utility or replicated cleanly in `init.ts`.
- **Don't call `sealVault()` without ensuring `_approved` flags are set** — `sealVault()` will throw if approved scenario count < 5 and the `_approved` flags are not set on draftScenarios.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Interview FSM scoring | Custom scoring in tRPC router | `InterviewFSM.submitAnswer()` | All scoring, perspective selection, MC generation is there |
| Vault encryption | Direct `node:crypto` calls in tRPC router | `sealVault()` from engine/holdout/vault.ts | AES-256-GCM with DEK wrapping pattern already correct |
| Decomposition pipeline | Manual decomposer + scheduler calls in tRPC | `runDecomposition()` from engine/decomposition/pipeline.ts | Handles retry, event emission, ready-bead dispatch atomically |
| LLM gateway construction | New LLMGateway initialization logic | Pattern from `packages/api/src/bootstrap.ts` | Same config loading + gateway construction already exists |

**Key insight:** All three engine functions are complete, tested, and working. The task is wiring, not building.

## Common Pitfalls

### Pitfall 1: tRPC Context Missing Engine Deps
**What goes wrong:** Mutation calls `ctx.gateway` which doesn't exist on the current context type — TypeScript compile error or runtime undefined.
**Why it happens:** `createTRPCContext` only returns `{ db, authenticated }` currently.
**How to avoid:** Extend `createTRPCContext` to lazily initialize and memoize `gateway` and `config`. Cache at module level to avoid constructing LLMGateway on every request.
**Warning signs:** TS error `Property 'gateway' does not exist on type...` at compile time.

### Pitfall 2: sealVault() Called Without _approved Flags Set
**What goes wrong:** `sealVault()` throws "Minimum 5 approved scenarios required to seal" even though `status='approved'` is set on the vault row.
**Why it happens:** The vault's `draftScenarios` JSONB has `_approved: false` on all scenarios — `approveScenarios()` was never called. The existing `approveHoldout` tRPC mutation only updates the row's `status` field, not the JSONB `_approved` flags.
**How to avoid:** Before calling `sealVault()`, call `approveScenarios(ctx.db, { vaultId: entry.id, approvedIds: 'all' })` for each approved-status entry. OR fix `approveHoldout` to call `approveScenarios()` as part of its implementation.
**Warning signs:** `sealVault()` throws with scenario count 0 despite rows being in `approved` status.

### Pitfall 3: Wrong Inngest Client for runDecomposition
**What goes wrong:** Passing web's `inngest` (id: `'cauldron-web'`) to `runDecomposition()` — bead dispatch events are sent to a client that has no `bead.dispatch_requested` listener.
**Why it happens:** Two Inngest clients exist in the monorepo. Web's client is imported via `'../inngest/client.js'`; engine's client is in `@cauldron/engine`.
**How to avoid:** Always import `inngest` from `@cauldron/engine` when calling engine pipeline functions. The `cauldron-engine` client owns the bead dispatch event namespace.
**Warning signs:** `bead.dispatch_requested` events appear in Inngest dev server with zero function runs.

### Pitfall 4: loadConfig() Fails in Next.js Server Context
**What goes wrong:** `loadConfig(projectRoot)` tries to import `cauldron.config.ts` via `import(configPath)` — in Next.js App Router this may fail due to dynamic import restrictions or working directory differences.
**Why it happens:** Next.js bundles server code; `process.cwd()` in a Next.js server route may not point to the monorepo root.
**How to avoid:** Pass `projectRoot` explicitly (e.g., from `process.env['CAULDRON_PROJECT_ROOT']` or derived from `import.meta.dirname`). Verify `loadConfig` works in Next.js server context during Wave 0 testing.
**Warning signs:** `ERR_MODULE_NOT_FOUND` on `cauldron.config.ts` at runtime.

### Pitfall 5: sendAnswer Response Shape Mismatch
**What goes wrong:** The existing `sendAnswer` stub returns `{ interviewId, turnNumber, currentScores, thresholdMet, phase }`. The FSM `submitAnswer()` returns `TurnResult = { turn, scores, nextQuestion, thresholdMet }`. The CLI and web dashboard depend on the tRPC response shape.
**Why it happens:** The stub was designed with a simplified return type.
**How to avoid:** Map `TurnResult` to the existing response shape OR update the response to include the full `TurnResult` (richer data is strictly additive for callers). The CLI `interviewCommand` only reads `result.currentScores?.overall` and `result.thresholdMet` — adding fields is backward-compatible. The web dashboard reads the same fields. Keep existing fields + add `turn` and `nextQuestion` for completeness.
**Warning signs:** TypeScript errors on tRPC client side if response type changes incompatibly.

## Code Examples

### sendAnswer with FSM
```typescript
// Source: packages/engine/src/interview/fsm.ts (InterviewFSM.submitAnswer signature)
// Source: packages/web/src/trpc/routers/interview.ts (existing mutation structure)

sendAnswer: publicProcedure
  .input(z.object({
    projectId: z.string(),
    answer: z.string(),
    freeformText: z.string().optional(),
  }))
  .mutation(async ({ input, ctx }) => {
    const { projectId, answer, freeformText } = input;
    const { gateway, config, logger } = await ctx.getEngineDeps();

    const [interview] = await ctx.db.select().from(interviews)
      .where(eq(interviews.projectId, projectId))
      .orderBy(desc(interviews.createdAt)).limit(1);

    if (!interview) throw new Error(`No active interview for project ${projectId}`);

    const fsm = new InterviewFSM(ctx.db, gateway, config, logger);
    const result = await fsm.submitAnswer(
      interview.id,
      projectId,
      { userAnswer: answer, freeformText },
    );

    return {
      interviewId: interview.id,
      turnNumber: result.turn.turnNumber,
      currentScores: result.scores,
      thresholdMet: result.thresholdMet,
      phase: result.thresholdMet ? 'reviewing' : 'gathering',
      nextQuestion: result.nextQuestion,
    };
  }),
```

### sealHoldouts with sealVault
```typescript
// Source: packages/engine/src/holdout/vault.ts (sealVault + approveScenarios signatures)

sealHoldouts: publicProcedure
  .input(z.object({ seedId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    const { seedId } = input;

    // Get the project ID for event emission (sealVault needs it)
    const [seedRow] = await ctx.db.select().from(seeds)
      .where(eq(seeds.id, seedId)).limit(1);
    if (!seedRow) throw new Error(`Seed ${seedId} not found`);

    const approvedEntries = await ctx.db.select().from(holdoutVault)
      .where(and(eq(holdoutVault.seedId, seedId), eq(holdoutVault.status, 'approved')));

    if (approvedEntries.length === 0) throw new Error(`No approved holdouts for seed ${seedId}`);

    for (const entry of approvedEntries) {
      // Ensure _approved flags are set before sealing
      await approveScenarios(ctx.db, { vaultId: entry.id, approvedIds: 'all' });
      await sealVault(ctx.db, { vaultId: entry.id, projectId: seedRow.projectId });
    }

    return { seedId, sealedCount: approvedEntries.length };
  }),
```

### triggerDecomposition with runDecomposition
```typescript
// Source: packages/engine/src/decomposition/pipeline.ts (runDecomposition signature)
// Source: packages/engine/src/holdout/events.ts (engine inngest export)

triggerDecomposition: publicProcedure
  .input(z.object({ projectId: z.string().uuid(), seedId: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    const { gateway, config, logger } = await ctx.getEngineDeps();
    const { inngest: engineInngest } = await import('@cauldron/engine');

    const [seed] = await ctx.db.select().from(seeds)
      .where(eq(seeds.id, input.seedId)).limit(1);
    if (!seed) throw new Error(`Seed ${input.seedId} not found`);

    await runDecomposition({
      db: ctx.db,
      gateway,
      inngest: engineInngest,
      seed,
      projectId: input.projectId,
    });

    return { success: true, message: 'Decomposition triggered' };
  }),
```

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@cauldron/engine` | All 3 mutations | ✓ | workspace:* in web/package.json | — |
| `HOLDOUT_ENCRYPTION_KEY` env var | sealVault() → sealPayload() | Must be set | — | Sealing throws if absent |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | LLMGateway (sendAnswer FSM, triggerDecomposition) | Set in dev .env | — | Gateway call fails at runtime |
| `CAULDRON_PROJECT_ROOT` or `process.cwd()` | loadConfig() | ✓ (cwd works in Next.js server) | — | loadConfig falls back to Cauldron's own config |
| pino | Logger for InterviewFSM | ✗ not in web package.json | — | Console stub or `pnpm add pino --filter @cauldron/web` |

**Missing dependencies:**
- `pino` is not in web's package.json. Either add it or use a console-logger stub — see Pattern 5.
- `HOLDOUT_ENCRYPTION_KEY` must be set for sealing to work — should be in `.env.local` for development.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `packages/web/vitest.config.ts` |
| Quick run command | `pnpm --filter @cauldron/web test` |
| Full suite command | `pnpm --filter @cauldron/web test` (same — web has no integration config yet) |
| Integration test command | `DATABASE_URL=... pnpm --filter @cauldron/engine test:integration` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INTV-01/02/03/04 | sendAnswer invokes FSM, returns next question + scores | unit (mock FSM) | `pnpm --filter @cauldron/web test -- --reporter=verbose` | ❌ Wave 0 |
| HOLD-03 | sealHoldouts calls sealVault, ciphertext columns populated | unit (mock sealVault) | same | ❌ Wave 0 |
| DAG-01/02/03/04/05 | triggerDecomposition invokes runDecomposition | unit (mock runDecomposition) | same | ❌ Wave 0 |
| Integration: answer → FSM scores → next question | Full FSM + DB round-trip | integration | `DATABASE_URL=... pnpm --filter @cauldron/engine test:integration` | partial (FSM tests exist) |

### Sampling Rate
- **Per task commit:** `pnpm --filter @cauldron/web test`
- **Per wave merge:** `pnpm run typecheck && pnpm --filter @cauldron/web test`
- **Phase gate:** `pnpm run build` + full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/web/src/trpc/routers/interview.test.ts` — unit tests for sendAnswer FSM wiring and sealHoldouts vault wiring
- [ ] `packages/web/src/trpc/routers/execution.test.ts` — unit tests for triggerDecomposition runDecomposition wiring
- [ ] `packages/web/src/trpc/__tests__/engine-deps.test.ts` — test that `getEngineDeps()` constructs gateway without throwing in test env

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct engine calls in CLI commands | tRPC mutations stub the engine | Phase 9 refactoring | 3 write paths broken |
| `sendAnswer` calls FSM synchronously | `sendAnswer` writes partial turn to DB, no LLM | Phase 9 | Interview stuck after first answer |
| Vault sealing calls crypto layer | Status set to 'sealed' without encryption | Phase 9 | ciphertext columns null |
| `runDecomposition()` called after seed crystallization | DB event appended with no listener | Phase 9 | Decomposition never runs |

**The Phase 9 refactoring was architecturally correct (CLI should use tRPC) but the mutation implementations were incomplete stubs.** Phase 10 completes the implementation.

## Open Questions

1. **Synchronous vs. async sendAnswer**
   - What we know: FSM.submitAnswer() makes 3+ LLM calls (scorer + perspectives + ranker) taking 5-30 seconds
   - What's unclear: Is a synchronous tRPC mutation that takes 30 seconds acceptable UX for the web dashboard? The CLI already patterns on this (it awaits sendAnswer).
   - Recommendation: Synchronous for Phase 10 (simpler, matches existing CLI pattern). If web UX requires async, that's a Phase 12+ concern.

2. **approveHoldout / approveScenarios alignment**
   - What we know: `approveHoldout` tRPC sets `status='approved'` but doesn't set `_approved` flags in draftScenarios JSONB. `sealVault()` reads `_approved` flags.
   - What's unclear: Should `approveHoldout` be fixed to call `approveScenarios()`, or should `sealHoldouts` call `approveScenarios()` as a prerequisite step?
   - Recommendation: Fix `sealHoldouts` to call `approveScenarios()` before `sealVault()` — this is less disruptive to the existing `approveHoldout` surface and handles the case where vaults are already in `approved` status from previous runs.

3. **CAULDRON_PROJECT_ROOT resolution in Next.js**
   - What we know: `loadConfig()` uses `process.cwd()` fallback, which is the Next.js server's working directory
   - What's unclear: In production Next.js deployments, `process.cwd()` may not be the monorepo root
   - Recommendation: Use `process.env['CAULDRON_PROJECT_ROOT'] ?? process.cwd()` as the project root, and add `CAULDRON_PROJECT_ROOT` to `.env.local` documentation

## Sources

### Primary (HIGH confidence)
- `packages/web/src/trpc/routers/interview.ts` — direct read, confirmed stub behavior
- `packages/web/src/trpc/routers/execution.ts` — direct read, confirmed stub behavior
- `packages/engine/src/interview/fsm.ts` — direct read, confirmed `submitAnswer()` signature
- `packages/engine/src/holdout/vault.ts` — direct read, confirmed `sealVault()` + `approveScenarios()` signatures
- `packages/engine/src/decomposition/pipeline.ts` — direct read, confirmed `runDecomposition()` signature
- `packages/web/src/trpc/init.ts` — direct read, confirmed context only has `db` + `authenticated`
- `packages/web/package.json` — direct read, confirmed `@cauldron/engine` already a dependency
- `.planning/v1.0-MILESTONE-AUDIT.md` — direct read, audit documents exact gaps and affected requirements
- `packages/api/src/bootstrap.ts` — direct read, confirmed existing gateway construction pattern

### Secondary (MEDIUM confidence)
- `packages/engine/src/holdout/events.ts` — confirmed `inngest` client exported as `cauldron-engine` id
- `packages/engine/src/index.ts` + `holdout/index.ts` + `decomposition/index.ts` — confirmed barrel exports

## Metadata

**Confidence breakdown:**
- Gap identification: HIGH — audit document + direct code reads confirm exact locations
- Fix approach: HIGH — engine function signatures are clear; constructor/call patterns well-documented in existing bootstrap.ts
- Context extension pattern: HIGH — same pattern exists in api/bootstrap.ts
- approveScenarios gap: HIGH — confirmed by reading both vault.ts and interview tRPC router
- Logger strategy: MEDIUM — pino type compatibility with console stub is a structural claim, not verified by test

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable codebase, no external dependencies)
