---
phase: 10-wire-trpc-mutations-to-engine
plan: "02"
subsystem: web/trpc
tags: [tRPC, engine-wiring, holdout-vault, decomposition, encryption, inngest]
dependency_graph:
  requires: [10-01]
  provides: [sealHoldouts-engine-wiring, triggerDecomposition-engine-wiring]
  affects: [packages/web/src/trpc/routers/interview.ts, packages/web/src/trpc/routers/execution.ts]
tech_stack:
  added: []
  patterns: [engine-function-delegation, TDD-red-green, approveScenarios-then-sealVault]
key_files:
  created:
    - packages/web/src/trpc/routers/__tests__/seal-decompose-engine.test.ts
  modified:
    - packages/web/src/trpc/routers/interview.ts
    - packages/web/src/trpc/routers/execution.ts
decisions:
  - sealHoldouts looks up seed first for projectId, then iterates approved vault entries calling approveScenarios then sealVault — matches engine's two-step protocol
  - triggerDecomposition preserves appendEvent audit trail but also calls runDecomposition synchronously — both calls required
  - engineInngest alias used to distinguish @cauldron/engine inngest client (cauldron-engine) from web inngest client (cauldron-web)
metrics:
  duration: "4min"
  completed: "2026-03-27"
  tasks_completed: 2
  files_changed: 3
---

# Phase 10 Plan 02: Wire sealHoldouts and triggerDecomposition to Engine Summary

sealHoldouts and triggerDecomposition tRPC mutations wired to real engine functions (approveScenarios + sealVault, runDecomposition) with the engine Inngest client; direct DB status bypass removed; 9 unit tests added, all 22 web tests pass.

## What Was Built

### Task 1: Wire sealHoldouts to approveScenarios + sealVault

`packages/web/src/trpc/routers/interview.ts` — `sealHoldouts` mutation was a stub that called `db.update().set({ status: 'sealed' })` directly, skipping the engine crypto layer. The holdout vault encryption columns (ciphertext, iv, authTag, encryptedDek) remained null after this stub ran.

The mutation was replaced with:
1. Look up the seed row to get `projectId` (required by `sealVault`)
2. Fetch all vault entries for the seed and filter to `approved` status
3. For each approved entry: call `approveScenarios(db, { vaultId: entry.id, approvedIds: 'all' })` to mark `_approved` flags, then call `sealVault(db, { vaultId: entry.id, projectId: seedRow.projectId })` to encrypt and transition to `sealed`

This matches the engine's two-step protocol from Phase 4. After sealing, the vault row now has ciphertext/iv/authTag/encryptedDek populated.

### Task 2: Wire triggerDecomposition to runDecomposition

`packages/web/src/trpc/routers/execution.ts` — `triggerDecomposition` was a stub that only appended a DB event. The actual `runDecomposition()` pipeline was never invoked — no decomposer LLM calls, no bead persistence, no Inngest dispatch.

The mutation was replaced with:
1. Call `ctx.getEngineDeps()` for the gateway
2. Fetch the seed row by `seedId`
3. Append the audit event (`decomposition_started`) — kept for observability
4. Call `runDecomposition({ db, gateway, inngest: engineInngest, seed, projectId })` with the `@cauldron/engine` Inngest client (id: `cauldron-engine`) — not the web-layer `cauldron-web` client

The `inngest as engineInngest` alias distinguishes the engine client from any web-layer Inngest client.

### Test File

`packages/web/src/trpc/routers/__tests__/seal-decompose-engine.test.ts` — 9 unit tests (5 for sealHoldouts, 4 for triggerDecomposition):

- `sealHoldouts` — approveScenarios called with `approvedIds: 'all'` for each approved entry
- `sealHoldouts` — sealVault called with correct vaultId + projectId
- `sealHoldouts` — approveScenarios called before sealVault (call-order verified)
- `sealHoldouts` — throws when no approved entries exist
- `sealHoldouts` — throws when seed not found
- `triggerDecomposition` — runDecomposition receives engine Inngest client (id: cauldron-engine)
- `triggerDecomposition` — seed fetched and passed to runDecomposition
- `triggerDecomposition` — throws when seed not found
- `triggerDecomposition` — both appendEvent and runDecomposition are called

## Verification

- `pnpm --filter @cauldron/web test` — 22 tests pass
- `pnpm --filter @cauldron/web exec tsc --noEmit` — no type errors
- `grep -n "sealVault" packages/web/src/trpc/routers/interview.ts` — matched
- `grep -n "runDecomposition" packages/web/src/trpc/routers/execution.ts` — matched
- `grep -n "engineInngest" packages/web/src/trpc/routers/execution.ts` — matched
- `grep -c "set({ status: 'sealed'" packages/web/src/trpc/routers/interview.ts` — returns 0

## Deviations from Plan

### Out-of-scope discovery (logged, not fixed)

**Pre-existing @cauldron/web Turbopack build failure** — the monorepo `pnpm run build` had 61 pre-existing errors before any 10-02 changes (verified via git stash). These are `.js` extension import resolution issues in Next.js/Turbopack unrelated to the tRPC mutation wiring. Logged to `deferred-items.md`.

**Test UUID fix (Rule 1 — Bug)** — triggerDecomposition input uses `z.string().uuid()`. Initial test used non-UUID strings (`'seed-001'`, `'project-abc'`). Zod v4 validation rejected them before the handler ran. Fixed inline by switching to valid UUIDs (`11111111-1111-4111-8111-111111111111` pattern).

## Known Stubs

None — both mutations are now wired to real engine functions.

## Self-Check: PASSED

- packages/web/src/trpc/routers/interview.ts — FOUND
- packages/web/src/trpc/routers/execution.ts — FOUND
- packages/web/src/trpc/routers/__tests__/seal-decompose-engine.test.ts — FOUND
- commit 5074dcd (sealHoldouts) — FOUND
- commit 3d6a4f1 (triggerDecomposition) — FOUND
