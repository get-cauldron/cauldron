import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { sealPayload, unsealPayload } from '../crypto.js';

describe('Holdout Vault Crypto', () => {
  beforeEach(() => {
    // Provide a valid 256-bit (32-byte) base64 key for each test
    vi.stubEnv('HOLDOUT_ENCRYPTION_KEY', Buffer.from(randomBytes(32)).toString('base64'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('Test 1: sealPayload + unsealPayload round-trip returns identical JSON string', () => {
    const original = JSON.stringify({ hello: 'world', num: 42, nested: { arr: [1, 2, 3] } });
    const sealed = sealPayload(original);
    const recovered = unsealPayload(sealed);
    expect(recovered).toBe(original);
  });

  it('Test 2: sealPayload produces different ciphertext on each call (fresh IV/DEK)', () => {
    const plaintext = 'same plaintext every time';
    const sealed1 = sealPayload(plaintext);
    const sealed2 = sealPayload(plaintext);
    expect(sealed1.ciphertext).not.toBe(sealed2.ciphertext);
    expect(sealed1.iv).not.toBe(sealed2.iv);
    expect(sealed1.encryptedDek).not.toBe(sealed2.encryptedDek);
  });

  it('Test 3: sealPayload returns SealedPayload shape with all 4 required fields', () => {
    const sealed = sealPayload('test payload');
    expect(sealed).toHaveProperty('ciphertext');
    expect(sealed).toHaveProperty('iv');
    expect(sealed).toHaveProperty('authTag');
    expect(sealed).toHaveProperty('encryptedDek');
    expect(typeof sealed.ciphertext).toBe('string');
    expect(typeof sealed.iv).toBe('string');
    expect(typeof sealed.authTag).toBe('string');
    expect(typeof sealed.encryptedDek).toBe('string');
    // All fields should be non-empty
    expect(sealed.ciphertext.length).toBeGreaterThan(0);
    expect(sealed.iv.length).toBeGreaterThan(0);
    expect(sealed.authTag.length).toBeGreaterThan(0);
    expect(sealed.encryptedDek.length).toBeGreaterThan(0);
  });

  it('Test 4: unsealPayload throws with tampered ciphertext (GCM auth tag verification)', () => {
    const sealed = sealPayload('sensitive test data');
    // Tamper the ciphertext by flipping bits in the first byte
    const tamperedBuf = Buffer.from(sealed.ciphertext, 'base64');
    tamperedBuf[0] ^= 0xff;
    const tampered = { ...sealed, ciphertext: tamperedBuf.toString('base64') };
    expect(() => unsealPayload(tampered)).toThrow();
  });

  it('Test 5: unsealPayload throws with tampered authTag', () => {
    const sealed = sealPayload('sensitive test data');
    // Replace authTag with a random-but-valid-looking base64 value
    const fakeAuthTag = Buffer.from(randomBytes(16)).toString('base64');
    const tampered = { ...sealed, authTag: fakeAuthTag };
    expect(() => unsealPayload(tampered)).toThrow();
  });

  it('Test 6: getKek() throws Error with message containing HOLDOUT_ENCRYPTION_KEY when env var absent', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('HOLDOUT_ENCRYPTION_KEY', '');
    expect(() => sealPayload('test')).toThrow('HOLDOUT_ENCRYPTION_KEY');
  });

  it('Test 7: encryptedDek field is compound format containing two colon separators (dekIv:dekAuthTag:dekCiphertext)', () => {
    const sealed = sealPayload('test payload');
    const parts = sealed.encryptedDek.split(':');
    // Should be exactly 3 parts: dekIv:dekAuthTag:dekCiphertext
    expect(parts).toHaveLength(3);
    // Each part should be non-empty base64
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0);
    }
  });

  it('Test 8: sealPayload works with large payloads (10,000+ character JSON strings)', () => {
    const largeScenarios = Array.from({ length: 50 }, (_, i) => ({
      id: `scenario-${i}`,
      title: `Test scenario ${i} with a longer title to increase overall payload size substantially`,
      given: `Given a system with specific state condition number ${i} has been applied to it`,
      when: `When the user performs action number ${i} with the required parameters and context`,
      then: `Then the system should respond correctly and completely to condition ${i} as specified`,
      category: 'happy_path',
      acceptanceCriterionRef: `AC-${i}`,
      severity: 'major',
    }));
    const largePayload = JSON.stringify(largeScenarios);
    expect(largePayload.length).toBeGreaterThan(10000);

    const sealed = sealPayload(largePayload);
    const recovered = unsealPayload(sealed);
    expect(recovered).toBe(largePayload);
  });
});
