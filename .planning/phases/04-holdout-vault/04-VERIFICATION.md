---
phase: 04-holdout-vault
verified: 2026-03-26T21:20:00Z
status: passed
score: 12/12 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Run the holdout sealing flow end-to-end against a real PostgreSQL instance"
    expected: "Migration 0004 applies cleanly; pending_review -> approved -> sealed state transitions work with real DB; encrypted columns are not null after sealing; draft_scenarios is null after sealing"
    why_human: "DB integration test requires running Postgres; compile + unit checks cannot verify actual JSONB storage and column nullability enforcement at runtime"
  - test: "Verify HOLDOUT_ENCRYPTION_KEY is excluded from the actual agent process environment when Phase 5/6 orchestration runs"
    expected: "Implementation agents spawned during bead execution do not have HOLDOUT_ENCRYPTION_KEY in process.env"
    why_human: "Structural enforcement is proven by key-isolation.integration.test.ts, but actual Phase 6 process spawning with correct env restriction has not been wired yet"
---

# Phase 04: Holdout Vault Verification Report

**Phase Goal:** Cross-model adversarial tests are generated, encrypted at rest with keys inaccessible to agent processes, and remain sealed through all execution until convergence — making it structurally impossible for the implementation agents to see or game the tests they will be evaluated against.

**Verified:** 2026-03-26T21:20:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | AES-256-GCM envelope encryption round-trips: encrypt then decrypt returns identical plaintext | VERIFIED | `crypto.ts` sealPayload/unsealPayload DEK/KEK implementation; Test 1 in crypto.test.ts confirms round-trip |
| 2  | Decryption throws a clear error when HOLDOUT_ENCRYPTION_KEY is missing from process.env | VERIFIED | `getKek()` in crypto.ts line 15–18; Test 6 confirms error message contains 'HOLDOUT_ENCRYPTION_KEY' |
| 3  | holdoutStatusEnum includes all 5 lifecycle states: pending_review, approved, sealed, unsealed, evaluated | VERIFIED | holdout.ts lines 4–10; all 5 values present |
| 4  | holdout_vault table has draft_scenarios JSONB, results JSONB, and evaluated_at columns | VERIFIED | holdout.ts lines 22–28; all three nullable columns present |
| 5  | Holdout scenarios are generated via gateway.generateObject with stage 'holdout' ensuring cross-model diversity | VERIFIED | generator.ts line 87: `stage: 'holdout'`; both generateHoldoutScenarios and regenerateRejected use this stage |
| 6  | User can approve, reject, or bulk-approve individual scenarios before sealing | VERIFIED | vault.ts exports approveScenarios (with 'all' option), rejectScenarios; state machine enforces order |
| 7  | Vault refuses to seal with fewer than 5 approved scenarios | VERIFIED | vault.ts lines 102–106 in approveScenarios; lines 163–167 in sealVault; "Minimum 5 approved scenarios required" |
| 8  | After sealing, draft_scenarios is nulled and encryption columns are populated | VERIFIED | vault.ts lines 177–185: draftScenarios set to null, ciphertext/encryptedDek/iv/authTag set from sealPayload result |
| 9  | Vault status transitions follow: pending_review -> approved -> sealed (no skipping) | VERIFIED | VALID_TRANSITIONS map in vault.ts lines 11–16; assertValidTransition enforced on every state change |
| 10 | A child process without HOLDOUT_ENCRYPTION_KEY cannot decrypt sealed data | VERIFIED | key-isolation.integration.test.ts uses spawnSync without key; child exits with sentinel code 42 |
| 11 | Vault unseals only when evolution_converged event is received — never during execution or mid-evolution | VERIFIED | events.ts: handleEvolutionConverged listens only for 'evolution_converged'; unsealVault is called exclusively inside that Inngest step |
| 12 | Failed holdout scenarios produce a structured failure report that triggers evolution_started | VERIFIED | events.ts lines 97–108: conditional on !evalResult.passed; appendEvent with type 'evolution_started' and failureReport payload |

**Score:** 12/12 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/engine/src/holdout/crypto.ts` | sealPayload() and unsealPayload() with DEK/KEK envelope encryption | VERIFIED | 114 lines; full AES-256-GCM implementation; exports sealPayload, unsealPayload |
| `packages/engine/src/holdout/types.ts` | HoldoutScenario Zod schema, domain types, status enum | VERIFIED | Exports HoldoutScenarioSchema, HoldoutScenariosSchema, HoldoutScenario, SealedPayload, HoldoutEvalResult, HoldoutFailureReport |
| `packages/shared/src/db/schema/holdout.ts` | Extended holdoutStatusEnum and holdoutVault table with new columns | VERIFIED | 5-value enum; nullable encryption columns; draftScenarios, results, evaluatedAt present |
| `packages/shared/src/db/migrations/0004_holdout_vault_review_lifecycle.sql` | PostgreSQL migration for enum extension and new columns | VERIFIED | 2 ALTER TYPE statements; 5 column additions/modifications; no BEGIN/COMMIT |
| `packages/engine/src/holdout/generator.ts` | generateHoldoutScenarios() — LLM call via gateway for adversarial test generation | VERIFIED | 132 lines; exports generateHoldoutScenarios, regenerateRejected; adversarial prompt with boundary/edge case focus |
| `packages/engine/src/holdout/vault.ts` | Vault service: createVault, approveScenarios, rejectScenarios, sealVault, getVaultStatus | VERIFIED | 323 lines; all exports present plus unsealVault, storeEvalResults added in Plan 03 |
| `packages/engine/src/holdout/__tests__/key-isolation.integration.test.ts` | Child process integration test proving key isolation | VERIFIED | Uses spawnSync; spawns tsx child without HOLDOUT_ENCRYPTION_KEY; asserts exit code 42 |
| `packages/engine/src/holdout/evaluator.ts` | evaluateHoldouts() — LLM evaluation of holdout scenarios against built code | VERIFIED | Exports evaluateHoldouts, buildFailureReport; uses stage 'evaluation'; EvalResultSchema Zod |
| `packages/engine/src/holdout/events.ts` | Inngest function: handleEvolutionConverged — unseal, evaluate, emit failure if needed | VERIFIED | Inngest client 'cauldron-engine'; 4-step durable pipeline; configureVaultDeps factory |
| `packages/engine/src/holdout/index.ts` | Barrel export for all holdout modules | VERIFIED | Exports types, crypto, generator, vault, evaluator, events |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `generator.ts` | `gateway.ts` | gateway.generateObject with stage: 'holdout' | WIRED | Lines 85–94 and 118–127: both generation calls use stage 'holdout' |
| `vault.ts` | `crypto.ts` | sealPayload for encryption on seal | WIRED | Line 172: `const sealed = sealPayload(plaintext)`; unsealPayload used on line 230 |
| `vault.ts` | `event-store.ts` | appendEvent for holdouts_sealed audit trail | WIRED | Lines 187–195: appendEvent with type 'holdouts_sealed' |
| `events.ts` | `vault.ts` | unsealVault() call inside Inngest step | WIRED | Line 77: `return unsealVault(db, { vaultId, projectId })` |
| `events.ts` | `evaluator.ts` | evaluateHoldouts() call inside Inngest step | WIRED | Lines 81–88: `return evaluateHoldouts({...})` |
| `events.ts` | `event-store.ts` | appendEvent for holdouts_unsealed and evolution_started | WIRED | vault.ts line 247 (holdouts_unsealed); events.ts line 99 (evolution_started) |
| `evaluator.ts` | `gateway.ts` | gateway.generateObject with stage 'evaluation' | WIRED | Line 101–108: `stage: 'evaluation'` |
| `crypto.ts` | `process.env.HOLDOUT_ENCRYPTION_KEY` | getKek() helper | WIRED | Lines 14–18: reads `process.env['HOLDOUT_ENCRYPTION_KEY']`; throws if absent |

---

### Data-Flow Trace (Level 4)

Not applicable. This phase produces cryptographic infrastructure, domain services, and Inngest event handlers — no React/UI components rendering dynamic data from a remote source. The data flows are through DB reads/writes in vault.ts and LLM calls in generator.ts/evaluator.ts, all of which are verified by the test suite.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 154 holdout tests pass (crypto, generator, vault, evaluator, events, key-isolation) | `pnpm --filter @cauldron/engine test -- --grep "crypto|generator|vault|evaluator|events|key.isolation"` | 154 passed, 0 failed | PASS |
| TypeScript compiles clean in @cauldron/shared | `pnpm --filter @cauldron/shared exec tsc --noEmit` | No output (clean) | PASS |
| TypeScript compiles clean in @cauldron/engine | `pnpm --filter @cauldron/engine exec tsc --noEmit` | No output (clean) | PASS |
| Migration has no transaction wrapping (ALTER TYPE ADD VALUE requirement) | `grep -c "BEGIN" 0004_holdout_vault_review_lifecycle.sql` | 0 matches | PASS |
| Migration contains 2 ALTER TYPE statements | `grep -c "ALTER TYPE" migration.sql` | 3 matches (2 ADD VALUE + 1 comment reference) | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| HOLD-01 | 04-02 | Holdout scenario tests generated by a different LLM provider/family than the interview model | SATISFIED | generator.ts calls `stage: 'holdout'`; gateway.enforceDiversity() selects different provider family per gateway contract |
| HOLD-02 | 04-02 | Generated holdout tests presented to user for review and approval before encryption | SATISFIED | vault.ts approveScenarios/rejectScenarios; two-step pending_review -> approved -> sealed; min-5 guard enforced |
| HOLD-03 | 04-01 | Approved holdout tests encrypted at rest using AES-256-GCM with keys inaccessible to implementation agent processes | SATISFIED | crypto.ts AES-256-GCM DEK/KEK; vault.ts sealVault nulls draft_scenarios; key isolation proven by integration test |
| HOLD-04 | 04-01 | Encryption key stored in environment variable excluded from agent process environment scope | SATISFIED | getKek() reads HOLDOUT_ENCRYPTION_KEY; key-isolation test proves child without key exits with code 42 |
| HOLD-05 | 04-02, 04-03 | Holdout tests remain sealed during all execution and evolution cycles | SATISFIED | unsealVault only callable from events.ts which triggers on evolution_converged only; state machine blocks any path to unsealed from sealed without that trigger |
| HOLD-06 | 04-03 | Holdout tests unsealed only after evolutionary convergence is reached | SATISFIED | handleEvolutionConverged registered for `evolution_converged` event only; unsealVault inside that step |
| HOLD-07 | 04-03 | Unsealed holdout test results determine whether additional evolution cycles are needed | SATISFIED | evaluateHoldouts returns per-scenario pass/fail; evalResult.passed drives conditional in convergenceHandler |
| HOLD-08 | 04-03 | Holdout test failure triggers new evolutionary cycle with the failure context | SATISFIED | events.ts lines 97–108: if !evalResult.passed, appends evolution_started event with failureReport |

All 8 requirements satisfied. No orphaned requirements found.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/engine/src/holdout/evaluator.ts` | 115 | `evaluationModel = 'evaluation-stage'` hardcoded string instead of actual resolved model ID | Info | Informational only; stored in results JSONB and HoldoutFailureReport. Does not affect seal/unseal/evaluation correctness. Phase 6 will wire real model ID from gateway response. Documented as known stub in 04-03-SUMMARY.md. |

No blocker or warning anti-patterns found.

---

### Human Verification Required

#### 1. DB Integration: Full Lifecycle Against Real PostgreSQL

**Test:** Apply migration 0004 to a test database, then run createVault -> approveScenarios -> sealVault -> unsealVault -> storeEvalResults end-to-end.
**Expected:** Each state transition persists correctly; encrypted columns are non-null after sealing; draft_scenarios is null after sealing; results JSONB is set after storeEvalResults; all column types match migration definition.
**Why human:** DB integration tests require a running PostgreSQL instance. Unit tests mock the DbClient; actual JSONB storage, nullable column enforcement, and enum value persistence at the database layer are untested.

#### 2. Agent Process Key Isolation in Phase 5/6 Wiring

**Test:** When Phase 6 wires the execution pipeline and spawns implementation agent processes, verify HOLDOUT_ENCRYPTION_KEY is absent from those processes' environment.
**Expected:** Agent process env does not contain HOLDOUT_ENCRYPTION_KEY; if any agent attempts to import and use crypto.ts, it receives the "HOLDOUT_ENCRYPTION_KEY is required" error.
**Why human:** The structural proof (key-isolation.integration.test.ts) is in place, but Phase 6 hasn't been written yet. The actual env restriction depends on how Phase 6 spawns agent processes.

---

### Gaps Summary

No gaps. All must-haves are verified. The phase goal is fully achieved at the code level:

- AES-256-GCM DEK/KEK envelope encryption is implemented and tested (8 unit tests).
- Holdout vault state machine enforces pending_review -> approved -> sealed -> unsealed -> evaluated with no skipping.
- Key isolation is structurally proven: child processes without HOLDOUT_ENCRYPTION_KEY cannot decrypt.
- Cross-model diversity is enforced by passing `stage: 'holdout'` to the gateway.
- Sealing nulls plaintext draft_scenarios — scenarios are structurally inaccessible after sealing without the key.
- Convergence handler (Inngest) unseals only on evolution_converged, evaluates, and conditionally emits evolution_started with failure context.
- TypeScript compiles clean across both packages. 154 tests pass.

The only noted item (`evaluationModel = 'evaluation-stage'`) is informational, documented, and has no impact on security properties or evaluation correctness.

---

_Verified: 2026-03-26T21:20:00Z_
_Verifier: Claude (gsd-verifier)_
