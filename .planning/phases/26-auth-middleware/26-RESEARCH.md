# Phase 26: Auth Middleware - Research

**Researched:** 2026-04-02
**Domain:** tRPC procedure middleware, API key authentication
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — infrastructure phase. Mode: Auto-generated (discuss skipped).

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. The `authenticatedProcedure` middleware already exists in `packages/web/src/trpc/init.ts`; the task is to switch all 14 mutation endpoints from `publicProcedure` to `authenticatedProcedure`.

### Deferred Ideas (OUT OF SCOPE)
None — infrastructure phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-02 | All tRPC routes use authenticatedProcedure (dev-mode bypass preserved when CAULDRON_API_KEY is unset) | `authenticatedProcedure` exists in `init.ts` and is fully implemented. Test harness already passes `authenticated: true`. Only work is import + swap in 5 router files. |
</phase_requirements>

## Summary

Phase 26 is a pure mechanical substitution — no new code to invent. The authentication infrastructure (`authenticatedProcedure`, `validateApiKey`, dev-mode bypass) is complete and working in `packages/web/src/trpc/init.ts`. The only task is changing 14 mutation endpoints across 3 router files from `publicProcedure` to `authenticatedProcedure`, then adding a new test file that verifies the UNAUTHORIZED behavior when `authenticated: false` is injected into the caller context.

The test harness is already written correctly for this phase. `createTestContext()` in `packages/test-harness/src/context.ts` passes `authenticated: true` to `appRouter.createCaller()` at line 102. This means every existing wiring test will continue to pass without any modification. The tests were written in anticipation of authentication being enforced.

The scope boundary is precise: only `.mutation()` endpoints change. All `.query()` endpoints remain on `publicProcedure` — this reflects the design intent that read operations are public while write operations require authorization.

**Primary recommendation:** Switch imports in each router file from `{ router, publicProcedure }` to `{ router, publicProcedure, authenticatedProcedure }`, replace `publicProcedure` with `authenticatedProcedure` on each mutation, then write a single new test file `auth-middleware.test.ts` that creates a caller with `authenticated: false` and asserts UNAUTHORIZED errors from each mutation category.

## Standard Stack

No new libraries required. The entire implementation uses existing project dependencies.

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@trpc/server` | 11.x | Procedure middleware chain | Already in use; `TRPCError` with code `UNAUTHORIZED` is the correct error type |
| `vitest` | 4.x | Test framework | Project standard for unit + wiring tests |

### Installation
```bash
# No new packages — everything is already installed
```

## Architecture Patterns

### Existing Middleware Implementation

The `authenticatedProcedure` in `packages/web/src/trpc/init.ts` (lines 40–45):

```typescript
// Source: packages/web/src/trpc/init.ts
export const authenticatedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.authenticated) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid or missing API key' });
  }
  return next({ ctx });
});
```

The `validateApiKey()` function (lines 15–30) already implements dev-mode bypass — when `CAULDRON_API_KEY` is unset, it returns `true` unconditionally, so all procedures pass authentication in local development.

### Procedure Classification

**Mutations — switch to `authenticatedProcedure`:**

| Router File | Procedure | Line |
|-------------|-----------|------|
| `projects.ts` | `create` | 93 |
| `projects.ts` | `archive` | 108 |
| `projects.ts` | `delete` | 126 |
| `projects.ts` | `updateSettings` | 144 |
| `interview.ts` | `startInterview` | 27 |
| `interview.ts` | `sendAnswer` | 109 |
| `interview.ts` | `approveSummary` | 246 |
| `interview.ts` | `rejectSummary` | 348 |
| `interview.ts` | `approveHoldout` | 421 |
| `interview.ts` | `rejectHoldout` | 455 |
| `interview.ts` | `sealHoldouts` | 494 |
| `execution.ts` | `triggerDecomposition` | 61 |
| `execution.ts` | `triggerExecution` | 98 |
| `execution.ts` | `respondToEscalation` | 172 |

Total: **14 mutations** across 3 router files.

**Queries — remain `publicProcedure` (read-only, stay public):**

| Router File | Public Queries |
|-------------|----------------|
| `projects.ts` | `list`, `byId` |
| `interview.ts` | `getTranscript`, `getSummary`, `getHoldouts` |
| `execution.ts` | `getDAG`, `getProjectDAG`, `getBeadDetail`, `getPipelineStatus` |
| `evolution.ts` | `getSeedLineage`, `getEvolutionHistory`, `getConvergenceForSeed` (all queries) |
| `costs.ts` | `getProjectSummary`, `getByModel`, `getByStage`, `getByCycle`, `getTopBeads` (all queries) |
| `router.ts` | `health` |

Note: `evolution.ts` and `costs.ts` contain only queries — they require no changes at all.

### Import Change Pattern

Each modified router file currently imports:
```typescript
import { router, publicProcedure } from '../init';
```

After the change:
```typescript
import { router, publicProcedure, authenticatedProcedure } from '../init';
```

`publicProcedure` remains in the import because queries in the same file still use it.

### Test Pattern — Asserting UNAUTHORIZED

The test harness `createTestContext()` accepts a pre-built context object. To test rejection, create a caller directly:

```typescript
// Source: packages/test-harness/src/context.ts (createCaller pattern)
import { appRouter } from '../../web/src/trpc/router.js';
import { db } from '@get-cauldron/shared';

const unauthCaller = appRouter.createCaller({
  db,
  authenticated: false,
  getEngineDeps: async () => { throw new Error('should not be called'); },
});

// Assert UNAUTHORIZED
await expect(unauthCaller.projects.create({ name: 'test' }))
  .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
```

### Recommended Project Structure

No structural changes required. All files are in their correct locations:
```
packages/web/src/trpc/
├── init.ts                    # authenticatedProcedure lives here (no changes needed)
├── router.ts                  # health query stays public (no changes needed)
└── routers/
    ├── projects.ts            # 4 mutations → authenticatedProcedure
    ├── interview.ts           # 7 mutations → authenticatedProcedure
    ├── execution.ts           # 3 mutations → authenticatedProcedure
    ├── evolution.ts           # queries only — no changes
    ├── costs.ts               # queries only — no changes
    └── __tests__/
        └── auth-middleware.test.ts   # NEW: Wave 0 gap
```

### Anti-Patterns to Avoid

- **Switching query endpoints to `authenticatedProcedure`:** The phase explicitly scopes protection to mutations only. Queries remain public per the design boundary.
- **Modifying `createTestContext` for this phase:** The harness already passes `authenticated: true`. No harness changes are needed.
- **Creating a new procedure type:** Do not create an `unauthenticatedProcedure` — `publicProcedure` serves this role for queries that intentionally stay public.
- **Changing the route handler:** `packages/web/src/app/api/trpc/[trpc]/route.ts` passes `req` to `createTRPCContext`, which calls `validateApiKey(req)`. This wire is already correct.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API key validation | Custom middleware in route.ts | `authenticatedProcedure` in init.ts | Already implemented with dev-mode bypass, correct error codes |
| Bearer token parsing | Manual header extraction | `validateApiKey()` (already in init.ts) | Handles missing headers, malformed format, and dev bypass |
| Auth test setup | New test context variant | `appRouter.createCaller({ authenticated: false, ... })` | createCaller accepts context directly, no harness needed |

**Key insight:** The infrastructure is 100% complete. The work is purely mechanical substitution in 3 files plus 1 new test file.

## Common Pitfalls

### Pitfall 1: Missing `authenticatedProcedure` in Import
**What goes wrong:** TypeScript error `cannot find name 'authenticatedProcedure'` — the symbol is exported from init.ts but not imported in the router file.
**Why it happens:** Mechanical oversight during the swap.
**How to avoid:** Update the import destructuring in each router file before making the procedure substitution.
**Warning signs:** TypeScript compile error immediately upon saving the file.

### Pitfall 2: Accidentally Changing Queries
**What goes wrong:** Read-only queries (e.g., `projects.list`) start rejecting unauthenticated requests, breaking dashboards that don't send auth headers.
**Why it happens:** Find-and-replace changes all `publicProcedure` occurrences rather than only those followed by `.mutation(`.
**How to avoid:** Identify each procedure by its `.query()` or `.mutation()` chain before deciding which base procedure to use. Cross-reference against the mutation table above.
**Warning signs:** Tests that call query procedures without an auth header fail unexpectedly.

### Pitfall 3: Forgetting TypeScript Build Verification
**What goes wrong:** Wiring tests pass but the Next.js build fails because the `authenticatedProcedure` symbol is not recognized in a router file where the import was not updated.
**Why it happens:** Vitest tests import through the test harness path which may resolve differently than the build.
**How to avoid:** Run `pnpm typecheck` after making changes, and run `pnpm build` as part of the regression gate per the `feedback_run_build.md` memory.
**Warning signs:** `pnpm typecheck` reports errors before tests are even run.

### Pitfall 4: UNAUTHORIZED Code Mismatch in Tests
**What goes wrong:** Tests assert `toThrow('UNAUTHORIZED')` but tRPC wraps errors — the message and code live on `error.data?.code` or matching via `rejects.toMatchObject({ code: 'UNAUTHORIZED' })`.
**Why it happens:** TRPCError shapes are non-trivial to match with simple string assertions.
**How to avoid:** Use `rejects.toMatchObject({ code: 'UNAUTHORIZED' })` or check the `.message` property explicitly.
**Warning signs:** Test passes when it should fail (assertion is too weak).

## Code Examples

### Switching a Mutation (projects.ts example)
```typescript
// Source: packages/web/src/trpc/routers/projects.ts (pattern to apply)

// BEFORE:
import { router, publicProcedure } from '../init';
// ...
create: publicProcedure
  .input(z.object({ name: z.string().min(1).max(100) }))
  .mutation(async ({ ctx, input }) => { ... })

// AFTER:
import { router, publicProcedure, authenticatedProcedure } from '../init';
// ...
create: authenticatedProcedure
  .input(z.object({ name: z.string().min(1).max(100) }))
  .mutation(async ({ ctx, input }) => { ... })
```

### Auth Middleware Test Pattern
```typescript
// Source: packages/test-harness/src/context.ts (createCaller pattern, line 100)
import { appRouter } from '../../../trpc/router.js';

// Arrange: unauthenticated caller
const unauthCaller = appRouter.createCaller({
  db: testDb.db as any,
  authenticated: false,
  getEngineDeps: async () => { throw new Error('unreachable'); },
});

// Assert: mutation is rejected
await expect(
  unauthCaller.projects.create({ name: 'blocked' })
).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

// Assert: query is still allowed
const result = await unauthCaller.projects.list();
expect(Array.isArray(result)).toBe(true);
```

## State of the Art

No changes from current best practices — tRPC middleware is the established pattern for procedure-level auth in tRPC v11.

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Route-level middleware (Next.js) | tRPC procedure middleware | tRPC v10+ | Auth runs at procedure granularity, not per-route |
| Manual header checks in each procedure | Shared middleware via `.use()` | tRPC v9+ | DRY, consistent error handling |

## Open Questions

None — the implementation is fully specified by existing code. No external dependencies, no ambiguous design decisions.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — code-only change touching 3 router files and 1 new test file).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `packages/web/vitest.config.ts` (unit), `packages/web/vitest.wiring.config.ts` (wiring) |
| Quick run command | `pnpm -F @get-cauldron/web test` |
| Full suite command | `pnpm -F @get-cauldron/web test:wiring` (requires Docker Postgres :5433) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-02 (mutation rejection) | Mutation with `authenticated: false` throws UNAUTHORIZED | unit (createCaller, no DB) | `pnpm -F @get-cauldron/web test -- src/trpc/routers/__tests__/auth-middleware.test.ts` | Wave 0 gap |
| SEC-02 (dev bypass) | `validated=true` when CAULDRON_API_KEY unset | unit (already covered by validateApiKey behavior in context.ts) | `pnpm -F @get-cauldron/web test -- src/trpc/routers/__tests__/auth-middleware.test.ts` | Wave 0 gap |
| SEC-02 (existing tests unbroken) | All existing wiring tests pass without modification | wiring | `pnpm -F @get-cauldron/web test:wiring` | ✅ (harness already passes `authenticated: true`) |

### Sampling Rate
- **Per task commit:** `pnpm typecheck && pnpm -F @get-cauldron/web test`
- **Per wave merge:** `pnpm build && pnpm -F @get-cauldron/web test:wiring`
- **Phase gate:** Full unit + wiring suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/web/src/trpc/routers/__tests__/auth-middleware.test.ts` — covers SEC-02 (UNAUTHORIZED on mutations, queries still public, dev bypass behavior)

*(Note: No test framework install needed — Vitest is already configured. The gap is only the new test file.)*

## Sources

### Primary (HIGH confidence)
- Direct code read: `packages/web/src/trpc/init.ts` — complete `authenticatedProcedure` and `validateApiKey` implementation confirmed
- Direct code read: `packages/test-harness/src/context.ts` — `authenticated: true` already injected at line 102, confirming zero test modifications needed
- Direct code read: 5 router files — complete mutation/query inventory confirmed, 14 mutations identified across 3 files

### Secondary (MEDIUM confidence)
- tRPC v11 middleware pattern (`.use()`) — consistent with what's already implemented in the codebase

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, everything confirmed from source code
- Architecture: HIGH — authenticatedProcedure exists, test harness already wired for auth, procedure inventory exhaustively counted
- Pitfalls: HIGH — all pitfalls derived from direct code reading (import pattern, query vs mutation distinction, TypeScript build requirement)

**Research date:** 2026-04-02
**Valid until:** Until router files change (stable)
