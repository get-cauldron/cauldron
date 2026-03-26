---
phase: 04-holdout-vault
plan: "01"
subsystem: holdout-vault
tags: [encryption, schema, migration, types, aes-256-gcm, dek-kek, zod]
dependency_graph:
  requires:
    - 01-persistence-foundation (holdout_vault table, migration pattern)
    - 03-interview-seed-pipeline (seeds table, schema patterns)
  provides:
    - holdout status enum with 5 lifecycle states
    - nullable encryption columns for pre-seal rows
    - HoldoutScenarioSchema and domain types
    - sealPayload/unsealPayload envelope encryption
  affects:
    - 04-02 (vault state machine uses these types and crypto)
    - 04-03 (generator uses HoldoutScenariosSchema)
    - 04-04 (evaluator uses HoldoutEvalResult, HoldoutFailureReport)
tech_stack:
  added: []
  patterns:
    - AES-256-GCM DEK/KEK envelope encryption via node:crypto
    - Compound encryptedDek field (dekIv:dekAuthTag:dekCiphertext) avoids extra DB columns
    - Manual migration (no Drizzle Kit) for ALTER TYPE ADD VALUE (cannot run in transaction)
    - vi.stubEnv for unit-testing env-dependent functions
key_files:
  created:
    - packages/engine/src/holdout/types.ts
    - packages/engine/src/holdout/crypto.ts
    - packages/engine/src/holdout/index.ts
    - packages/engine/src/holdout/__tests__/crypto.test.ts
    - packages/shared/src/db/migrations/0004_holdout_vault_review_lifecycle.sql
  modified:
    - packages/shared/src/db/schema/holdout.ts
decisions:
  - "Compound encryptedDek field (dekIv:dekAuthTag:dekCiphertext) instead of separate dek_iv/dek_auth_tag columns — avoids migration complexity, self-contained in one text column"
  - "Made all encryption columns nullable in schema: ciphertext, encryptedDek, iv, authTag, encryptedAt — pending_review and approved rows have no ciphertext until sealed"
  - "vi.stubEnv approach for missing-key test: direct import works cleanly since getKek() reads process.env at call time, not module load time"
metrics:
  duration: "4min"
  completed_date: "2026-03-26"
  tasks_completed: 2
  files_created: 5
  files_modified: 1
---

# Phase 04 Plan 01: Holdout Vault Schema, Types, and Envelope Encryption Summary

**One-liner:** AES-256-GCM DEK/KEK envelope encryption with compound encryptedDek field, extended 5-state holdout_status enum, and Zod scenario schemas.

## What Was Built

### Task 1: Schema migration, extended holdout table, and domain types

**Migration 0004** (`packages/shared/src/db/migrations/0004_holdout_vault_review_lifecycle.sql`):
- Extends `holdout_status` enum: adds `pending_review` and `approved` before `sealed`
- Adds `draft_scenarios jsonb` (holds scenarios during review, cleared after seal)
- Adds `results jsonb` (evaluation results per D-18)
- Adds `evaluated_at timestamp with time zone`
- Makes encryption columns nullable: `ciphertext`, `encrypted_dek`, `iv`, `auth_tag`, `encrypted_at`
- No transaction wrapping — PostgreSQL `ALTER TYPE ADD VALUE` cannot run in a transaction block

**Updated holdout.ts schema** matches migration exactly:
- `holdoutStatusEnum` now has 5 values: `['pending_review', 'approved', 'sealed', 'unsealed', 'evaluated']`
- Default status changed to `'pending_review'`
- All encryption columns are nullable (no `.notNull()`)
- New `draftScenarios`, `results`, `evaluatedAt` columns added

**types.ts** exports:
- `HoldoutScenarioSchema` — Zod object with id (uuid), title, given, when, then, category, acceptanceCriterionRef, severity
- `HoldoutScenariosSchema` — wraps array with `.min(5)` per D-02
- `HoldoutScenario`, `HoldoutScenarios` type aliases
- `SealedPayload` interface — ciphertext, iv, authTag, encryptedDek (compound base64)
- `HoldoutEvalResult` interface — passed, scenarioResults, evaluationModel, evaluatedAt, failureReport
- `HoldoutFailureReport` interface — seedId, failedScenarios, evaluationModel, triggeredBy

**index.ts** barrel exports types and crypto (generator/vault/evaluator/events deferred to later plans).

### Task 2: AES-256-GCM envelope encryption with DEK/KEK and tests

**crypto.ts** implements:
- `sealPayload(plaintext: string): SealedPayload` — generates fresh 32-byte DEK + 12-byte IV, encrypts plaintext, encrypts DEK with KEK, returns compound encryptedDek
- `unsealPayload(sealed: SealedPayload): string` — parses compound encryptedDek, decrypts DEK with KEK, decrypts payload
- `getKek()` (internal) — reads `HOLDOUT_ENCRYPTION_KEY` from env, throws descriptive error if absent

All 8 unit tests pass:
1. Round-trip: encrypt then decrypt returns identical string
2. Uniqueness: different ciphertext/IV/DEK on each call
3. Shape: all 4 SealedPayload fields present and non-empty
4. Tamper ciphertext: GCM throws on auth tag mismatch
5. Tamper authTag: throws on auth tag mismatch
6. Missing key: throws with 'HOLDOUT_ENCRYPTION_KEY' in message
7. Compound format: encryptedDek splits into exactly 3 parts
8. Large payload: 10,000+ character JSON round-trips correctly

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 7732adb | feat(04-01): schema migration 0004, extended holdout types, barrel export |
| Task 2 RED | 114ab3c | test(04-01): add failing crypto tests for AES-256-GCM envelope encryption |
| Task 2 GREEN | 8dc713e | feat(04-01): AES-256-GCM envelope encryption with DEK/KEK, all 8 tests pass |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Test Approach Adjustment (not a deviation, minor simplification)

The initial RED test file used dynamic `import('../crypto.js?t=...')` to reload the module between tests, which is a pattern for modules that cache env vars at load time. Since `getKek()` reads `process.env` at call time (not module load time), `vi.stubEnv` suffices without dynamic re-import. The test was simplified to use direct static import before the GREEN commit. This makes tests faster and avoids Vitest module resolution quirks with query-string suffixes.

## Known Stubs

None — all exports are fully implemented. The `index.ts` barrel has comments noting that generator, vault, evaluator, and events will be added in later plans, but this is documented intentional deferral, not a stub.

## Self-Check: PASSED
