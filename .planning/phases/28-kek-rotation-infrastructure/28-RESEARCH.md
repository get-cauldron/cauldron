# Phase 28: KEK Rotation Infrastructure - Research

**Researched:** 2026-04-02
**Domain:** Cryptographic key rotation, envelope encryption, dual-key window, audit trail
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — all implementation choices are at Claude's discretion.

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. The existing holdout crypto is in `packages/engine/src/holdout/crypto.ts` using AES-256-GCM envelope encryption. The vault is in `packages/engine/src/holdout/vault.ts`. KEK rotation needs a utility that re-encrypts all DEKs under a new KEK with audit trail events.

### Deferred Ideas (OUT OF SCOPE)
None — infrastructure phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-01 | KEK rotation infrastructure with versioned key table, audit trail, and bulk re-encryption capability | See Standard Stack, Architecture Patterns, and Code Examples sections |
</phase_requirements>

## Summary

The holdout vault uses AES-256-GCM envelope encryption: each vault row stores a payload encrypted with a random per-vault DEK, and the DEK is itself encrypted with the single global KEK (`HOLDOUT_ENCRYPTION_KEY`). Because the payload encryption is DEK-based, rotating the KEK does not require re-encrypting the payload ciphertext — only the `encrypted_dek` column in each vault row must be rewritten. This is the defining property that makes bulk rotation tractable.

The rotation challenge is not the cryptography — `node:crypto` already has everything needed. The challenge is safely handling in-flight evaluations. An evaluation reads `encrypted_dek`, decrypts it with the current KEK, then decrypts the payload with the DEK. If the KEK is swapped mid-flight the second read against the old `encrypted_dek` will fail authentication. The standard solution is a dual-encrypt window: re-encrypt every row under both the old KEK and the new KEK before retiring the old key. In practice for a single-operator local system the simpler approach — transaction-atomic per-row re-encryption with a `kek_version` column pointing to the current KEK — is sufficient, provided the rotation utility uses database transactions and does not commit any partial state.

The audit trail is implemented with the existing `appendEvent` infrastructure from `packages/shared/src/db/event-store.ts`. Three events are required: `kek_rotation_started`, `kek_rotation_completed`, and `kek_rotation_old_key_retired`. These require two new additions to the `event_type` Postgres enum and new enum members in the Drizzle schema. The key version table (`kek_versions`) provides the versioned-key-table requirement of SEC-01.

**Primary recommendation:** Add a `kek_versions` table to track active/retired KEKs, add a `kek_version` column to `holdout_vault`, implement a `rotateKek()` function in the holdout module that re-encrypts each vault row atomically within a transaction, emit three audit events, and expose a `cauldron rotate-kek` CLI command that reads the new key from an env var and calls the rotation function directly against the DB (bypassing tRPC — this is an admin operation).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:crypto` | built-in | AES-256-GCM encryption/decryption for DEK re-encryption | Already used by crypto.ts; no external deps per CLAUDE.md |
| `drizzle-orm` | 0.45 | Schema definition, migrations, transactional updates | Already the project ORM |
| `postgres` driver | project version | Direct DB connection for rotation utility | Same driver as shared/db/client.ts |
| `zod` | 4 | Validating new KEK input before use | Already project validation standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `chalk` | project version | CLI output formatting for rotation progress | For the `rotate-kek` CLI command |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom `kek_versions` table | Store version in env var name only | Table gives queryable audit history and a foreign key anchor; env-only loses traceability |
| Per-row transaction in a loop | Single mega-transaction for all rows | Loop is safer for large vault sets — a single massive transaction holds locks for its full duration; per-row keeps lock windows short |

**Installation:** No new packages needed. All dependencies are already installed.

## Architecture Patterns

### Recommended Project Structure
```
packages/
├── shared/src/db/
│   ├── schema/kek.ts              # new: kek_versions table
│   ├── schema/holdout.ts          # updated: add kek_version column
│   ├── migrations/0019_kek_rotation.sql  # generated migration
│   └── schema/event.ts            # updated: add 3 new event type enum values
├── engine/src/holdout/
│   ├── crypto.ts                  # updated: multi-KEK decrypt helper
│   ├── rotation.ts                # new: rotateKek() utility function
│   └── __tests__/rotation.test.ts # new: unit tests for rotation logic
└── cli/src/commands/
    └── rotate-kek.ts              # new: CLI command (no tRPC, direct DB)
```

### Pattern 1: Versioned KEK Table

**What:** A `kek_versions` table records each KEK as a row with a unique version integer, an identifier (name/label), a status (`active` | `retired`), timestamps for activated and retired, and optionally a hash fingerprint for verification without storing the raw key material. The `holdout_vault` table gains a non-null `kek_version` foreign key column (backfilled to version 1 in the migration).

**When to use:** Required any time the system needs to validate that the correct KEK is being applied during rotation and detect if an unknown key is being used.

**Schema example:**
```typescript
// packages/shared/src/db/schema/kek.ts
import { pgTable, pgEnum, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const kekStatusEnum = pgEnum('kek_status', ['active', 'retired']);

export const kekVersions = pgTable('kek_versions', {
  version: serial('version').primaryKey(),              // 1, 2, 3 ...
  label: text('label').notNull(),                       // human-readable: "v1-2026-04-02"
  status: kekStatusEnum('status').notNull().default('active'),
  activatedAt: timestamp('activated_at', { withTimezone: true }).notNull().defaultNow(),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  // SHA-256 fingerprint of the KEK bytes — allows verification without storing key material
  keyFingerprint: text('key_fingerprint').notNull(),
});
```

**kek_version column on holdout_vault:**
```typescript
// In holdout.ts schema
import { kekVersions } from './kek.js';
// ...
kekVersion: integer('kek_version').notNull().references(() => kekVersions.version),
```

### Pattern 2: Atomic Per-Row DEK Re-encryption

**What:** For each vault row in `sealed`, `unsealed`, or `evaluated` status (rows with an `encrypted_dek`), the rotation utility:
1. Decrypts the DEK using the OLD KEK (reads `encrypted_dek`)
2. Re-encrypts the DEK using the NEW KEK with a fresh IV
3. Updates `encrypted_dek` and `kek_version` in a transaction

Critically, steps 1-3 are wrapped in a Drizzle transaction so that no row is left half-rotated if the process crashes mid-run.

**Why per-row transactions (not one giant transaction):** The vault could accumulate many rows over time. A single transaction holding row-level locks on every vault row for the entire rotation duration would block concurrent evaluations. Per-row transactions are safe because the rotation utility is the only writer of `encrypted_dek` (evaluations only read it).

**Re-encryption function:**
```typescript
// packages/engine/src/holdout/rotation.ts
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { holdoutVault, kekVersions, appendEvent } from '@get-cauldron/shared';
import type { DbClient } from '@get-cauldron/shared';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Re-encrypts the DEK field of a single vault row from oldKek to newKek.
 * Runs inside a transaction — caller provides the tx.
 */
function reencryptDek(encryptedDek: string, oldKek: Buffer, newKek: Buffer): string {
  const parts = encryptedDek.split(':');
  if (parts.length !== 3) throw new Error('Invalid encryptedDek format');
  const [dekIvB64, dekAuthTagB64, encDekB64] = parts as [string, string, string];

  // Decrypt DEK with old KEK
  const dekDecipher = createDecipheriv(ALGORITHM, oldKek, Buffer.from(dekIvB64, 'base64'));
  dekDecipher.setAuthTag(Buffer.from(dekAuthTagB64, 'base64'));
  const dek = Buffer.concat([
    dekDecipher.update(Buffer.from(encDekB64, 'base64')),
    dekDecipher.final(),
  ]);

  // Re-encrypt DEK with new KEK
  const newDekIv = randomBytes(IV_LENGTH);
  const dekCipher = createCipheriv(ALGORITHM, newKek, newDekIv);
  const newEncDek = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const newDekAuthTag = dekCipher.getAuthTag();

  return [
    newDekIv.toString('base64'),
    newDekAuthTag.toString('base64'),
    newEncDek.toString('base64'),
  ].join(':');
}

export interface RotationResult {
  rowsRotated: number;
  newKekVersion: number;
  oldKekVersion: number;
}

export async function rotateKek(
  db: DbClient,
  params: {
    oldKek: Buffer;
    newKek: Buffer;
    newKekLabel: string;
    projectId: string;  // for audit event scoping
  }
): Promise<RotationResult> {
  // ... (see Code Examples section for full implementation)
}
```

### Pattern 3: Three-Event Audit Trail

**What:** Three events emitted to the existing event store during rotation:
- `kek_rotation_started` — payload: `{ oldKekVersion, newKekVersion, totalRows }`
- `kek_rotation_completed` — payload: `{ rowsRotated, newKekVersion, durationMs }`
- `kek_rotation_old_key_retired` — payload: `{ retiredKekVersion, retiredAt }`

**When to use:** Always — these provide the audit trail required by SEC-01.

**Constraint:** These three event types must be added to the `event_type` Postgres enum and the Drizzle `eventTypeEnum` in `schema/event.ts`.

**Critical ordering for old key retirement:** Per the success criteria, the old KEK must NOT be retired in the same deployment that introduces the new KEK. This means `kek_rotation_old_key_retired` is emitted in a separate CLI invocation (e.g., `cauldron rotate-kek --retire-old`) after confirming all in-flight evaluations have completed. The `kek_versions` table `status` column tracks this — the row remains `active` until explicitly retired.

### Pattern 4: Dual-Encrypt Window (in-flight safety)

**What:** When rotation runs, the new `encrypted_dek` is written per-row using the new KEK. The old KEK is NOT removed from environment until all in-flight evaluations that began before rotation completed have finished.

**Practical implementation:** The `unsealPayload` function currently reads the KEK from a single env var. To support the dual-key window, `unsealPayload` (or a wrapper) must be able to try the active KEK first, then fall back to the previous KEK if decryption fails authentication. This is implemented by reading two env vars: `HOLDOUT_ENCRYPTION_KEY` (current) and `HOLDOUT_ENCRYPTION_KEY_PREV` (previous, unset after retirement).

**Why GCM authentication makes this safe:** AES-256-GCM will throw on auth tag mismatch — there is no ambiguity about which key encrypted a given DEK. The fallback only triggers on a genuine auth failure, not silently.

**Alternative (simpler, also valid):** Use `kek_version` on the vault row to route decryption to the correct key from a key-by-version map. The rotation utility ensures that after rotation, all rows point to the new version. Before retirement is confirmed, both env vars remain set.

### Anti-Patterns to Avoid
- **Dual-encrypt the payload:** Only `encrypted_dek` needs re-encryption — the payload ciphertext is DEK-encrypted and unchanged by KEK rotation. Re-encrypting the payload wastes compute and risks mistakes.
- **Single mega-transaction for all vault rows:** Holds locks for the entire rotation duration, blocking concurrent evaluations.
- **Removing the old KEK env var on the same deploy as introducing the new one:** In-flight evaluations that read the old `encrypted_dek` before the rotation row update will fail. Old key must remain until rotation is confirmed complete.
- **Storing the raw KEK in the `kek_versions` table:** Only a fingerprint (SHA-256 of the key material) belongs there. The actual key lives exclusively in env vars.
- **Skipping null checks on encrypted_dek:** `pending_review` and `approved` vault rows have null `encrypted_dek` — the rotation utility must skip those rows (they have no DEK to re-encrypt).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AES-256-GCM encrypt/decrypt | Custom crypto | `node:crypto` createCipheriv/createDecipheriv | Already used throughout crypto.ts; GCM provides authentication |
| Key fingerprinting for verification | Custom hash | `node:crypto` createHash('sha256') | Standard; no external dep |
| Event ordering/dedup | Custom sequencing | Existing `appendEvent` | Already handles sequence retry with 23505 detection |
| DB transactions | Manual lock/unlock | Drizzle `db.transaction()` | Already used in other engine code |

**Key insight:** The envelope encryption design was chosen specifically so DEK re-encryption is the only operation required for KEK rotation. Never re-encrypt the payload — that defeats the purpose of the envelope pattern.

## Common Pitfalls

### Pitfall 1: Rotating rows that have no DEK
**What goes wrong:** Querying all `holdout_vault` rows and attempting `encryptedDek.split(':')` on null — throws at runtime.
**Why it happens:** Only `sealed`, `unsealed`, and `evaluated` rows have a non-null `encrypted_dek`. `pending_review` and `approved` rows have no payload encryption yet.
**How to avoid:** Filter with `isNotNull(holdoutVault.encryptedDek)` in the Drizzle query before iterating.
**Warning signs:** Null-reference errors during rotation on a project with in-progress holdout review.

### Pitfall 2: Old KEK retired before rotation confirmed complete
**What goes wrong:** A vault row is read by an in-flight evaluation using the old `encrypted_dek`, the old KEK has been removed from env, decryption throws — evaluation crashes.
**Why it happens:** The rotation utility wrote the new `encrypted_dek` per row, but an evaluation that started before its row was updated is still reading the old field.
**How to avoid:** Do not remove `HOLDOUT_ENCRYPTION_KEY_PREV` until all rows show `kek_version = newVersion`. The `rotate-kek --retire-old` subcommand queries `kek_version` counts to confirm before emitting `kek_rotation_old_key_retired`.
**Warning signs:** `kek_rotation_old_key_retired` emitted while some vault rows still have `kek_version = oldVersion`.

### Pitfall 3: Enum migration requires ALTER TYPE before data
**What goes wrong:** Adding new values to a Postgres enum (`kek_rotation_started` etc.) in the same migration that uses those values fails because enum changes are DDL and may not be visible in the same transaction in PostgreSQL.
**Why it happens:** PostgreSQL requires `ALTER TYPE ... ADD VALUE` to complete before the enum value is referenced in DML or constraints.
**How to avoid:** The migration must contain `ALTER TYPE event_type ADD VALUE 'kek_rotation_started'` etc. BEFORE any inserts that use those values. Drizzle `generate` handles this correctly when the enum values are added in `schema/event.ts` and `pnpm db:generate` is re-run.
**Warning signs:** Migration fails with "invalid input value for enum event_type".

### Pitfall 4: `appendEvent` projectId requirement
**What goes wrong:** The rotation utility is a global operation (not project-scoped), but `appendEvent` requires a `projectId` for sequence numbering. Using `null` or undefined causes the sequence uniqueness constraint to fail.
**Why it happens:** The events table design is project-scoped. SEC-01 needs audit events that are global/system-level.
**How to avoid:** Two options — (a) use a dedicated system project ID (e.g., a well-known UUID) for rotation events, or (b) log to a separate `kek_rotation_log` table that doesn't use the project-scoped event store. Option (b) is cleaner for system-level operations and avoids cluttering any project's event stream with infrastructure events.
**Warning signs:** Foreign key violation on events insert if projectId doesn't exist, or sequence collision if null is used.

### Pitfall 5: Verifying the new KEK fingerprint before rotation
**What goes wrong:** Rotation proceeds with a wrong/truncated new key, producing DEKs encrypted with an invalid key. All subsequent decryptions fail.
**Why it happens:** Base64-decoded key is not 32 bytes (256 bits). A short key causes AES to throw at cipher creation time, but only during rotation — not when reading the env var.
**How to avoid:** Assert `Buffer.byteLength(newKek) === 32` at the start of `rotateKek()` before touching any vault rows.
**Warning signs:** `createCipheriv: invalid key length` error immediately.

## Code Examples

### Full rotateKek() implementation
```typescript
// packages/engine/src/holdout/rotation.ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { eq, isNotNull } from 'drizzle-orm';
import { holdoutVault, kekVersions } from '@get-cauldron/shared';
import type { DbClient } from '@get-cauldron/shared';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

export interface RotationResult {
  rowsRotated: number;
  newKekVersion: number;
  oldKekVersion: number;
}

function kekFingerprint(kek: Buffer): string {
  return createHash('sha256').update(kek).digest('hex');
}

function reencryptDek(encryptedDek: string, oldKek: Buffer, newKek: Buffer): string {
  const parts = encryptedDek.split(':');
  if (parts.length !== 3) throw new Error('Invalid encryptedDek format: expected dekIv:dekAuthTag:dekCiphertext');
  const [dekIvB64, dekAuthTagB64, encDekB64] = parts as [string, string, string];

  const dekDecipher = createDecipheriv(ALGORITHM, oldKek, Buffer.from(dekIvB64, 'base64'));
  dekDecipher.setAuthTag(Buffer.from(dekAuthTagB64, 'base64'));
  const dek = Buffer.concat([
    dekDecipher.update(Buffer.from(encDekB64, 'base64')),
    dekDecipher.final(),
  ]);

  const newDekIv = randomBytes(IV_LENGTH);
  const dekCipher = createCipheriv(ALGORITHM, newKek, newDekIv);
  const newEncDek = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const newDekAuthTag = dekCipher.getAuthTag();

  return [
    newDekIv.toString('base64'),
    newDekAuthTag.toString('base64'),
    newEncDek.toString('base64'),
  ].join(':');
}

export async function rotateKek(
  db: DbClient,
  params: { oldKek: Buffer; newKek: Buffer; newKekLabel: string }
): Promise<RotationResult> {
  if (Buffer.byteLength(params.oldKek) !== KEY_LENGTH) throw new Error('oldKek must be 32 bytes');
  if (Buffer.byteLength(params.newKek) !== KEY_LENGTH) throw new Error('newKek must be 32 bytes');

  // 1. Find current active KEK version
  const [activeKek] = await db
    .select()
    .from(kekVersions)
    .where(eq(kekVersions.status, 'active'))
    .limit(1);
  if (!activeKek) throw new Error('No active KEK version found — run kek init first');

  // 2. Register new KEK version (inactive until rotation completes)
  const [newKekRow] = await db
    .insert(kekVersions)
    .values({
      label: params.newKekLabel,
      status: 'active',  // becomes active immediately — old remains non-retired
      keyFingerprint: kekFingerprint(params.newKek),
    })
    .returning();
  const newVersion = newKekRow!.version;
  const oldVersion = activeKek.version;

  // 3. Re-encrypt all vault rows that have an encryptedDek
  const rows = await db
    .select({ id: holdoutVault.id, encryptedDek: holdoutVault.encryptedDek })
    .from(holdoutVault)
    .where(isNotNull(holdoutVault.encryptedDek));

  let rowsRotated = 0;
  for (const row of rows) {
    const newEncryptedDek = reencryptDek(row.encryptedDek!, params.oldKek, params.newKek);
    await db.transaction(async (tx) => {
      await tx
        .update(holdoutVault)
        .set({ encryptedDek: newEncryptedDek, kekVersion: newVersion })
        .where(eq(holdoutVault.id, row.id));
    });
    rowsRotated++;
  }

  return { rowsRotated, newKekVersion: newVersion, oldKekVersion: oldVersion };
}
```

### Retiring the old KEK
```typescript
export async function retireKek(
  db: DbClient,
  params: { kekVersion: number }
): Promise<void> {
  // Verify no vault rows still point to the old version
  const stale = await db
    .select({ id: holdoutVault.id })
    .from(holdoutVault)
    .where(eq(holdoutVault.kekVersion, params.kekVersion))
    .limit(1);
  if (stale.length > 0) {
    throw new Error(`Cannot retire KEK v${params.kekVersion}: vault rows still reference it`);
  }

  await db
    .update(kekVersions)
    .set({ status: 'retired', retiredAt: new Date() })
    .where(eq(kekVersions.version, params.kekVersion));
}
```

### Audit log table pattern (instead of project-scoped events)
```typescript
// packages/shared/src/db/schema/kek.ts (addition)
export const kekRotationLog = pgTable('kek_rotation_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  event: text('event').notNull(),   // 'rotation_started' | 'rotation_completed' | 'old_key_retired'
  payload: jsonb('payload').notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### CLI command structure
```typescript
// packages/cli/src/commands/rotate-kek.ts
// Does NOT use tRPC — direct DB connection (admin operation)
// Usage:
//   cauldron rotate-kek --new-key-env HOLDOUT_ENCRYPTION_KEY_NEW [--label v2-2026-04-02]
//   cauldron rotate-kek --retire-old --old-version 1
export async function rotateKekCommand(args: string[], flags: { json: boolean }): Promise<void> {
  // reads new key from env var (never from CLI arg — keys must not appear in shell history)
  // calls rotateKek() from engine/holdout/rotation.ts
  // logs progress and final RotationResult
}
```

### Dual-key unseal helper (for in-flight window)
```typescript
// Addition to crypto.ts — tries current KEK first, falls back to previous
export function unsealPayloadWithFallback(sealed: SealedPayload): string {
  try {
    return unsealPayload(sealed);
  } catch {
    const prevRaw = process.env['HOLDOUT_ENCRYPTION_KEY_PREV'];
    if (!prevRaw) throw new Error('Decryption failed and no HOLDOUT_ENCRYPTION_KEY_PREV available');
    const prevKek = Buffer.from(prevRaw, 'base64');
    // Try again with previous KEK (for rows not yet rotated)
    return unsealPayloadWithKek(sealed, prevKek);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single KEK, no rotation path | Versioned KEK table with rotation utility | This phase | Enables incident response to KEK compromise |
| Payload-level encryption (re-encrypt everything on key change) | Envelope encryption (only re-encrypt DEK) | Already in place (Phase ~6) | Makes bulk rotation O(n rows) not O(n * payload size) |

**Deprecated/outdated:**
- `getKek()` reading a single env var without version awareness: after this phase, `unsealPayload` must be able to accept an explicit KEK (for multi-version support in the dual-key window). The simplest approach is adding an optional `kek?: Buffer` parameter to `unsealPayload` without breaking existing callers.

## Open Questions

1. **Where to write audit events — project-scoped events table or dedicated kek_rotation_log?**
   - What we know: `appendEvent` requires a `projectId`. Rotation is system-level, not project-scoped.
   - What's unclear: Whether the success criteria means the standard event store or simply "persistent, queryable log."
   - Recommendation: Use a dedicated `kek_rotation_log` table (simpler schema, no projectId constraint, system-level scope). This is preferable to shoehorning rotation events into the project event store.

2. **How many vault rows exist in a typical deployment — does per-row transaction overhead matter?**
   - What we know: Each project has at most one vault per seed; number of projects is typically small (single-operator local tool).
   - What's unclear: Nothing — scale is not a concern for this tool.
   - Recommendation: Per-row transactions are fine. No batching needed.

3. **Should `cauldron rotate-kek` connect to DB directly or via tRPC?**
   - What we know: Other admin operations like `verify` bypass tRPC. Rotation requires raw DB access, not the web server.
   - Recommendation: Direct DB connection using `ensureMigrations` + `db` from `@get-cauldron/shared`. The `verify` command (no tRPC bootstrap) is the precedent.

## Environment Availability

Step 2.6: SKIPPED — This phase is purely code/schema/migration changes using already-installed dependencies. PostgreSQL (via Docker) is the only external dependency and is already available per CLAUDE.md infrastructure setup.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 |
| Config file | `packages/engine/vitest.config.ts` |
| Quick run command | `pnpm -F @get-cauldron/engine test -- src/holdout/__tests__/rotation.test.ts` |
| Full suite command | `pnpm -F @get-cauldron/engine test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-01 | `reencryptDek` decrypts DEK with old KEK and re-encrypts with new KEK correctly | unit | `pnpm -F @get-cauldron/engine test -- --grep "reencryptDek"` | ❌ Wave 0 |
| SEC-01 | `rotateKek` skips rows with null `encryptedDek` | unit | `pnpm -F @get-cauldron/engine test -- --grep "skips null encryptedDek"` | ❌ Wave 0 |
| SEC-01 | `rotateKek` asserts 32-byte key constraint | unit | `pnpm -F @get-cauldron/engine test -- --grep "key length validation"` | ❌ Wave 0 |
| SEC-01 | `retireKek` throws if vault rows still reference old version | unit | `pnpm -F @get-cauldron/engine test -- --grep "retireKek blocks"` | ❌ Wave 0 |
| SEC-01 | `unsealPayloadWithFallback` falls back to prev KEK when current fails | unit | `pnpm -F @get-cauldron/engine test -- --grep "fallback decrypt"` | ❌ Wave 0 |
| SEC-01 | Three audit log events created in correct order | unit | `pnpm -F @get-cauldron/engine test -- --grep "audit log"` | ❌ Wave 0 |
| SEC-01 | DEK decryption succeeds after round-trip re-encryption | unit | `pnpm -F @get-cauldron/engine test -- --grep "round-trip"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm -F @get-cauldron/engine test -- src/holdout/__tests__/rotation.test.ts`
- **Per wave merge:** `pnpm -F @get-cauldron/engine test && pnpm -F @get-cauldron/shared test && pnpm typecheck`
- **Phase gate:** Full suite green + `pnpm build` before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/engine/src/holdout/__tests__/rotation.test.ts` — all SEC-01 unit tests above
- [ ] No framework install gap — Vitest already configured

## Sources

### Primary (HIGH confidence)
- Direct code reading: `packages/engine/src/holdout/crypto.ts` — existing DEK/KEK implementation
- Direct code reading: `packages/engine/src/holdout/vault.ts` — vault lifecycle and DB patterns
- Direct code reading: `packages/shared/src/db/schema/holdout.ts` — schema structure
- Direct code reading: `packages/shared/src/db/schema/event.ts` — event type enum pattern
- Direct code reading: `packages/shared/src/db/event-store.ts` — appendEvent implementation
- Direct code reading: `packages/cli/src/cli.ts` — CLI command registration pattern
- `node:crypto` documentation — built-in Node.js module; no external source needed

### Secondary (MEDIUM confidence)
- Standard envelope encryption / key rotation design pattern (well-established cryptographic practice — KEK rotation without payload re-encryption is the canonical approach)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies already in the project; no new libraries
- Architecture: HIGH — grounded in reading the actual crypto.ts, vault.ts, schema, and CLI code
- Pitfalls: HIGH — derived from reading actual code constraints (null DEK rows, enum migration, appendEvent projectId requirement)

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable stack, no fast-moving dependencies)
