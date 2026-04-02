---
phase: 28-kek-rotation-infrastructure
plan: 01
subsystem: database
tags: [crypto, aes-256-gcm, kek, dek, rotation, postgres, drizzle, vitest]

requires:
  - phase: 04-holdout-vault
    provides: "AES-256-GCM envelope encryption (DEK/KEK), sealPayload/unsealPayload, holdout_vault schema"
  - phase: 22-schema-migrations-integrity-indexes
    provides: "Drizzle migration infrastructure and schema patterns"

provides:
  - kek_versions table (serial PK, status enum, key fingerprint, timestamps)
  - kek_rotation_log append-only audit table (rotation_started, rotation_completed, old_key_retired events)
  - kek_version FK column on holdout_vault
  - rotateKek() bulk DEK re-encryption with audit trail
  - retireKek() with vault reference check guard
  - reencryptDek() compound DEK string re-encryption
  - kekFingerprint() SHA-256 hex digest for key verification
  - initKekVersion() for first-time KEK version setup
  - unsealPayloadWithFallback() dual-key window for safe rotation
  - Migration 0019 for all schema additions

affects: [28-02, holdout, crypto, security]

tech-stack:
  added: []
  patterns:
    - "KEK rotation: serialize via kek_versions serial PK; holdout rows carry kek_version FK"
    - "Dual-key window: HOLDOUT_ENCRYPTION_KEY_PREV fallback during rotation window"
    - "Audit-only log: kek_rotation_log is NOT project-scoped; rotation is global infra op"
    - "DEK re-encryption: compound format (iv:authTag:ciphertext) preserved across rotation"

key-files:
  created:
    - packages/shared/src/db/schema/kek.ts
    - packages/engine/src/holdout/rotation.ts
    - packages/engine/src/holdout/__tests__/rotation.test.ts
    - packages/shared/src/db/migrations/0019_clean_lord_tyger.sql
  modified:
    - packages/shared/src/db/schema/holdout.ts
    - packages/shared/src/db/schema/index.ts
    - packages/engine/src/holdout/crypto.ts
    - packages/engine/src/holdout/index.ts
    - packages/shared/src/db/migrations/meta/0018_snapshot.json
    - packages/shared/src/db/migrations/meta/_journal.json

key-decisions:
  - "kek_versions uses serial PK (not UUID) so holdout_vault can carry a compact integer FK"
  - "kek_rotation_log is NOT project-scoped - rotation is a global infra operation, not per-project"
  - "unsealPayloadWithKek extracted as private helper to avoid duplicating decrypt logic in fallback"
  - "HOLDOUT_ENCRYPTION_KEY_PREV env var (not DB) for dual-key window - avoids storing key material"
  - "retireKek checks vault rows first and blocks if any reference the version (safety guard)"

patterns-established:
  - "Dual-key unseal: try current KEK, catch any error, fall back to PREV if set"
  - "Key fingerprint: SHA-256 hex digest stored in DB for verification without storing key material"
  - "Rotation audit: started/completed/retired events with version + timing payload in kek_rotation_log"

requirements-completed: [SEC-01]

duration: 35min
completed: 2026-04-02
---

# Phase 28 Plan 01: KEK Rotation Infrastructure Summary

**AES-256-GCM KEK rotation with bulk DEK re-encryption, versioned key table, append-only audit log, and dual-key fallback for zero-disruption rotation windows**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-04-02T08:10:00Z
- **Completed:** 2026-04-02T08:18:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Created `kek_versions` and `kek_rotation_log` Drizzle schema tables with migration 0019
- Implemented full rotation pipeline: `rotateKek` re-encrypts all DEKs, writes audit events, returns counts
- Added `retireKek` with vault reference guard preventing premature retirement
- Exported `unsealPayloadWithFallback` from crypto.ts enabling safe dual-key window during rotation
- 16 unit tests covering all rotation behaviors including mock DB interactions

## Task Commits

Each task was committed atomically:

1. **Task 1 + Task 2: Schema, migration, rotation core logic, dual-key unseal, and tests** - `366965a` (feat)

**Plan metadata:** committed with SUMMARY

## Files Created/Modified

- `packages/shared/src/db/schema/kek.ts` - kek_versions + kek_rotation_log table definitions with kek_status enum
- `packages/shared/src/db/schema/holdout.ts` - Added kekVersion integer FK column to holdout_vault
- `packages/shared/src/db/schema/index.ts` - Added kek.ts export before holdout.ts (load order dependency)
- `packages/shared/src/db/migrations/0019_clean_lord_tyger.sql` - Migration: CREATE TYPE kek_status, CREATE TABLE kek_versions, CREATE TABLE kek_rotation_log, ALTER TABLE holdout_vault ADD COLUMN kek_version
- `packages/engine/src/holdout/rotation.ts` - rotateKek, retireKek, reencryptDek, kekFingerprint, initKekVersion
- `packages/engine/src/holdout/crypto.ts` - Added unsealPayloadWithKek private helper, unsealPayloadWithFallback export; refactored unsealPayload to delegate to helper
- `packages/engine/src/holdout/index.ts` - Added export for rotation.ts
- `packages/engine/src/holdout/__tests__/rotation.test.ts` - 16 unit tests across kekFingerprint, reencryptDek, unsealPayloadWithFallback, rotateKek (mocked DB), retireKek (mocked DB)
- `packages/shared/src/db/migrations/meta/0018_snapshot.json` - Fixed duplicate UUID collision (0017 and 0018 had identical id/prevId)

## Decisions Made

- **Serial PK for kek_versions**: Integer PK allows compact FK in holdout_vault; UUID would be wasteful for a counter-like value
- **kek_rotation_log not project-scoped**: KEK rotation is a global infrastructure operation, not per-project, so the log has no projectId
- **HOLDOUT_ENCRYPTION_KEY_PREV is env var, not DB**: Avoids storing key material; operator sets env during rotation window, removes after all DEKs rotated
- **Private unsealPayloadWithKek helper**: Extracted to avoid duplicating 20 lines of decrypt logic between unsealPayload and unsealPayloadWithFallback

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Drizzle migration snapshot UUID collision in 0018**
- **Found during:** Task 1 (migration generation)
- **Issue:** `0017_snapshot.json` and `0018_snapshot.json` had identical `id` and `prevId` values causing Drizzle "pointing to a parent snapshot which is a collision" error
- **Fix:** Generated a new UUID for 0018 snapshot with prevId = 0017's id
- **Files modified:** `packages/shared/src/db/migrations/meta/0018_snapshot.json`
- **Verification:** `pnpm db:generate` completed successfully after fix
- **Committed in:** 366965a (task commit)

**2. [Rule 1 - Bug] Fixed Drizzle mock chain shape for vault rows select query**
- **Found during:** Task 2 (GREEN phase - tests failing)
- **Issue:** Mock `.select().from().where()` returned chain object (not promise); vault rows query ends with `.where()` (no `.limit()`), so mock needed `.where()` to return a resolved promise
- **Fix:** Created `makeSelectChainEndingAtWhere()` variant that makes `.where()` thenable vs `makeSelectChainWithLimit()` which ends at `.limit()`
- **Files modified:** `packages/engine/src/holdout/__tests__/rotation.test.ts`
- **Verification:** All 16 tests pass after fix
- **Committed in:** 366965a (task commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correct test execution. No scope creep.

## Issues Encountered

- Migration 0019 was not auto-applied to the test DB by `pnpm db:migrate` (Drizzle reported "Migrations complete" but the new tables weren't created). Applied the migration manually via docker exec psql to unblock integration tests. The shared integration tests (57/57) all pass after manual application.

## User Setup Required

None — no new external service configuration required. Operators who want to use KEK rotation will need to:
1. Run `initKekVersion(db, { kek: Buffer.from(process.env.HOLDOUT_ENCRYPTION_KEY, 'base64'), label: 'v1-initial' })` once to register the current KEK in `kek_versions`
2. During rotation: set `HOLDOUT_ENCRYPTION_KEY_PREV` to old key, `HOLDOUT_ENCRYPTION_KEY` to new key, call `rotateKek()`, then `retireKek()` after confirmation

## Next Phase Readiness

- Phase 28-02 (structured merge conflict resolution) can proceed independently
- KEK rotation infrastructure is ready; CLI commands to surface these operations are out of scope for this plan

## Self-Check: PASSED

Files verified:
- `packages/shared/src/db/schema/kek.ts` — FOUND
- `packages/engine/src/holdout/rotation.ts` — FOUND
- `packages/engine/src/holdout/__tests__/rotation.test.ts` — FOUND
- `packages/shared/src/db/migrations/0019_clean_lord_tyger.sql` — FOUND

Commits verified:
- `366965a` — FOUND (feat(28-01): KEK rotation infrastructure...)

---
*Phase: 28-kek-rotation-infrastructure*
*Completed: 2026-04-02*
