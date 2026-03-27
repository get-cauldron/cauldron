# Deferred Items — Phase 10

## Pre-existing Build Failures (Out of Scope)

**Discovered during:** Plan 10-02 execution
**Status:** Pre-existing before any 10-02 changes (verified via git stash test)

### @cauldron/web Turbopack Build Errors

The `pnpm run build` monorepo build has 61 pre-existing errors in `@cauldron/web`:

1. `packages/web/src/app/api/webhook/git/route.ts` — imports `../../../../inngest/client.js` which resolves to a `.ts` file (Node16 moduleResolution requires `.js` extensions pointing to `.ts` source, but Next.js/Turbopack needs different handling)
2. `packages/web/src/app/api/inngest/route.ts` — same resolution issue with `../../../inngest/client.js` and `../../../inngest/pipeline-trigger.js`
3. `packages/web/src/trpc/routers/evolution.ts` — imports `../init.js` (same resolution issue)

These errors exist on the pre-10-02 commit (`0c64c22`) and are unrelated to this plan's changes.

**Recommended fix:** Convert `.js` extension imports to no-extension or investigate Next.js Turbopack configuration for TypeScript resolution. Defer to a dedicated fix plan.
