---
phase: 04-holdout-vault
plan: "02"
subsystem: holdout
tags: [holdout, encryption, vault, state-machine, tdd, key-isolation]
dependency_graph:
  requires: ["04-01"]
  provides: ["holdout-generator", "holdout-vault-service"]
  affects: ["packages/engine/src/holdout"]
tech_stack:
  added: []
  patterns: ["TDD red-green", "envelope encryption", "state machine", "child process isolation proof"]
key_files:
  created:
    - packages/engine/src/holdout/generator.ts
    - packages/engine/src/holdout/__tests__/generator.test.ts
    - packages/engine/src/holdout/__tests__/vault.test.ts
    - packages/engine/src/holdout/__tests__/key-isolation.integration.test.ts
  modified:
    - packages/engine/src/holdout/vault.ts
    - packages/engine/src/holdout/index.ts
decisions:
  - "tsx used for key isolation child process (runs TS source without compiled dist)"
  - "Key isolation test uses temp file + tsx not --input-type=module (tsx resolves .js imports to .ts)"
  - "DraftScenario internal type annotates _approved flag without separate DB column"
metrics:
  duration: "7 minutes"
  completed: "2026-03-26"
  tasks_completed: 2
  files_created: 5
  files_modified: 1
---

# Phase 04 Plan 02: Holdout Scenario Generator and Vault Service Summary

**One-liner:** Adversarial holdout generator via LLM gateway with two-step vault review state machine (pending_review -> approved -> sealed), AES-256-GCM envelope encryption, and child-process key isolation proof.

## What Was Built

### Task 1: Holdout Scenario Generator

`packages/engine/src/holdout/generator.ts` implements:

- `ADVERSARIAL_SYSTEM_PROMPT` — instructs holdout model to generate tests a different AI would miss, covering boundary conditions, error handling, null inputs, unicode, concurrency, security edge cases (D-04)
- `generateHoldoutScenarios()` — calls `gateway.generateObject` with `stage: 'holdout'` (gateway enforces cross-model diversity via `enforceDiversity()`), temperature 0.8, `HoldoutScenariosSchema` with min 5 validation
- `buildGeneratorPrompt()` — includes seed goal, acceptance criteria, constraints, and optional rejection context
- `regenerateRejected()` — uses relaxed schema (no min 5), combines `existingApproved + newlyGenerated` per D-09

All 6 generator tests pass.

### Task 2: Vault Service with State Machine

`packages/engine/src/holdout/vault.ts` implements:

- `VALID_TRANSITIONS` map enforcing `pending_review -> approved -> sealed -> unsealed -> evaluated` with no skipping per D-16
- `createVault()` — inserts with `status: 'pending_review'`, `draftScenarios` JSONB with `_approved: false` annotations
- `approveScenarios()` — validates min 5 guard, transitions to `approved`, stores approval metadata in draftScenarios
- `rejectScenarios()` — returns rejected IDs without status change (vault stays `pending_review` for regeneration flow)
- `sealVault()` — two-step sealing per D-07: reads approved vault, enforces min 5, strips `_approved` metadata, serializes to JSON, calls `sealPayload()`, stores all four encrypted columns, nulls `draftScenarios`, sets `encryptedAt`, emits `holdouts_sealed` audit event
- `getVaultStatus()` — returns status, scenario count, isSealed without touching ciphertext

All 10 vault unit tests pass.

### Key Isolation Integration Test

`packages/engine/src/holdout/__tests__/key-isolation.integration.test.ts`:

- Uses `spawnSync` to spawn a child process via `tsx` (handles TypeScript source directly)
- Child process environment has no `HOLDOUT_ENCRYPTION_KEY`
- Child tries to call `unsealPayload()` — `getKek()` throws with `'HOLDOUT_ENCRYPTION_KEY is required'`
- Child exits with sentinel code 42
- Test asserts `result.status === 42`

Key isolation integration test passes, proving the security guarantee.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed tsx path resolution in key isolation test**
- **Found during:** Task 2 key isolation
- **Issue:** Initial path used `'../../../..'` from `__tests__/` which resolved to `packages/` not `packages/engine/` — tsx binary not found, spawnSync returned null status
- **Fix:** Corrected relative path to `'../../..'` to properly resolve to `packages/engine/`, tsx at `../../node_modules/.bin/tsx`
- **Files modified:** `packages/engine/src/holdout/__tests__/key-isolation.integration.test.ts`
- **Commit:** fb9d1d9

**2. [Rule 1 - Bug] Lowercase "boundary" in adversarial prompt**
- **Found during:** Task 1 generator tests
- **Issue:** `ADVERSARIAL_SYSTEM_PROMPT` had capitalized "Boundary conditions" but test and acceptance criteria check for lowercase `boundary`
- **Fix:** Changed list item to lowercase `boundary conditions`
- **Files modified:** `packages/engine/src/holdout/generator.ts`

## Known Stubs

None. All exports are fully wired.

## Self-Check

### Files Exist
- [x] `packages/engine/src/holdout/generator.ts` — confirmed exists
- [x] `packages/engine/src/holdout/vault.ts` — confirmed exists
- [x] `packages/engine/src/holdout/__tests__/generator.test.ts` — confirmed exists
- [x] `packages/engine/src/holdout/__tests__/vault.test.ts` — confirmed exists
- [x] `packages/engine/src/holdout/__tests__/key-isolation.integration.test.ts` — confirmed exists

### Commits
- `4757f62` — feat(04-02): holdout scenario generator
- `fb9d1d9` — feat(04-02): vault service with state machine

### Test Results
- Generator tests: 6/6 pass
- Vault unit tests: 10/10 pass
- Key isolation integration test: 1/1 pass
- Total new tests: 17
- Total engine tests: 136 pass, 0 fail

## Self-Check: PASSED
