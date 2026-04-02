import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { eq, isNotNull } from 'drizzle-orm';
import { holdoutVault, kekVersions, kekRotationLog } from '@get-cauldron/shared';
import type { DbClient } from '@get-cauldron/shared';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

/**
 * Returns the SHA-256 hex digest of a key buffer.
 * Used to verify key identity without storing key material.
 */
export function kekFingerprint(kek: Buffer): string {
  return createHash('sha256').update(kek).digest('hex');
}

/**
 * Re-encrypts a compound DEK string from oldKek to newKek.
 *
 * Format: `${dekIv}:${dekAuthTag}:${dekCiphertext}` (all base64)
 * Decrypts DEK with oldKek, re-encrypts with newKek using a fresh IV.
 */
export function reencryptDek(
  encryptedDek: string,
  oldKek: Buffer,
  newKek: Buffer
): string {
  const parts = encryptedDek.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encryptedDek format: expected dekIv:dekAuthTag:dekCiphertext');
  }
  const [dekIvB64, dekAuthTagB64, encDekB64] = parts;

  // Decrypt DEK with old KEK
  const dekDecipher = createDecipheriv(ALGORITHM, oldKek, Buffer.from(dekIvB64, 'base64'));
  dekDecipher.setAuthTag(Buffer.from(dekAuthTagB64, 'base64'));
  const dek = Buffer.concat([
    dekDecipher.update(Buffer.from(encDekB64, 'base64')),
    dekDecipher.final(),
  ]);

  // Re-encrypt DEK with new KEK using fresh IV
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

/**
 * Rotates the KEK: re-encrypts all DEKs in holdout_vault from oldKek to newKek.
 *
 * Steps:
 * 1. Validates key lengths (must be exactly 32 bytes)
 * 2. Finds current active KEK version and verifies oldKek fingerprint matches
 * 3. Inserts new kek_versions row
 * 4. Records rotation_started audit event
 * 5. Re-encrypts all non-null DEKs in holdout_vault
 * 6. Records rotation_completed audit event
 */
export async function rotateKek(
  db: DbClient,
  params: { oldKek: Buffer; newKek: Buffer; newKekLabel: string }
): Promise<RotationResult> {
  const { oldKek, newKek, newKekLabel } = params;

  if (oldKek.length !== KEY_LENGTH) {
    throw new Error(`oldKek must be 32 bytes, got ${oldKek.length}`);
  }
  if (newKek.length !== KEY_LENGTH) {
    throw new Error(`newKek must be 32 bytes, got ${newKek.length}`);
  }

  // Find current active KEK version
  const activeVersions = await db
    .select()
    .from(kekVersions)
    .where(eq(kekVersions.status, 'active'))
    .limit(1);

  if (activeVersions.length === 0) {
    throw new Error('No active KEK version found. Use initKekVersion() for first-time setup.');
  }

  const activeVersion = activeVersions[0];

  // Verify oldKek fingerprint matches active version
  const providedFingerprint = kekFingerprint(oldKek);
  if (providedFingerprint !== activeVersion.keyFingerprint) {
    throw new Error(
      `oldKek fingerprint mismatch: provided ${providedFingerprint.slice(0, 8)}... does not match active version ${activeVersion.version}`
    );
  }

  const oldKekVersion = activeVersion.version;
  const startTime = Date.now();

  // Insert new KEK version
  const [newVersion] = await db
    .insert(kekVersions)
    .values({
      label: newKekLabel,
      status: 'active',
      keyFingerprint: kekFingerprint(newKek),
    })
    .returning();

  const newKekVersion = newVersion.version;

  // Get all vault rows with non-null encryptedDek
  const vaultRows = await db
    .select()
    .from(holdoutVault)
    .where(isNotNull(holdoutVault.encryptedDek));

  // Insert rotation_started audit event
  await db.insert(kekRotationLog).values({
    event: 'rotation_started',
    payload: {
      oldKekVersion,
      newKekVersion,
      totalRows: vaultRows.length,
    },
  });

  let rowsRotated = 0;

  // Re-encrypt each row's DEK
  for (const row of vaultRows) {
    if (!row.encryptedDek) continue;

    const newEncryptedDek = reencryptDek(row.encryptedDek, oldKek, newKek);
    await db
      .update(holdoutVault)
      .set({
        encryptedDek: newEncryptedDek,
        kekVersion: newKekVersion,
      })
      .where(eq(holdoutVault.id, row.id));

    rowsRotated++;
  }

  const durationMs = Date.now() - startTime;

  // Insert rotation_completed audit event
  await db.insert(kekRotationLog).values({
    event: 'rotation_completed',
    payload: {
      rowsRotated,
      newKekVersion,
      durationMs,
    },
  });

  return { rowsRotated, newKekVersion, oldKekVersion };
}

/**
 * Retires a KEK version after verifying no vault rows still reference it.
 * Blocks if any holdout_vault rows still use this KEK version.
 */
export async function retireKek(
  db: DbClient,
  params: { kekVersion: number }
): Promise<void> {
  const { kekVersion } = params;

  // Check if any vault rows still reference this KEK version
  const referencingRows = await db
    .select({ id: holdoutVault.id })
    .from(holdoutVault)
    .where(eq(holdoutVault.kekVersion, kekVersion))
    .limit(1);

  if (referencingRows.length > 0) {
    throw new Error(
      `Cannot retire KEK v${kekVersion}: vault rows still reference it`
    );
  }

  const retiredAt = new Date();

  // Update status to retired
  await db
    .update(kekVersions)
    .set({ status: 'retired', retiredAt })
    .where(eq(kekVersions.version, kekVersion));

  // Insert audit event
  await db.insert(kekRotationLog).values({
    event: 'old_key_retired',
    payload: {
      retiredKekVersion: kekVersion,
      retiredAt: retiredAt.toISOString(),
    },
  });
}

/**
 * Initializes the first KEK version. Used for first-time setup before any rotation.
 * Returns the version number assigned by the DB.
 */
export async function initKekVersion(
  db: DbClient,
  params: { kek: Buffer; label: string }
): Promise<number> {
  const { kek, label } = params;

  const [row] = await db
    .insert(kekVersions)
    .values({
      label,
      status: 'active',
      keyFingerprint: kekFingerprint(kek),
    })
    .returning();

  return row.version;
}
