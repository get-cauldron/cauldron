# Phase 14: Wire Interview Start & Fix Seed Crystallization Path - Research

**Researched:** 2026-03-27
**Domain:** tRPC router wiring, InterviewFSM, crystallizeSeed engine function, CLI interview command
**Confidence:** HIGH

## Summary

Phase 14 closes two integration gaps identified in the v1.0 milestone audit. Both are pure wiring problems — the engine has the correct implementations already built and tested; they just aren't connected through the tRPC layer.

**Gap 1 (P0):** No `startInterview` tRPC procedure exists. When a user navigates to the interview page for a new project, `getTranscript` returns `status: 'not_started'` with an empty transcript. There is no procedure to call `InterviewFSM.startOrResume()`, which means no `interviews` DB row is ever created. The subsequent `sendAnswer` call fails with "No active interview found" because there is nothing to look up.

**Gap 2 (P1):** The `approveSummary` tRPC mutation does an inline raw DB insert instead of calling `crystallizeSeed()`. This bypasses: (a) the `ImmutableSeedError` duplicate guard, (b) version computation from parent seed, (c) the `seed_crystallized` event appended to the event store, and (d) the interview status update that `crystallizeSeed()` handles internally. SSE clients polling the events table never see `seed_crystallized`, and SEED-02's immutability guarantee is only enforced through `crystallizeSeed()` — not through the raw insert path.

**Primary recommendation:** Add `startInterview` tRPC mutation wired to `InterviewFSM.startOrResume()`. Replace the inline insert in `approveSummary` with a call to `crystallizeSeed()` imported from `@get-cauldron/engine`. Wire web page and CLI to call `startInterview` when `status === 'not_started'`. No schema changes, no new packages.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEED-01 | Immutable Seed spec generated in YAML format (goal, constraints, acceptance criteria, ontology schema, evaluation principles, exit conditions) | `crystallizeSeed()` in `packages/engine/src/interview/crystallizer.ts` already does this correctly — `approveSummary` just needs to call it instead of inlining the insert |
| SEED-02 | Seeds are frozen after crystallization — no mutation, only evolution creates new seeds | `ImmutableSeedError` guard exists in `crystallizeSeed()` and fires when a crystallized seed already exists for the interview — the inline insert path in `approveSummary` has no such guard |
| WEB-01 | Chat-like interface for the Socratic interview with MC suggestions and freeform input | Interview page renders correctly (Phase 8 built it), but no `startInterview` procedure exists to create the DB row; the "Interview not started" empty state is shown but there is no button/effect to call start |
| CLI-01 | All pipeline operations available via CLI (start interview, trigger execution, check status, approve holdouts) | `interviewCommand` calls `getTranscript` then `sendAnswer` — works for existing interviews but breaks for new projects because `sendAnswer` throws when no interview row exists |
</phase_requirements>

## Standard Stack

This phase does not introduce new libraries. All changes are within existing packages using existing dependencies.

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@get-cauldron/engine` | workspace | `InterviewFSM`, `crystallizeSeed` | Engine package is the authority on interview business logic |
| `@get-cauldron/shared` | workspace | `appendEvent`, DB schema types | Shared event sourcing utilities |
| `zod` | 4.3.6 | Input validation for new tRPC procedure | Already used throughout `interview.ts` |
| `@tanstack/react-query` | 5.x | useMutation/useEffect in interview page | Already used in the interview page |

**No new packages required.**

## Architecture Patterns

### How the tRPC interview router connects to the engine

The interview router (`packages/web/src/trpc/routers/interview.ts`) uses the factory pattern from `packages/web/src/trpc/engine-deps.ts`:

```typescript
// Lazy, cached engine deps — only constructed on first mutation call
const { gateway, config, logger } = await ctx.getEngineDeps();
const fsm = new InterviewFSM(ctx.db, gateway, config, logger);
```

The `ctx.getEngineDeps` is injected via `createTRPCContext` in `packages/web/src/trpc/init.ts`. This pattern is already used by `sendAnswer`. The new `startInterview` procedure follows the same pattern.

### How `crystallizeSeed()` connects to SSE

The SSE route at `packages/web/src/app/api/events/[projectId]/route.ts` polls the `events` table every 2 seconds for new rows where `projectId` matches and `sequenceNumber > lastSeq`. The `crystallizeSeed()` function calls `appendEvent(db, { projectId, seedId, type: 'seed_crystallized', payload: {...} })` which writes to the `events` table. Once this row exists, the SSE poller picks it up within 2 seconds and sends it to connected clients.

The inline insert in `approveSummary` writes to the `seeds` table directly but does NOT call `appendEvent`, so the `events` table never gets a `seed_crystallized` row.

### Pattern: startInterview tRPC procedure

```typescript
// Source: fsm.ts — InterviewFSM.startOrResume() signature
async startOrResume(
  projectId: string,
  options?: { mode?: InterviewMode; projectPath?: string },
): Promise<Interview>
```

The new procedure is a mutation that:
1. Calls `getEngineDeps()` for gateway/config/logger
2. Constructs `InterviewFSM`
3. Calls `fsm.startOrResume(projectId, options)`
4. Returns `{ interviewId, mode, status, phase }`

Input schema: `z.object({ projectId: z.string(), mode: z.enum(['greenfield', 'brownfield']).optional() })`

### Pattern: fixed approveSummary

Replace the inline insert block (lines 247-268 of `interview.ts`) with:

```typescript
// Source: crystallizer.ts — crystallizeSeed() handles:
// 1. ImmutableSeedError guard (SEED-02)
// 2. Version computation from parentSeedId
// 3. DB insert as status='crystallized'
// 4. Interview update to status='completed', phase='crystallized'
// 5. appendEvent for 'seed_crystallized' (enables SSE)
const seed = await crystallizeSeed(
  ctx.db,
  interview.id,
  projectId,
  summary,
  ambiguityScore,
);
```

The `crystallizeSeed` function is already exported from `@get-cauldron/engine` (confirmed in `packages/engine/src/interview/index.ts` line 37 and `packages/engine/src/index.ts`). The import already exists at the top of `interview.ts` for `InterviewFSM` — `crystallizeSeed` can be added to the same import statement.

The `approveSummary` procedure must keep its manual `reviewing -> approved` transition (line 241-244) because `crystallizeSeed()` expects the interview to be in `approved` phase before it writes `crystallized`. Wait — actually re-read the crystallizer:

```typescript
// crystallizer.ts does NOT transition reviewing->approved itself
// It only transitions approved->crystallized via:
await db.update(interviews)
  .set({ status: 'completed', phase: 'crystallized', completedAt: new Date() })
  .where(eq(interviews.id, interviewId));
```

And `fsm.approveAndCrystallize()` does:
1. Transitions reviewing -> approved (assertValidTransition)
2. Calls crystallizeSeed() (which then does approved -> crystallized internally)

So the options are:
- **Option A (preferred):** Call `fsm.approveAndCrystallize(interview.id, projectId, summary)` — this handles both transitions and calls `crystallizeSeed()` internally
- **Option B:** Keep the `reviewing -> approved` transition in `approveSummary` and call `crystallizeSeed()` directly

Option A is cleaner because it uses the FSM's own transition logic (`assertValidTransition`). Option B is also valid and avoids constructing the FSM (which needs gateway/config/logger). However, `crystallizeSeed()` does not check that the interview is in `approved` phase — it only checks for duplicate seeds. The current `approveSummary` already validates `interview.phase !== 'reviewing'` before proceeding.

**Recommendation: Use Option B (call `crystallizeSeed()` directly).** This is simpler — no need to construct the full FSM with gateway/config/logger just for crystallization. The `crystallizeSeed()` function takes only `db`, not the full gateway. The existing `reviewing -> approved` transition in `approveSummary` is correct and can remain.

**Updated `approveSummary` shape:**
```typescript
// Keep existing: transition reviewing -> approved
await ctx.db.update(interviews).set({ phase: 'approved' }).where(eq(interviews.id, interview.id));

// Replace inline insert with crystallizeSeed() call
const seed = await crystallizeSeed(
  ctx.db,
  interview.id,
  projectId,
  summary,        // SeedSummary — already validated by Zod schema above
  ambiguityScore, // number — already computed above
  // parentSeedId omitted (undefined) for initial crystallization
);

// Remove: manual seeds insert, manual interview crystallized update (crystallizeSeed handles these)

return { seedId: seed.id, version: seed.version };
```

### Pattern: web page `startInterview` call

The interview page currently shows "Interview not started" when `transcript.length === 0`. It needs to call `startInterview` when the status is `not_started`. The correct place is a `useEffect` that fires once on mount when `transcriptData?.status === 'not_started'`:

```typescript
const startInterviewMutation = useMutation(trpc.interview.startInterview.mutationOptions());

React.useEffect(() => {
  if (transcriptData?.status === 'not_started' && !startInterviewMutation.isPending) {
    startInterviewMutation.mutate({ projectId });
  }
}, [transcriptData?.status]);
```

After mutation succeeds, refetch the transcript so the first question appears. The empty state "Interview not started" text can remain as loading indicator while the mutation is pending.

**Alternative:** Show a "Start Interview" button instead of auto-starting. This gives the user explicit control. Given the UX already shows "Send your first message to begin", auto-starting is consistent with that framing — the DB record is just an implementation detail. Auto-start on mount is the right UX here.

### Pattern: CLI `startInterview` call

The `interviewCommand` in `packages/cli/src/commands/interview.ts` calls `client.interview.getTranscript.query({ projectId })` first. If `state.status === 'not_started'`, it should call `client.interview.startInterview.mutate({ projectId })` before proceeding to the turn loop:

```typescript
// After getTranscript
if (state.status === 'not_started') {
  const startSpinner = createSpinner('Starting interview...').start();
  await client.interview.startInterview.mutate({ projectId });
  startSpinner.succeed('Interview started');
  // Refetch state to get updated transcript/phase
  state = await client.interview.getTranscript.query({ projectId });
}
```

This matches the existing pattern in `interviewCommand` — it uses the `client` (CLIClient) exclusively, no engine imports.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Interview DB row creation | Custom insert in tRPC | `InterviewFSM.startOrResume()` | FSM handles resume of paused/active, mode detection, event emission |
| Seed immutability guard | Custom duplicate check | `crystallizeSeed()` + `ImmutableSeedError` | Already implemented; guard checks `status === 'crystallized'` on existing seed |
| seed_crystallized event | Manual `appendEvent` call | `crystallizeSeed()` internally calls `appendEvent` | Keeping event emission co-located with seed creation prevents drift |
| Version computation | Manual version logic | `crystallizeSeed()` handles version = parent.version + 1 | Parent seed version lookup already in crystallizer |

## Common Pitfalls

### Pitfall 1: Calling approveSummary's existing reviewing→approved transition AND crystallizeSeed
**What goes wrong:** `crystallizeSeed()` does NOT check that the interview is in `approved` phase. If `approveSummary` transitions `reviewing -> approved` first and then calls `crystallizeSeed()`, the crystallizer will proceed correctly. But if the reviewing→approved transition is removed, `crystallizeSeed()` will still work (no phase check) — the issue is that the interview row would be left in `reviewing` phase after seed creation, which breaks the FSM invariants.
**How to avoid:** Keep the `reviewing -> approved` transition in `approveSummary` before calling `crystallizeSeed()`. The crystallizer handles `approved -> crystallized` (sets `status='completed'`, `phase='crystallized'`).

### Pitfall 2: Removing the summary Zod schema from approveSummary input
**What goes wrong:** `crystallizeSeed()` accepts `summary: SeedSummary` but the Zod schema in `approveSummary` already validates this shape. Do not remove the Zod validation — the tRPC procedure still needs it for input safety.
**How to avoid:** Keep the Zod input schema unchanged; only replace the DB insertion logic body.

### Pitfall 3: Constructing InterviewFSM for crystallization
**What goes wrong:** `crystallizeSeed()` only needs `db` — it does not use the gateway or config. Constructing a full `InterviewFSM` (which calls `getEngineDeps()` and initializes the LLM gateway) just to call `approveAndCrystallize()` is wasteful and adds latency.
**How to avoid:** Import `crystallizeSeed` directly from `@get-cauldron/engine` and call it with `ctx.db`. No `getEngineDeps()` call needed.

### Pitfall 4: Missing import for crystallizeSeed in interview.ts
**What goes wrong:** The current `interview.ts` imports `InterviewFSM, approveScenarios, sealVault` from `@get-cauldron/engine` but not `crystallizeSeed`. Forgetting to add `crystallizeSeed` to the import causes a compile error.
**How to avoid:** Add `crystallizeSeed` to the existing import line at line 5.

### Pitfall 5: Web page infinite mutation loop
**What goes wrong:** If `startInterview` mutation is called in a `useEffect` with `transcriptData?.status` as a dependency, and the mutation updates the transcript query cache (via refetch), the effect could re-fire if the status stays `not_started` after mutation (e.g., mutation fails).
**How to avoid:** Gate the effect on `!startInterviewMutation.isPending && !startInterviewMutation.isSuccess`. After success, call `transcriptQuery.refetch()` so `status` updates to `active` and the effect no longer fires.

### Pitfall 6: CLI client type signature for startInterview
**What goes wrong:** The CLI client is typed as `TRPCClient<AppRouter>` from `@get-cauldron/shared`. Adding `startInterview` to the router automatically propagates to the client type — no manual type update needed. But if the shared package's `trpc-types.ts` re-export needs a rebuild, the CLI might not see the new procedure.
**How to avoid:** After adding `startInterview` to `interviewRouter`, run `pnpm typecheck` at the monorepo root to verify the CLI sees the new procedure.

### Pitfall 7: ImmutableSeedError not caught by tRPC
**What goes wrong:** `crystallizeSeed()` throws `ImmutableSeedError` when a crystallized seed already exists for the interview. This is an application-level guard. If not caught, tRPC will return an INTERNAL_SERVER_ERROR 500.
**How to avoid:** Wrap the `crystallizeSeed()` call in `approveSummary` with a try/catch that converts `ImmutableSeedError` to a `TRPCError({ code: 'CONFLICT', message: ... })`. Import `TRPCError` from `@trpc/server`.

## Code Examples

### startInterview tRPC mutation shape

```typescript
// Source: packages/engine/src/interview/fsm.ts — InterviewFSM.startOrResume
startInterview: publicProcedure
  .input(z.object({
    projectId: z.string(),
    mode: z.enum(['greenfield', 'brownfield']).optional(),
  }))
  .mutation(async ({ input, ctx }) => {
    const { projectId, mode } = input;
    const { gateway, config, logger } = await ctx.getEngineDeps();
    const fsm = new InterviewFSM(ctx.db, gateway, config, logger);
    const interview = await fsm.startOrResume(projectId, { mode });
    return {
      interviewId: interview.id,
      mode: interview.mode,
      status: interview.status,
      phase: interview.phase,
    };
  }),
```

### approveSummary — corrected crystallization path

```typescript
// Replace lines 247-268 in packages/web/src/trpc/routers/interview.ts

// crystallizeSeed is imported from @get-cauldron/engine (add to existing import)
try {
  const seed = await crystallizeSeed(
    ctx.db,
    interview.id,
    projectId,
    summary,
    ambiguityScore,
    // parentSeedId: undefined (initial seed, no parent)
  );
  return { seedId: seed.id, version: seed.version };
} catch (e) {
  if (e instanceof ImmutableSeedError) {
    throw new TRPCError({ code: 'CONFLICT', message: e.message });
  }
  throw e;
}
```

### Interview page — auto-start effect

```typescript
// packages/web/src/app/projects/[id]/interview/page.tsx
const startInterviewMutation = useMutation(trpc.interview.startInterview.mutationOptions());

React.useEffect(() => {
  if (
    transcriptData?.status === 'not_started' &&
    !startInterviewMutation.isPending &&
    !startInterviewMutation.isSuccess
  ) {
    startInterviewMutation.mutate(
      { projectId },
      {
        onSuccess: () => {
          void transcriptQuery.refetch();
        },
      }
    );
  }
}, [transcriptData?.status, startInterviewMutation.isPending, startInterviewMutation.isSuccess]);
```

### CLI — start before turn loop

```typescript
// packages/cli/src/commands/interview.ts — add after getTranscript call
if (state.status === 'not_started') {
  const startSpinner = createSpinner('Starting interview...').start();
  try {
    await client.interview.startInterview.mutate({ projectId });
    startSpinner.succeed('Interview started');
  } catch (err) {
    startSpinner.fail('Failed to start interview');
    throw err;
  }
  // Re-fetch state with fresh DB record
  state = await client.interview.getTranscript.query({ projectId });
}
```

## Environment Availability

Step 2.6: SKIPPED — Phase 14 is purely code changes in existing packages. No external tools, services, runtimes, or CLI utilities beyond the monorepo's own stack are introduced.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `packages/web/vitest.config.ts` |
| Quick run command | `pnpm --filter @get-cauldron/web test --run` |
| Full suite command | `pnpm --filter @get-cauldron/web test --run && pnpm --filter @get-cauldron/web typecheck` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEED-01 | `approveSummary` calls `crystallizeSeed()` and returns seedId | unit | `pnpm --filter @get-cauldron/web test --run src/trpc/routers/__tests__/interview-engine.test.ts` | ✅ (extend existing) |
| SEED-02 | `approveSummary` throws CONFLICT when seed already crystallized (ImmutableSeedError) | unit | `pnpm --filter @get-cauldron/web test --run src/trpc/routers/__tests__/interview-engine.test.ts` | ✅ (add new test) |
| WEB-01 | Interview page calls `startInterview` when status is `not_started` | unit | `pnpm --filter @get-cauldron/web test --run src/app/projects` | ❌ Wave 0 gap — no test for interview page |
| CLI-01 | CLI `interviewCommand` calls `startInterview` for new projects | unit | `pnpm --filter @get-cauldron/cli test --run` | ❌ Wave 0 gap — no test for interview command |

### Sampling Rate
- **Per task commit:** `pnpm --filter @get-cauldron/web test --run`
- **Per wave merge:** `pnpm test --run` (root turbo runs all packages)
- **Phase gate:** Full suite green + `pnpm typecheck` before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/web/src/app/projects/[id]/interview/__tests__/page.test.tsx` — covers WEB-01 (startInterview auto-call on mount)
- [ ] `packages/cli/src/commands/__tests__/interview.test.ts` — covers CLI-01 (startInterview for new projects)
- [ ] Extend `packages/web/src/trpc/routers/__tests__/interview-engine.test.ts` — add `startInterview` and `approveSummary` crystallizeSeed tests

Note: The existing `interview-engine.test.ts` covers `sendAnswer` but has no tests for `approveSummary` or `startInterview`. These must be added in Wave 0 before implementation.

## File Map (Files to Read Before Writing)

The planner must read these files before writing any tasks. Per feedback in MEMORY.md (`feedback_read_code_before_planning.md`), plans that skip reading target files produce incorrect paths and APIs.

| File | Why Read It |
|------|-------------|
| `packages/web/src/trpc/routers/interview.ts` | Target file: add `startInterview`, fix `approveSummary` |
| `packages/engine/src/interview/fsm.ts` | `startOrResume()` signature and return type |
| `packages/engine/src/interview/crystallizer.ts` | `crystallizeSeed()` signature, `ImmutableSeedError` |
| `packages/web/src/app/projects/[id]/interview/page.tsx` | Target file: add `startInterview` mutation + useEffect |
| `packages/cli/src/commands/interview.ts` | Target file: add `startInterview` call |
| `packages/web/src/trpc/routers/__tests__/interview-engine.test.ts` | Existing test pattern to extend |

## Open Questions

1. **Should `startInterview` be idempotent or create-only?**
   - What we know: `InterviewFSM.startOrResume()` is already idempotent — it resumes an active/paused interview if one exists, only inserts a new row if no active/paused interview found.
   - What's unclear: The web page's useEffect will call `startInterview` every time the page loads if status is `not_started`. If the user has an `active` interview (e.g., navigates away and back), `getTranscript` will return `status: 'active'`, not `not_started`, so the effect will not fire.
   - Recommendation: No special handling needed — `startOrResume`'s idempotency handles it.

2. **Does `approveSummary` need to handle the case where `crystallizeSeed()` internally transitions `approved -> crystallized` when the interview is still in `reviewing` phase?**
   - What we know: `approveSummary` currently transitions `reviewing -> approved` before calling the inline insert. `crystallizeSeed()` handles `approved -> crystallized` internally. So the sequence is: reviewing → approved (in tRPC procedure) → crystallized (inside crystallizeSeed).
   - What's unclear: None — the sequence is clear from reading both files.
   - Recommendation: Keep the `reviewing -> approved` transition in `approveSummary`; remove only the inline insert block and replace with `crystallizeSeed()` call.

## Sources

### Primary (HIGH confidence)
- `packages/web/src/trpc/routers/interview.ts` — direct code inspection, confirmed inline insert at lines 247-268
- `packages/engine/src/interview/crystallizer.ts` — direct code inspection, confirmed `crystallizeSeed` signature and event emission
- `packages/engine/src/interview/fsm.ts` — direct code inspection, confirmed `startOrResume` signature
- `packages/engine/src/interview/index.ts` + `packages/engine/src/index.ts` — confirmed `crystallizeSeed` and `InterviewFSM` are exported from `@get-cauldron/engine`
- `packages/web/src/app/api/events/[projectId]/route.ts` — confirmed SSE polling mechanism reads from `events` table
- `packages/cli/src/commands/interview.ts` — confirmed CLI calls `getTranscript` then `sendAnswer` with no start call
- `packages/web/src/trpc/routers/__tests__/interview-engine.test.ts` — confirmed test pattern using `MockInterviewFSM` constructor
- `.planning/v1.0-MILESTONE-AUDIT.md` — P0/P1 gap descriptions directly inform scope

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` Phase 08-web-dashboard decisions — confirmed `sendAnswer` records to DB immediately; LLM scoring async
- `.planning/STATE.md` Phase 09-cli decisions — confirmed all CLI commands use `(client, args, flags)` tRPC signature, zero engine imports

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all changes are within existing packages, no new dependencies
- Architecture: HIGH — both gaps are clearly diagnosed from direct code inspection; fix paths are unambiguous
- Pitfalls: HIGH — identified from direct reading of crystallizer.ts, fsm.ts, and the existing inline insert in approveSummary

**Research date:** 2026-03-27
**Valid until:** Stable — these are internal wiring changes in a controlled codebase; no external API drift risk
