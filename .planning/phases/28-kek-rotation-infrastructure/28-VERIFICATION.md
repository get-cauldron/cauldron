---
phase: 28-kek-rotation-infrastructure
verified: 2026-04-02T08:30:00Z
status: passed
score: 11/11 must-haves verified
gaps: []
human_verification:
  - test: "Run `cauldron rotate-kek --init` against a live database"
    expected: "Command registers KEK version 1, prints fingerprint prefix, exits 0"
    why_human: "Requires live Postgres + correctly seeded kek_versions table; can't verify without running Docker stack"
  - test: "Run full rotation cycle: --init, then default rotate, then --retire-old"
    expected: "Three-step sequence completes without error; kek_versions shows two rows (active + retired); kek_rotation_log shows three events"
    why_human: "End-to-end CLI behavior requires live DB and two distinct env var key values"
---

# Phase 28: KEK Rotation Infrastructure Verification Report

**Phase Goal:** A KEK compromise can be responded to by rotating to a new key and re-encrypting all DEKs, with a complete audit trail and no disruption to in-flight holdout evaluations
**Verified:** 2026-04-02T08:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | All holdout_vault DEKs can be re-encrypted under a new KEK via `rotateKek()` | VERIFIED | `rotation.ts` lines 122-154: queries vault rows where `encryptedDek IS NOT NULL`, calls `reencryptDek()` per row, updates row with new `encryptedDek` and `kekVersion` |
| 2 | DEK decryption succeeds after a round-trip re-encryption | VERIFIED | `rotation.test.ts` "round-trips correctly" test: seals payload, reencryptDek from kekA to kekB, manually decrypts with kekB and recovers original plaintext; test passes |
| 3 | Rows with null encryptedDek are skipped during rotation | VERIFIED | `rotation.ts` line 126: `where(isNotNull(holdoutVault.encryptedDek))` filters at DB query level; `rotation.test.ts` "skips rows with null encryptedDek" confirms `update` never called and `rowsRotated=0` |
| 4 | Invalid key lengths are rejected before any vault row is touched | VERIFIED | `rotation.ts` lines 79-84: both key length checks throw before any DB call; `rotation.test.ts` confirms `mockDb.select` is never called when keys are 31 or 33 bytes |
| 5 | Old KEK retirement is blocked if vault rows still reference it | VERIFIED | `rotation.ts` lines 182-191: `retireKek()` checks vault rows with matching `kekVersion`, throws "Cannot retire KEK v{N}: vault rows still reference it"; test confirms `update` and `insert` are not called |
| 6 | Dual-key unseal falls back to `HOLDOUT_ENCRYPTION_KEY_PREV` when current KEK fails | VERIFIED | `crypto.ts` lines 135-147: `unsealPayloadWithFallback` catches failure, checks `HOLDOUT_ENCRYPTION_KEY_PREV`, throws descriptive error if absent; three tests cover all three paths (current succeeds, fallback needed, no fallback) |
| 7 | Three audit log events are recorded per rotation: `rotation_started`, `rotation_completed`, `old_key_retired` | VERIFIED | `rotation.ts` lines 129-136 (`rotation_started`), 159-166 (`rotation_completed`); `retireKek` lines 203-207 (`old_key_retired`); tests verify event names in inserted log rows |
| 8 | `cauldron rotate-kek` CLI re-encrypts all vault DEKs and prints a success summary | VERIFIED | `rotate-kek.ts` runRotate mode calls `rotateKek(db, ...)` and prints "Rotating KEK: v{old} -> v{new}" + "Re-encrypted {N} vault rows in {ms}ms" |
| 9 | `cauldron rotate-kek --retire-old --old-version N` retires the old KEK version | VERIFIED | `rotate-kek.ts` runRetireOld mode calls `retireKek(db, { kekVersion })` with parsed integer |
| 10 | `cauldron rotate-kek --init` registers the current KEK as version 1 | VERIFIED | `rotate-kek.ts` runInit mode calls `initKekVersion(db, { kek, label })` and prints version + fingerprint prefix |
| 11 | The old KEK is not retired in the same invocation that introduces the new KEK | VERIFIED | `rotate-kek.ts` dispatches exactly one of three exclusive modes per invocation; `--retire-old` is a separate mode that calls `retireKek()` only; default rotation mode never calls `retireKek()` |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/shared/src/db/schema/kek.ts` | kek_versions + kek_rotation_log tables | VERIFIED | Exports `kekVersions`, `kekRotationLog`, `kekStatusEnum` with correct columns |
| `packages/shared/src/db/migrations/0019_clean_lord_tyger.sql` | Migration adding kek_versions, kek_rotation_log, kek_version column | VERIFIED | CREATE TYPE kek_status, CREATE TABLE kek_versions, CREATE TABLE kek_rotation_log, ALTER TABLE holdout_vault ADD COLUMN kek_version — all present |
| `packages/engine/src/holdout/rotation.ts` | rotateKek + retireKek functions | VERIFIED | Exports `rotateKek`, `retireKek`, `reencryptDek`, `kekFingerprint`, `initKekVersion`, `RotationResult` interface; 233 substantive lines |
| `packages/engine/src/holdout/crypto.ts` | Dual-key unseal with fallback | VERIFIED | Exports `unsealPayloadWithFallback`; private `unsealPayloadWithKek` helper extracted; `HOLDOUT_ENCRYPTION_KEY_PREV` fallback logic present |
| `packages/engine/src/holdout/__tests__/rotation.test.ts` | Unit tests for all rotation behaviors | VERIFIED | 543 lines; 16 tests across kekFingerprint, reencryptDek, unsealPayloadWithFallback, rotateKek (mocked DB), retireKek (mocked DB); all 16 pass |
| `packages/cli/src/commands/rotate-kek.ts` | CLI command for KEK rotation | VERIFIED | Exports `rotateKekCommand`; implements --init, default rotation, --retire-old modes; keys from env vars only |
| `packages/cli/src/cli.ts` | CLI registration of rotate-kek command | VERIFIED | Imports `rotateKekCommand`, `'rotate-kek'` in COMMANDS array, direct-DB dispatch block after `verify` block |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `rotation.ts` | `packages/shared/src/db/schema/kek.ts` | imports kekVersions, kekRotationLog | WIRED | Line 3: `import { holdoutVault, kekVersions, kekRotationLog } from '@get-cauldron/shared'` |
| `rotation.ts` | `packages/shared/src/db/schema/holdout.ts` | queries holdoutVault for re-encryption | WIRED | `holdoutVault` used in select/update queries in `rotateKek` and `retireKek` |
| `crypto.ts` | HOLDOUT_ENCRYPTION_KEY_PREV env var | fallback KEK for dual-key window | WIRED | `process.env['HOLDOUT_ENCRYPTION_KEY_PREV']` read in `unsealPayloadWithFallback` |
| `rotate-kek.ts` | `rotation.ts` | imports rotateKek, retireKek, initKekVersion | WIRED | Line 3: `import { rotateKek, retireKek, initKekVersion, kekFingerprint } from '@get-cauldron/engine'` |
| `cli.ts` | `rotate-kek.ts` | imports and dispatches rotateKekCommand | WIRED | Line 27: `import { rotateKekCommand }`, line 168: `await rotateKekCommand(commandArgs, flags)` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `rotation.ts rotateKek()` | `vaultRows` | `db.select().from(holdoutVault).where(isNotNull(...))` | Real DB query on holdout_vault | FLOWING |
| `rotation.ts retireKek()` | `referencingRows` | `db.select().from(holdoutVault).where(eq(...kekVersion...))` | Real DB query checking FK references | FLOWING |
| `rotation.ts rotateKek()` | `activeVersions` | `db.select().from(kekVersions).where(eq(...status, 'active'))` | Real DB query on kek_versions | FLOWING |
| `rotate-kek.ts runRotate()` | `result` | `rotateKek(db, { oldKek, newKek, newKekLabel })` | Calls real engine function with real DbClient | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Rotation tests pass | `npx vitest run src/holdout/__tests__/rotation.test.ts` (run from packages/engine) | 16/16 passed, 508ms | PASS |
| CLI command is registered | `grep -q "rotate-kek" packages/cli/src/cli.ts` | Match found in COMMANDS array + dispatch block | PASS |
| rotateKek exported from engine | `grep -q "rotateKek" packages/engine/src/holdout/index.ts` (via rotation.js re-export) | `export * from './rotation.js'` at line 8 | PASS |
| Migration file exists | `ls packages/shared/src/db/migrations/0019_*.sql` | `0019_clean_lord_tyger.sql` found | PASS |
| Pre-existing inngest test failures | `pnpm -F @get-cauldron/engine test` | 10 failures in events.test.ts — all `Cannot find package 'inngest'`; zero failures in rotation.test.ts | PASS (phase 28 clean) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SEC-01 | 28-01, 28-02 | KEK rotation infrastructure with versioned key table, audit trail, and bulk re-encryption capability | SATISFIED | kek_versions table with serial PK + status lifecycle; kek_rotation_log append-only audit (rotation_started, rotation_completed, old_key_retired); rotateKek() re-encrypts all DEKs with fingerprint verification; retireKek() guards against premature retirement; CLI operator interface complete |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No placeholder implementations, empty returns, or disconnected stubs detected in the phase 28 files. The one `continue` at `rotation.ts:142` (`if (!row.encryptedDek) continue`) is a correct null-guard post the DB-level filter, not a stub.

### Human Verification Required

#### 1. Live --init Registration

**Test:** With Docker Postgres running, set `HOLDOUT_ENCRYPTION_KEY` to a base64-encoded 32-byte key and run `cauldron rotate-kek --init`
**Expected:** Command prints "KEK version 1 registered (fingerprint: {first 16 chars}...)" and exits 0; `SELECT * FROM kek_versions` shows one row with status='active'
**Why human:** Requires live Postgres stack; kek_versions table must be freshly migrated

#### 2. Full Three-Step Rotation Cycle

**Test:** Run the three-step sequence: (1) `rotate-kek --init`, (2) export new key env var and run `rotate-kek`, (3) run `rotate-kek --retire-old --old-version 1`
**Expected:** kek_versions has two rows (active v2, retired v1); kek_rotation_log has three events; no holdout_vault rows reference v1 after rotation
**Why human:** End-to-end sequencing across CLI invocations with real DB state transitions

### Gaps Summary

No gaps. All automated checks pass. The phase delivers exactly what SEC-01 requires: versioned KEK table, append-only audit log, bulk DEK re-encryption with fingerprint verification, dual-key unseal fallback for in-flight safety, retirement guard, and a full CLI operator interface. The 16 unit tests cover every listed behavior in the plan.

The only failures visible in `pnpm test` are pre-existing inngest module missing errors in `events.test.ts` files — they are not introduced by phase 28 and have no relation to the KEK rotation infrastructure.

---

_Verified: 2026-04-02T08:30:00Z_
_Verifier: Claude (gsd-verifier)_
