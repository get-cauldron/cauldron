# Phase 26: Auth Middleware - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Every tRPC mutation route requires a valid API key — no operation is publicly accessible when CAULDRON_API_KEY is set. Queries remain public (read-only).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. The `authenticatedProcedure` middleware already exists in `packages/web/src/trpc/init.ts`; the task is to switch all 14 mutation endpoints from `publicProcedure` to `authenticatedProcedure`.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `authenticatedProcedure` in `packages/web/src/trpc/init.ts:40-45` — already implements Bearer token validation against `CAULDRON_API_KEY` env var
- `validateApiKey()` in same file — handles dev-mode bypass (no key set = allow all)

### Established Patterns
- tRPC routers in `packages/web/src/trpc/routers/` — projects, interview, execution, evolution, costs
- All mutations currently use `publicProcedure` (14 total across 3 routers)
- Queries use `publicProcedure` and should remain public

### Integration Points
- Route handler at `packages/web/src/app/api/trpc/[trpc]/route.ts` — passes `req` to context
- Integration tests may need API key headers if CAULDRON_API_KEY is set during test

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.

</deferred>
