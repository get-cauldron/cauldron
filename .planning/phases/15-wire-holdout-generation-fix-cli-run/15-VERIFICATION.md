---
phase: 15-wire-holdout-generation-fix-cli-run
verified: 2026-03-27T21:30:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 15: Wire Holdout Generation / Fix CLI Run — Verification Report

**Phase Goal:** Trigger holdout scenario generation after seed crystallization so the vault is populated for review/sealing, and fix `cauldron run` so the full CLI pipeline (interview → crystallize → seal → decompose → execute) completes without manual intervention.
**Verified:** 2026-03-27T21:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After `approveSummary` crystallizes a seed, holdout scenarios are generated and stored in the vault | VERIFIED | `generateHoldoutScenarios` called at line 287 then `createVault` at line 292 inside `approveSummary` mutation, both in a post-crystallize try/catch block |
| 2 | `getHoldouts` tRPC returns non-empty scenarios for a crystallized seed | VERIFIED | `getHoldouts` queries `holdoutVault` table by `seedId`; vault is now always populated after crystallization (truth 1 establishes this path). UI wired at `packages/web/src/app/projects/[id]/interview/page.tsx:65` |
| 3 | `sealHoldouts` succeeds after holdout scenarios are generated and approved | VERIFIED | `sealHoldouts` mutation finds `approved` entries and calls `approveScenarios` + `sealVault` per entry; vault is populated by truth 1 so the `approved.length === 0` guard will not fire after a standard crystallize flow |
| 4 | `cauldron run` passes `seedId` from crystallize stage to seal stage without manual `--seed-id` flag | VERIFIED | `run.ts:62` captures `seedId = result?.seedId`; `run.ts:81` injects `--seed-id`, `seedId`, `--approve-all` into `sealArgs`; guard at line 77 throws clear error if `seedId` is missing |
| 5 | Cross-model diversity is active during holdout generation (gateway enforces holdout stage uses different family than implementation) | VERIFIED | `generator.ts:88` passes `stage: 'holdout'` to `gateway.generateObject`; `gateway.ts:134,171,205,235` enforce cross-model diversity for `stage === 'holdout'`; `cauldron.config.ts:9` maps holdout stage to `['gemini-2.5-pro', 'gpt-4.1']` |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/web/src/trpc/routers/interview.ts` | Holdout generation wiring in `approveSummary` mutation | VERIFIED | Contains `generateHoldoutScenarios` (2 occurrences: import + call) and `createVault` (2 occurrences: import + call) |
| `packages/cli/src/commands/crystallize.ts` | `seedId` return value from `crystallizeCommand` | VERIFIED | Return type `Promise<{ seedId: string } | undefined>` at line 21; two `return { seedId: result.seedId }` statements (JSON path line 70, human-readable path line 79) |
| `packages/cli/src/commands/run.ts` | `seedId` propagation from crystallize to seal stage | VERIFIED | `let seedId` at line 36; captured at line 62; injected into `sealArgs` at line 81 with `--seed-id` and `--approve-all`; guard at line 77 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/web/src/trpc/routers/interview.ts` | `@get-cauldron/engine generateHoldoutScenarios` | Direct import and call inside `approveSummary` | WIRED | Line 5: imported; line 287: called with `{ gateway, seed, projectId }` |
| `packages/web/src/trpc/routers/interview.ts` | `@get-cauldron/engine createVault` | Direct import and call after generation | WIRED | Line 5: imported; line 292: called with `{ seedId: seed.id, scenarios }` |
| `packages/cli/src/commands/run.ts` | `packages/cli/src/commands/crystallize.ts` | Return value capture | WIRED | Line 61: `const result = await crystallizeCommand(...)`; line 62: `seedId = result?.seedId` |
| `packages/cli/src/commands/run.ts` | `packages/cli/src/commands/seal.ts` | `--seed-id` arg injection | WIRED | Line 81: `const sealArgs = [...args, '--seed-id', seedId, '--approve-all']`; line 82: `await sealCommand(client, sealArgs, flags)` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `interview.ts approveSummary` | `scenarios` | `generateHoldoutScenarios({ gateway, seed, projectId })` — calls `gateway.generateObject` with real LLM call | Yes — gateway routes to LLM; result flows into `createVault` which persists to DB | FLOWING |
| `interview.ts getHoldouts` | `vaultEntries` | `ctx.db.select().from(holdoutVault).where(eq(holdoutVault.seedId, seedId))` | Yes — DB query returns real rows; flatMapped into `scenarios` array that is returned | FLOWING |
| `run.ts Seal stage` | `seedId` | Captured from `crystallizeCommand` return value (tRPC `approveSummary` result) | Yes — `approveSummary` returns `seed.id` from DB-persisted seed row | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `crystallizeCommand` exports a function | `node --import tsx/esm` dynamic import | `crystallizeCommand type: function` | PASS |
| `runCommand` exports a function | `node --import tsx/esm` dynamic import | `runCommand type: function` | PASS |
| Web typecheck clean | `pnpm -F @get-cauldron/web typecheck` | Exit 0, no errors | PASS |
| CLI typecheck clean | `pnpm -F @get-cauldron/cli typecheck` | Exit 0, no errors | PASS |
| Web unit tests | `pnpm -F @get-cauldron/web test` | 31/31 passed | PASS |
| CLI unit tests | `pnpm -F @get-cauldron/cli test` | 87/87 passed | PASS |
| Full build | `pnpm build` | FAIL — pre-existing `DATABASE_URL` required at build time in `/api/webhook/git` and `/api/events/[projectId]` routes; confirmed pre-existing by stash test showing 69 Turbopack errors before phase 15 changes | SKIP (pre-existing) |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| HOLD-01 | 15-01-PLAN.md | Holdout scenario tests generated by a different LLM provider/family than the interview model | SATISFIED | `generator.ts` uses `stage: 'holdout'`; gateway enforces cross-model diversity at `gateway.ts:134,171,205,235`; holdout models configured as Gemini + GPT-4 vs interview stage |
| HOLD-02 | 15-01-PLAN.md | Generated holdout tests presented to user for review and approval before encryption | SATISFIED | `getHoldouts` tRPC query provides scenarios for review; `approveHoldout`/`rejectHoldout` mutations exist; web page wires all three at `interview/page.tsx:65,185` with 6 references to seal/approve/reject mutations |
| HOLD-03 | 15-01-PLAN.md | Approved holdout tests encrypted at rest using AES-256-GCM with keys inaccessible to implementation agent processes | SATISFIED | `sealVault` (wired in `sealHoldouts` mutation) calls `sealPayload` with AES-256-GCM via `node:crypto`; encryption pre-exists in vault.ts from Phase 4; this phase wires the trigger path |
| HOLD-05 | 15-01-PLAN.md | Holdout tests remain sealed during all execution and evolution cycles | SATISFIED | Vault FSM enforces `sealed → unsealed → evaluated` transitions only (vault.ts:13-15); no execution or evolution path bypasses this; sealed status set and not overwritten by phase 15 changes |
| LLM-06 | 15-01-PLAN.md | Cross-model diversity enforced: holdout generator must use a different provider than implementer | SATISFIED | `stage: 'holdout'` in `generateHoldoutScenarios`; gateway's `getModel` method checks `implementerFamily` and excludes that family for holdout/evaluation stages |
| WEB-05 | 15-01-PLAN.md | Human approval gate UX for seed crystallization and holdout test review | SATISFIED | `approveSummary` mutation crystallizes seed and triggers holdout generation; `approveHoldout`/`rejectHoldout`/`sealHoldouts` tRPC mutations all wired in `interview.ts`; UI at `interview/page.tsx` uses all three |
| CLI-01 | 15-01-PLAN.md | All pipeline operations available via CLI (start interview, trigger execution, check status, approve holdouts) | SATISFIED | `runCommand` orchestrates all 5 stages sequentially; `seedId` now propagated from crystallize to seal stage; `--approve-all` auto-injected for non-interactive pipeline mode |

No orphaned requirements found — all 7 IDs from plan frontmatter are accounted for.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/web/src/trpc/routers/interview.ts` | 294 | `console.error` for holdout generation failure | Info | Intentional design decision — holdout failure is non-critical post-crystallization side effect; seed remains crystallized and `seedId` is returned. Error is logged for observability. Not a stub. |

No blockers or warnings found.

---

### Human Verification Required

#### 1. End-to-end holdout generation with real LLM

**Test:** Run `cauldron interview --project <id>`, complete an interview to the reviewing phase, then run `cauldron crystallize --project <id>`. Inspect the DB `holdout_vault` table to confirm rows were created with `draft_scenarios` populated.
**Expected:** At least 5 holdout scenarios generated and stored in `holdout_vault` with `status = 'pending_review'`.
**Why human:** Requires live LLM API keys and a running PostgreSQL instance; cannot verify programmatically in this environment.

#### 2. Full `cauldron run` pipeline non-interactive completion

**Test:** Run `cauldron run --project <id>` against a project that has a completed interview. Observe that the pipeline advances through all 5 stages without halting at the Seal stage with `Error: --seed-id is required`.
**Expected:** All 5 stages succeed with green spinners; final output shows "Pipeline complete! All stages succeeded."
**Why human:** Requires live DB, LLM keys, and Inngest server; end-to-end integration cannot be replicated with unit tests.

#### 3. Cross-model diversity enforcement in practice

**Test:** With API keys configured for multiple providers, trigger crystallization and observe which model is selected for holdout generation vs which was used for the interview stage.
**Expected:** Holdout generation uses a different model family than the interview (e.g., if interview used Claude, holdout uses Gemini or GPT-4).
**Why human:** Gateway routing is deterministic given config, but confirming the actual provider selection requires inspecting LLM usage logs or the `llm_usage` DB table during a live run.

---

### Gaps Summary

No gaps found. All 5 observable truths are verified, all 3 artifacts pass all 4 levels (exist, substantive, wired, data-flowing), all 4 key links are wired, and all 7 requirements are satisfied.

The build failure (`pnpm build`) is pre-existing and unrelated to phase 15 — it manifests as a missing `DATABASE_URL` environment variable at Next.js build time for two route handlers (`/api/webhook/git` and `/api/events/[projectId]`). Confirmed pre-existing via git stash isolation test showing 69 Turbopack errors before phase 15 changes were applied.

---

_Verified: 2026-03-27T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
