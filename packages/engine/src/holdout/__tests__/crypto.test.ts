import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import { randomBytes } from 'node:crypto';

// Import after env is set up in beforeEach (module may cache getKek result)
let sealPayload: (plaintext: string) => import('../types.js').SealedPayload;
let unsealPayload: (sealed: import('../types.js').SealedPayload) => string;

describe('Holdout Vault Crypto', () => {
  beforeEach(async () => {
    // Provide a valid 256-bit (32-byte) base64 key for each test
    vi.stubEnv('HOLDOUT_ENCRYPTION_KEY', Buffer.from(randomBytes(32)).toString('base64'));
    // Re-import module fresh to pick up env var (vitest re-executes module-level code per import in unit tests)
    const mod = await import('../crypto.js?t=' + Date.now().toString());
    sealPayload = mod.sealPayload;
    unsealPayload = mod.unsealPayload;
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
    // Tamper the ciphertext by flipping a byte
    const tamperedCiphertext = Buffer.from(sealed.ciphertext, 'base64');
    tamperedCiphertext[0] ^= 0xff;
    const tampered = { ...sealed, ciphertext: tamperedCiphertext.toString('base64') };
    expect(() => unsealPayload(tampered)).toThrow();
  });

  it('Test 5: unsealPayload throws with tampered authTag', () => {
    const sealed = sealPayload('sensitive test data');
    // Replace authTag with a different valid-looking base64 value
    const fakeAuthTag = Buffer.from(randomBytes(16)).toString('base64');
    const tampered = { ...sealed, authTag: fakeAuthTag };
    expect(() => unsealPayload(tampered)).toThrow();
  });

  it('Test 6: getKek() throws Error with message containing HOLDOUT_ENCRYPTION_KEY when env var absent', async () => {
    vi.unstubAllEnvs();
    // Stub with empty string to simulate absent key
    vi.stubEnv('HOLDOUT_ENCRYPTION_KEY', '');
    const freshMod = await import('../crypto.js?t=' + (Date.now() + 1).toString());
    expect(() => freshMod.sealPayload('test')).toThrow('HOLDOUT_ENCRYPTION_KEY');
  });

  it('Test 7: encryptedDek field is compound format containing two colon separators', () => {
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
      title: `Test scenario ${i} with a longer title to increase size`,
      given: `Given a system with state condition ${i} applied`,
      when: `When user performs action number ${i} with parameters`,
      then: `Then the system should respond correctly to condition ${i}`,
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
