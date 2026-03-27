# Phase 15: Wire Holdout Generation & Fix CLI Run — Research

**Researched:** 2026-03-27
**Domain:** Holdout generation wiring (tRPC + engine), CLI pipeline argument propagation
**Confidence:** HIGH — all findings from direct source inspection of existing codebase

## Summary

Phase 15 closes two P0 integration gaps identified in the v1.0 milestone audit. All engine
functionality exists and is individually tested. The gaps are pure wiring problems: connecting
components that were never called.

**Gap 1 — Holdout generation never triggered.** `generateHoldoutScenarios` in
`packages/engine/src/holdout/generator.ts` is exported and tested but is never invoked from any
tRPC procedure, CLI command, or Inngest handler. After `approveSummary` crystallizes a seed, nothing
calls the generator. The vault is always empty, so `sealHoldouts` always throws "No approved holdout
entries". The fix is to call `generateHoldoutScenarios` + `createVault` inside `approveSummary`
immediately after `crystallizeSeed` succeeds.

**Gap 2 — `cauldron run` breaks at seal stage.** `runCommand` calls `crystallizeCommand` but
`crystallizeCommand` returns `void`, discarding the `{ seedId, version }` result from
`approveSummary`. The seal stage is then called with the original `args` array which contains no
`--seed-id` flag, so `sealCommand` exits immediately with "Error: --seed-id is required". The fix is
to refactor `crystallizeCommand` to return `{ seedId: string }` and have `runCommand` inject
`--seed-id <value>` into the args passed to `sealCommand`.

**LLM-06 status.** Cross-model diversity enforcement is fully implemented in the gateway's
`diversity.ts` module and is already active when `generateHoldoutScenarios` calls
`gateway.generateObject({ stage: 'holdout' })`. The `cauldron.config.ts` holdout stage uses
`gemini-2.5-pro` / `gpt-4.1` (google/openai families), while the implementation stage uses
`claude-sonnet-4-6` (anthropic). Diversity is enforced at gateway call time — wiring the generator
call is sufficient to satisfy LLM-06.

**Primary recommendation:** Wire `generateHoldoutScenarios` + `createVault` into `approveSummary`
tRPC mutation; refactor `crystallizeCommand` to return `{ seedId }` and propagate it through
`runCommand`.

## Standard Stack

No new libraries required. All capabilities exist in the current codebase.

| Component | Location | Purpose |
|-----------|----------|---------|
| `generateHoldoutScenarios` | `packages/engine/src/holdout/generator.ts` | Calls gateway with `stage: 'holdout'`, returns `HoldoutScenario[]` |
| `createVault` | `packages/engine/src/holdout/vault.ts` | Inserts holdout_vault row with `pending_review` status |
| `crystallizeSeed` | `packages/engine/src/interview/crystallizer.ts` | Returns `Seed` (includes `seed.id`) |
| `approveSummary` tRPC | `packages/web/src/trpc/routers/interview.ts:218` | Calls `crystallizeSeed`, returns `{ seedId, version }` — insertion point for holdout generation |
| `getEngineDeps` | `packages/web/src/trpc/engine-deps.ts` | Provides `{ gateway, config, logger }` — already used in `approveSummary` |
| `runCommand` | `packages/cli/src/commands/run.ts` | Pipeline orchestrator — needs to capture seedId from crystallize and inject into seal |
| `crystallizeCommand` | `packages/cli/src/commands/crystallize.ts` | Returns `void`, must become `Promise<{ seedId: string }>` |

## Architecture Patterns

### Pattern 1: Holdout Generation in `approveSummary`

The trigger point is the `approveSummary` tRPC mutation (web) and the equivalent `crystallizeCommand`
path (CLI). The `approveSummary` mutation already:
1. Loads engine deps (`gateway, config, logger`) via `ctx.getEngineDeps()`
2. Calls `crystallizeSeed(ctx.db, ...)` which returns a `Seed` object
3. Returns `{ seedId: seed.id, version: seed.version }`

The generation call fits naturally after step 2:

```typescript
// Source: packages/web/src/trpc/routers/interview.ts (existing pattern)
const seed = await crystallizeSeed(ctx.db, interview.id, projectId, summary, ambiguityScore);

// NEW: generate holdout scenarios and create vault
const scenarios = await generateHoldoutScenarios({
  gateway,
  seed,
  projectId,
});
await createVault(ctx.db, { seedId: seed.id, scenarios });

return { seedId: seed.id, version: seed.version };
```

`generateHoldoutScenarios` requires `{ gateway: LLMGateway, seed: Seed, projectId: string }`. All
three are available at this call site. No schema changes or new dependencies needed.

### Pattern 2: CLI Run — SeedId Propagation

`crystallizeCommand` currently has return type `Promise<void>` and uses `process.exit(1)` on
errors. The fix is:

```typescript
// Source: packages/cli/src/commands/crystallize.ts (after change)
export async function crystallizeCommand(
  client: CLIClient,
  args: string[],
  flags: Flags
): Promise<{ seedId: string } | undefined> {
  // ...existing logic...
  const result = await client.interview.approveSummary.mutate({ ... });
  // Return instead of only printing
  return { seedId: result.seedId };
}
```

In `runCommand`, the crystallize stage must capture the return value and splice `--seed-id` into
the args for the seal stage:

```typescript
// Source: packages/cli/src/commands/run.ts (after change)
let seedId: string | undefined;

{
  name: 'Crystallize',
  run: async () => {
    const result = await crystallizeCommand(client, args, flags);
    if (result?.seedId) seedId = result.seedId;
    // ...
  },
},
{
  name: 'Seal',
  run: async () => {
    const sealArgs = seedId ? [...args, '--seed-id', seedId] : args;
    await sealCommand(client, sealArgs, flags);
  },
},
```

### Pattern 3: Web Holdout Display — No Changes Required

The web interview page already:
- Stores `seedId` in state after `approveSummary` succeeds (`setSeedId(result.seedId)`)
- Enables `holdoutsQuery` when `seedId` is set (`enabled: !!seedId`)
- Shows holdout cards when `holdoutsQuery.data?.scenarios` is non-empty

The `showHoldouts` condition is `(phase === 'crystallized' || !!seedId) && holdoutScenarios.length > 0`.
Once generation is wired and the vault is populated, the web UI will display holdout cards
automatically without any changes needed (WEB-05 satisfied by the generation wiring).

### Anti-Patterns to Avoid

- **Fire-and-forget generation:** Do NOT make holdout generation async/background. Generate
  synchronously inside `approveSummary` so the response includes a populated vault. The web page
  queries for holdouts immediately after receiving `seedId` — an async gap would produce empty results.
- **Duplicating generation logic in CLI:** The CLI calls `approveSummary` via tRPC, so the server
  handles generation. The CLI does NOT need to call `generateHoldoutScenarios` directly.
- **Changing vault `approveHoldout` tRPC behavior:** The existing `approveHoldout` mutation
  updates vault status to `'approved'` directly without calling `approveScenarios()` from the
  engine. This bypass is intentional — the web uses per-scenario approval UX. The `sealHoldouts`
  mutation calls `approveScenarios(ctx.db, { vaultId: entry.id, approvedIds: 'all' })` to mark
  all draft scenarios. Do not remove this two-step.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-model diversity | Custom provider filtering | `gateway.generateObject({ stage: 'holdout' })` + `cauldron.config.ts` holdout chain | `diversity.ts` already implements `filterDiverseModels` + `DiversityViolationError`; `cauldron.config.ts` already uses `gemini-2.5-pro` (google family) while `implementation` uses `claude-sonnet-4-6` (anthropic) |
| Vault lifecycle management | Custom insert/update | `createVault(db, { seedId, scenarios })` | Handles `pending_review` state, `DraftScenario._approved` metadata, and null encryption columns |
| Minimum scenario validation | Runtime check | `sealVault` enforces min 5 at seal time | `approveScenarios` and `sealVault` both throw if fewer than 5 approved |

**Key insight:** LLM-06 is already implemented end-to-end in the gateway. Wiring the generator
call is what makes the requirement active — no additional diversity code needs to be written.

## Common Pitfalls

### Pitfall 1: `generateHoldoutScenarios` Needs `LLMGateway`, Not Raw Config
**What goes wrong:** Passing `config` or gateway options directly instead of the `LLMGateway`
instance. The function signature is `{ gateway: LLMGateway, seed: Seed, projectId: string }`.
**Why it happens:** `approveSummary` currently destructures `{ gateway, config, logger }` from
`getEngineDeps()` — easy to confuse which to pass.
**How to avoid:** Pass `gateway` (the `LLMGateway` instance) directly.

### Pitfall 2: ImmutableSeedError Catch Must Wrap Both crystallizeSeed AND generateHoldoutScenarios
**What goes wrong:** If `generateHoldoutScenarios` throws (LLM error, budget exceeded), the seed
is already crystallized. The existing `ImmutableSeedError` catch block only covers `crystallizeSeed`.
**Why it happens:** Error handling was written before generation was added.
**How to avoid:** Keep the `ImmutableSeedError` catch tightly scoped to `crystallizeSeed`. Wrap
generation in its own try/catch that rethrows as a TRPCError with code `INTERNAL_SERVER_ERROR` and
a user-readable message. The crystallized seed should remain — only generation failed.

### Pitfall 3: `crystallizeCommand` Uses `process.exit(1)` on Error Paths
**What goes wrong:** After adding a return value, error paths that call `process.exit(1)` must
still do so (to prevent `runCommand` from seeing `undefined` and trying to continue). The `void`
return type change to `Promise<{ seedId: string } | undefined>` means callers must handle both.
**How to avoid:** Keep `process.exit(1)` in error paths. Return `undefined` only on clean early
exits (e.g., already crystallized). `runCommand` should check `if (!seedId)` after the crystallize
stage and fail with a clear error rather than silently passing undefined to seal.

### Pitfall 4: Web Query Caching — holdoutsQuery Needs Explicit `seedId` State
**What goes wrong:** The web page only re-queries holdouts when `seedId` state changes. If
`approveSummary` is called but `setSeedId` is not reached (due to an error), holdouts never load.
**Why it happens:** The existing code path is `const result = await approveSummaryMutation.mutateAsync(...)` then `setSeedId(result.seedId)`. Already correct — but only if `approveSummary` returns `seedId` unchanged.
**How to avoid:** The `approveSummary` mutation response shape (`{ seedId, version }`) does not
change in this phase. No web page changes needed.

### Pitfall 5: `sealCommand` Exits 0 When Holdout Count is 0
**What goes wrong:** In `sealCommand` (line 45-48), if `holdouts.scenarios.length === 0`, the
command logs a warning and returns normally (no error exit). `runCommand` would then continue to
decompose with an empty vault.
**Why it happens:** The original design treated no holdouts as a valid skip path.
**How to avoid:** After wiring generation, `getHoldouts` should always return scenarios. The empty
case becomes an error condition — `runCommand` should treat it as a failure. Consider adding an
explicit check after the seal stage returns or change the early-return to `process.exit(1)`.

## Code Examples

### generateHoldoutScenarios Signature (verified from source)

```typescript
// Source: packages/engine/src/holdout/generator.ts:79
export async function generateHoldoutScenarios(params: {
  gateway: LLMGateway;
  seed: Seed;
  projectId: string;
}): Promise<HoldoutScenario[]>
```

### createVault Signature (verified from source)

```typescript
// Source: packages/engine/src/holdout/vault.ts:41
export async function createVault(
  db: DbClient,
  params: { seedId: string; scenarios: HoldoutScenario[] }
): Promise<string>  // returns vaultId
```

### Existing approveSummary mutation tail (insertion point)

```typescript
// Source: packages/web/src/trpc/routers/interview.ts:271-285
try {
  const seed = await crystallizeSeed(
    ctx.db,
    interview.id,
    projectId,
    summary,
    ambiguityScore,
  );
  // ← INSERT: generateHoldoutScenarios + createVault here
  return { seedId: seed.id, version: seed.version };
} catch (e) {
  if (e instanceof ImmutableSeedError) {
    throw new TRPCError({ code: 'CONFLICT', message: e.message });
  }
  throw e;
}
```

### crystallizeCommand return path (existing, to be changed)

```typescript
// Source: packages/cli/src/commands/crystallize.ts:57-74
result = await client.interview.approveSummary.mutate({ projectId, summary: summaryResult.summary });
crystallizeSpinner.succeed('Seed crystallized');
// Currently: falls through to void — must return { seedId: result.seedId }
console.log(chalk.green('Seed crystallized:'), chalk.cyan(result.seedId));
```

## Phase Requirements

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HOLD-01 | Holdout scenario tests generated by a different LLM provider/family than the interview model | Wire `generateHoldoutScenarios` into `approveSummary`; gateway diversity enforcement already active for `stage: 'holdout'` |
| HOLD-02 | Generated holdout tests presented to user for review before encryption | `getHoldouts` tRPC + `HoldoutCard` UI already exist; wiring generation populates the vault they query |
| HOLD-03 | Approved holdout tests encrypted using AES-256-GCM | `sealVault` AES-256-GCM implementation exists; wiring generation unblocks the vault so `sealHoldouts` can succeed |
| HOLD-05 | Holdout tests remain sealed during all execution and evolution cycles | No new code needed; sealed status is maintained by vault FSM; this was always implemented, just unreachable without a vault entry |
| LLM-06 | Cross-model diversity enforced: holdout generator must use different provider than implementer | `diversity.ts` + `cauldron.config.ts` already enforce this; becomes active the moment `generateHoldoutScenarios` is called |
| WEB-05 | Human approval gate UX for holdout test review | Web interview page already shows `HoldoutCard` components when `holdoutsQuery` returns scenarios; no web changes needed |
| CLI-01 | All pipeline operations available via CLI — `cauldron run` full pipeline completes | Fix `crystallizeCommand` to return `{ seedId }` and propagate via `runCommand` stage args |
</phase_requirements>

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `packages/engine/vitest.config.ts`, `packages/web/vitest.config.ts` |
| Quick run command | `pnpm -F @get-cauldron/engine test -- --grep "holdout\|generator"` |
| Full suite command | `pnpm test && pnpm build` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HOLD-01 | `approveSummary` calls `generateHoldoutScenarios` with correct params | unit | `pnpm -F @get-cauldron/web test -- --grep "approveSummary"` | Wave 0 gap |
| HOLD-01 | `createVault` is called after generation | unit | same | Wave 0 gap |
| LLM-06 | Gateway routes holdout stage to non-anthropic provider | unit | `pnpm -F @get-cauldron/engine test -- --grep "diversity"` | Exists (`diversity.test.ts`) |
| CLI-01 | `crystallizeCommand` returns `{ seedId }` | unit | `pnpm -F @get-cauldron/cli test -- --grep "crystallize"` | Wave 0 gap |
| CLI-01 | `runCommand` passes `--seed-id` to seal stage | unit | `pnpm -F @get-cauldron/cli test -- --grep "run"` | Wave 0 gap |
| HOLD-02 | `getHoldouts` returns populated scenarios after generation | integration | `pnpm test:integration` | Wave 0 gap |

### Sampling Rate

- **Per task commit:** `pnpm -F @get-cauldron/engine test && pnpm -F @get-cauldron/web test && pnpm -F @get-cauldron/cli test`
- **Per wave merge:** `pnpm test && pnpm build && pnpm typecheck`
- **Phase gate:** Full suite green + `pnpm build` clean before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/web/src/trpc/routers/__tests__/interview-approveSummary.test.ts` — unit test for holdout generation wiring in approveSummary
- [ ] `packages/cli/src/__tests__/crystallize.test.ts` — unit test for crystallizeCommand return value
- [ ] `packages/cli/src/__tests__/run.test.ts` — unit test for seedId propagation to seal stage

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — all changes are code wiring within the existing
TypeScript monorepo using already-installed packages).

## Runtime State Inventory

Step 2.5: Not a rename/refactor phase. Omitted.

## Project Constraints (from CLAUDE.md)

- TypeScript end-to-end — no JavaScript in new files
- Vercel AI SDK for multi-provider model interface — already used by `generateHoldoutScenarios`
- OSS dependencies: use if 80%+ fit is clean — no new dependencies needed for this phase
- Holdout tests must be encrypted at rest with keys inaccessible to implementation agents — vault lifecycle unchanged
- No Express, no Jest, no `pg` driver, no `react-flow-renderer` — none apply
- Testing: Vitest unit + integration; anti-mocking (prefer real integrations) — integration test for getHoldouts returning data post-generation is required
- `pnpm build` must be included in regression gate after phase execution (per MEMORY.md)
- Read code before planning (per MEMORY.md) — this research file satisfies that requirement for the planner

## Sources

### Primary (HIGH confidence)
- `packages/engine/src/holdout/generator.ts` — `generateHoldoutScenarios` signature and params verified
- `packages/engine/src/holdout/vault.ts` — `createVault`, `approveScenarios`, `sealVault` signatures verified
- `packages/web/src/trpc/routers/interview.ts` — `approveSummary` body and insertion point verified
- `packages/cli/src/commands/run.ts` — runCommand stage array; confirmed seedId not captured from crystallize
- `packages/cli/src/commands/crystallize.ts` — confirmed `void` return type and `result.seedId` discarded
- `packages/cli/src/commands/seal.ts` — confirmed `--seed-id` is required (exits if missing)
- `packages/web/src/app/projects/[id]/interview/page.tsx` — confirmed `holdoutsQuery` wired correctly, `setSeedId` called on approveSummary success; no web changes needed
- `packages/engine/src/gateway/diversity.ts` — `enforceDiversity` and `filterDiverseModels` verified
- `cauldron.config.ts` — holdout stage uses `gemini-2.5-pro` (google), implementation uses `claude-sonnet-4-6` (anthropic) — diversity enforced
- `.planning/v1.0-MILESTONE-AUDIT.md` — P0 gap descriptions confirmed by code inspection

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all components read from source; no assumptions
- Architecture: HIGH — insertion points identified precisely with line references
- Pitfalls: HIGH — derived from reading actual code paths including error handling and early exits
- LLM-06 assessment: HIGH — gateway diversity enforcement verified in diversity.ts and failover.ts

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable internal code, no external API dependencies)
