# Deferred Items — Phase 25

## Pre-existing Build Failures (Out of Scope for 25-01)

**Source:** packages/engine/src/asset/events.ts, decomposition/events.ts, evolution/events.ts, holdout/events.ts, decomposition/pipeline.ts

**Error:** `Cannot find module 'inngest'` — inngest package is not installed in the engine package.

**Impact:** `pnpm build` and `pnpm typecheck` fail for engine package. These errors pre-date Phase 25 work.

**Resolution:** Install `inngest` in the engine package or update the tsconfig exclude list to skip events.ts files.
