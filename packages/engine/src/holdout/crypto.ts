import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { SealedPayload } from './types.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96-bit IV is GCM standard
const KEY_LENGTH = 32;  // 256-bit

/**
 * Reads HOLDOUT_ENCRYPTION_KEY from process.env and returns it as a Buffer.
 * Throws if the key is absent or empty.
 * NEVER exported — internal only. NEVER log or return the key value.
 */
function getKek(): Buffer {
  const raw = process.env['HOLDOUT_ENCRYPTION_KEY'];
  if (!raw) {
    throw new Error('HOLDOUT_ENCRYPTION_KEY is required for vault operations');
  }
  return Buffer.from(raw, 'base64');
}

/**
 * Seals a plaintext string using AES-256-GCM envelope encryption (DEK/KEK).
 *
 * Process:
 * 1. Generate a random 256-bit DEK and 96-bit IV
 * 2. Encrypt plaintext with DEK
 * 3. Encrypt the DEK itself with the KEK (from HOLDOUT_ENCRYPTION_KEY)
 * 4. Return all fields as base64 strings; encryptedDek is a compound string
 *    `${dekIv}:${dekAuthTag}:${dekCiphertext}` to avoid extra DB columns
 *
 * Each call produces fresh DEK + IV guaranteeing ciphertext uniqueness.
 */
export function sealPayload(plaintext: string): SealedPayload {
  const kek = getKek();

  // Generate fresh DEK and IV for payload encryption
  const dek = randomBytes(KEY_LENGTH);
  const iv = randomBytes(IV_LENGTH);

  // Encrypt the plaintext with the DEK
  const cipher = createCipheriv(ALGORITHM, dek, iv);
  const encryptedPayload = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Encrypt the DEK with the KEK using a fresh IV
  const dekIv = randomBytes(IV_LENGTH);
  const dekCipher = createCipheriv(ALGORITHM, kek, dekIv);
  const encDek = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const dekAuthTag = dekCipher.getAuthTag();

  // Compound DEK field: dekIv:dekAuthTag:dekCiphertext (all base64)
  // This avoids needing separate dek_iv and dek_auth_tag columns (see pitfall 5)
  const encryptedDek = [
    dekIv.toString('base64'),
    dekAuthTag.toString('base64'),
    encDek.toString('base64'),
  ].join(':');

  return {
    ciphertext: encryptedPayload.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    encryptedDek,
  };
}

/**
 * Internal helper: unseals a SealedPayload using an explicitly provided KEK buffer.
 * Avoids duplicating decrypt logic across unsealPayload and unsealPayloadWithFallback.
 * NEVER exported — internal only.
 */
function unsealPayloadWithKek(sealed: SealedPayload, kek: Buffer): string {
  // Parse compound DEK string: dekIv:dekAuthTag:dekCiphertext
  const parts = sealed.encryptedDek.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encryptedDek format: expected dekIv:dekAuthTag:dekCiphertext');
  }
  const [dekIvB64, dekAuthTagB64, encDekB64] = parts;

  // Decrypt the DEK using KEK (GCM will throw if auth tag mismatches)
  const dekDecipher = createDecipheriv(
    ALGORITHM,
    kek,
    Buffer.from(dekIvB64, 'base64')
  );
  dekDecipher.setAuthTag(Buffer.from(dekAuthTagB64, 'base64'));
  const dek = Buffer.concat([
    dekDecipher.update(Buffer.from(encDekB64, 'base64')),
    dekDecipher.final(),
  ]);

  // Decrypt the payload using the recovered DEK (GCM will throw if auth tag mismatches)
  const decipher = createDecipheriv(
    ALGORITHM,
    dek,
    Buffer.from(sealed.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(sealed.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Unseals a SealedPayload back to plaintext using AES-256-GCM envelope decryption.
 *
 * Process:
 * 1. Get KEK from HOLDOUT_ENCRYPTION_KEY
 * 2. Parse compound encryptedDek to recover dekIv, dekAuthTag, dekCiphertext
 * 3. Decrypt the DEK with KEK + GCM auth tag verification
 * 4. Decrypt ciphertext with DEK + GCM auth tag verification
 *
 * Throws if KEK is absent, auth tags don't match (tampered data), or parsing fails.
 */
export function unsealPayload(sealed: SealedPayload): string {
  return unsealPayloadWithKek(sealed, getKek());
}

/**
 * Unseals a SealedPayload with dual-key fallback for safe KEK rotation windows.
 *
 * Attempts decryption with the current HOLDOUT_ENCRYPTION_KEY first.
 * If that fails (e.g. payload was encrypted with the previous KEK), falls back
 * to HOLDOUT_ENCRYPTION_KEY_PREV if set.
 *
 * Use this instead of unsealPayload during and immediately after a KEK rotation
 * to ensure in-flight evaluations succeed even if their DEKs have not been
 * re-encrypted yet.
 *
 * Throws if both keys fail or if fallback is needed but HOLDOUT_ENCRYPTION_KEY_PREV is unset.
 */
export function unsealPayloadWithFallback(sealed: SealedPayload): string {
  try {
    return unsealPayloadWithKek(sealed, getKek());
  } catch {
    const prevRaw = process.env['HOLDOUT_ENCRYPTION_KEY_PREV'];
    if (!prevRaw) {
      throw new Error(
        'Decryption failed and no HOLDOUT_ENCRYPTION_KEY_PREV available for fallback'
      );
    }
    return unsealPayloadWithKek(sealed, Buffer.from(prevRaw, 'base64'));
  }
}
