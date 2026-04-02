import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { reencryptDek, kekFingerprint, rotateKek, retireKek, initKekVersion } from '../rotation.js';
import { sealPayload, unsealPayload, unsealPayloadWithFallback } from '../crypto.js';
import { kekVersions } from '@get-cauldron/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeKey32(): Buffer {
  return randomBytes(32);
}

function keyToBase64(key: Buffer): string {
  return key.toString('base64');
}

// ---------------------------------------------------------------------------
// Shared env save/restore
// ---------------------------------------------------------------------------

let savedKey: string | undefined;
let savedPrevKey: string | undefined;

beforeEach(() => {
  savedKey = process.env['HOLDOUT_ENCRYPTION_KEY'];
  savedPrevKey = process.env['HOLDOUT_ENCRYPTION_KEY_PREV'];
});

afterEach(() => {
  vi.restoreAllMocks();
  if (savedKey === undefined) {
    delete process.env['HOLDOUT_ENCRYPTION_KEY'];
  } else {
    process.env['HOLDOUT_ENCRYPTION_KEY'] = savedKey;
  }
  if (savedPrevKey === undefined) {
    delete process.env['HOLDOUT_ENCRYPTION_KEY_PREV'];
  } else {
    process.env['HOLDOUT_ENCRYPTION_KEY_PREV'] = savedPrevKey;
  }
});

// ---------------------------------------------------------------------------
// kekFingerprint
// ---------------------------------------------------------------------------

describe('kekFingerprint', () => {
  it('returns SHA-256 hex digest of the key buffer', () => {
    const buf = makeKey32();
    const expected = createHash('sha256').update(buf).digest('hex');
    expect(kekFingerprint(buf)).toBe(expected);
  });

  it('returns a 64-character hex string', () => {
    const result = kekFingerprint(makeKey32());
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });
});

// ---------------------------------------------------------------------------
// reencryptDek
// ---------------------------------------------------------------------------

describe('reencryptDek', () => {
  it('round-trips correctly — DEK can decrypt original ciphertext after re-encryption', () => {
    const kekA = makeKey32();
    process.env['HOLDOUT_ENCRYPTION_KEY'] = keyToBase64(kekA);

    const sealed = sealPayload('test data for round-trip');
    const kekB = makeKey32();

    // Re-encrypt DEK from kekA to kekB
    const newEncryptedDek = reencryptDek(sealed.encryptedDek, kekA, kekB);

    // Verify the new encryptedDek can be used to decrypt the payload manually
    const parts = newEncryptedDek.split(':');
    expect(parts).toHaveLength(3);
    const [dekIvB64, dekAuthTagB64, encDekB64] = parts;

    // Decrypt DEK using kekB
    const dekDecipher = createDecipheriv(
      'aes-256-gcm',
      kekB,
      Buffer.from(dekIvB64, 'base64')
    );
    dekDecipher.setAuthTag(Buffer.from(dekAuthTagB64, 'base64'));
    const dek = Buffer.concat([
      dekDecipher.update(Buffer.from(encDekB64, 'base64')),
      dekDecipher.final(),
    ]);

    // Decrypt payload using recovered DEK
    const payloadDecipher = createDecipheriv(
      'aes-256-gcm',
      dek,
      Buffer.from(sealed.iv, 'base64')
    );
    payloadDecipher.setAuthTag(Buffer.from(sealed.authTag, 'base64'));
    const plaintext = Buffer.concat([
      payloadDecipher.update(Buffer.from(sealed.ciphertext, 'base64')),
      payloadDecipher.final(),
    ]).toString('utf8');

    expect(plaintext).toBe('test data for round-trip');
  });

  it('throws on invalid format (not 3 colon-separated parts)', () => {
    const kekA = makeKey32();
    const kekB = makeKey32();
    expect(() => reencryptDek('not:enough', kekA, kekB)).toThrow(/Invalid encryptedDek format/);
  });

  it('throws when given wrong old KEK (GCM auth tag mismatch)', () => {
    const kekA = makeKey32();
    process.env['HOLDOUT_ENCRYPTION_KEY'] = keyToBase64(kekA);

    const sealed = sealPayload('protected payload');
    const wrongKek = makeKey32(); // not kekA
    const kekB = makeKey32();

    expect(() => reencryptDek(sealed.encryptedDek, wrongKek, kekB)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// unsealPayloadWithFallback
// ---------------------------------------------------------------------------

describe('unsealPayloadWithFallback', () => {
  it('decrypts with current KEK when no fallback needed', () => {
    const kek = makeKey32();
    process.env['HOLDOUT_ENCRYPTION_KEY'] = keyToBase64(kek);

    const sealed = sealPayload('current kek plaintext');
    const result = unsealPayloadWithFallback(sealed);
    expect(result).toBe('current kek plaintext');
  });

  it('falls back to HOLDOUT_ENCRYPTION_KEY_PREV when current KEK fails', () => {
    const kekA = makeKey32();
    process.env['HOLDOUT_ENCRYPTION_KEY'] = keyToBase64(kekA);
    const sealed = sealPayload('sealed with kekA');

    // Simulate rotation: new current key is kekB, prev is kekA
    const kekB = makeKey32();
    process.env['HOLDOUT_ENCRYPTION_KEY'] = keyToBase64(kekB);
    process.env['HOLDOUT_ENCRYPTION_KEY_PREV'] = keyToBase64(kekA);

    const result = unsealPayloadWithFallback(sealed);
    expect(result).toBe('sealed with kekA');
  });

  it('throws when no fallback available and current KEK fails', () => {
    const kekA = makeKey32();
    process.env['HOLDOUT_ENCRYPTION_KEY'] = keyToBase64(kekA);
    const sealed = sealPayload('sealed with kekA');

    // Switch to a different key and ensure no prev key
    const kekB = makeKey32();
    process.env['HOLDOUT_ENCRYPTION_KEY'] = keyToBase64(kekB);
    delete process.env['HOLDOUT_ENCRYPTION_KEY_PREV'];

    expect(() => unsealPayloadWithFallback(sealed)).toThrow(/no HOLDOUT_ENCRYPTION_KEY_PREV/);
  });
});

// ---------------------------------------------------------------------------
// rotateKek (mocked DB)
// ---------------------------------------------------------------------------

describe('rotateKek', () => {
  // Chain for queries that end with .limit() (e.g. kek_versions lookup)
  function makeSelectChainWithLimit(returnValue: unknown) {
    const chain = {
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn().mockResolvedValue(returnValue),
    };
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    return chain;
  }

  // Chain for queries that end with .where() (e.g. vault rows scan)
  function makeSelectChainEndingAtWhere(returnValue: unknown) {
    const whereResult = Promise.resolve(returnValue);
    const chain = {
      from: vi.fn(),
      where: vi.fn().mockReturnValue(whereResult),
    };
    chain.from.mockReturnValue(chain);
    return chain;
  }

  // Chain for .select({ id: ... }).from().where().limit()
  function makeSelectFieldsChainWithLimit(returnValue: unknown) {
    const chain = {
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn().mockResolvedValue(returnValue),
    };
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    return chain;
  }

  function makeInsertChain(returnValue: unknown = [{ version: 2 }]) {
    const chain = {
      values: vi.fn(),
      returning: vi.fn().mockResolvedValue(returnValue),
    };
    chain.values.mockReturnValue(chain);
    return chain;
  }

  function makeInsertNoReturn() {
    const chain = {
      values: vi.fn().mockResolvedValue(undefined),
    };
    return chain;
  }

  function makeUpdateChain() {
    const chain = {
      set: vi.fn(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    chain.set.mockReturnValue(chain);
    return chain;
  }

  it('rejects oldKek shorter than 32 bytes before any DB call', async () => {
    const mockDb = { select: vi.fn(), insert: vi.fn(), update: vi.fn() } as unknown as import('@get-cauldron/shared').DbClient;

    const shortKey = randomBytes(31);
    const validKey = makeKey32();

    await expect(
      rotateKek(mockDb, { oldKek: shortKey, newKek: validKey, newKekLabel: 'test' })
    ).rejects.toThrow(/must be 32 bytes/);

    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('rejects newKek longer than 32 bytes before any DB call', async () => {
    const mockDb = { select: vi.fn(), insert: vi.fn(), update: vi.fn() } as unknown as import('@get-cauldron/shared').DbClient;

    const validKey = makeKey32();
    const longKey = randomBytes(33);

    await expect(
      rotateKek(mockDb, { oldKek: validKey, newKek: longKey, newKekLabel: 'test' })
    ).rejects.toThrow(/must be 32 bytes/);

    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('skips rows with null encryptedDek (rowsRotated=0)', async () => {
    const oldKek = makeKey32();
    const newKek = makeKey32();
    const fingerprint = kekFingerprint(oldKek);

    // Select calls: (1) find active kek_versions (ends with .limit()), (2) get vault rows (ends with .where())
    const selectActiveKek = makeSelectChainWithLimit([{
      version: 1,
      status: 'active',
      keyFingerprint: fingerprint,
    }]);
    const selectVaultRows = makeSelectChainEndingAtWhere([
      { id: 'row1', encryptedDek: null },
      { id: 'row2', encryptedDek: null },
    ]);

    let selectCallCount = 0;
    const mockSelect = vi.fn(() => {
      selectCallCount++;
      return selectCallCount === 1 ? selectActiveKek : selectVaultRows;
    });

    // Insert calls: (1) new kek_versions row, (2) rotation_started, (3) rotation_completed
    const insertVersions = makeInsertChain([{ version: 2, keyFingerprint: kekFingerprint(newKek) }]);
    const insertLog1 = makeInsertNoReturn();
    const insertLog2 = makeInsertNoReturn();

    let insertCallCount = 0;
    const mockInsert = vi.fn(() => {
      insertCallCount++;
      if (insertCallCount === 1) return insertVersions;
      if (insertCallCount === 2) return insertLog1;
      return insertLog2;
    });

    const mockUpdate = vi.fn(() => makeUpdateChain());

    const mockDb = {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
    } as unknown as import('@get-cauldron/shared').DbClient;

    const result = await rotateKek(mockDb, { oldKek, newKek, newKekLabel: 'v2' });

    expect(result.rowsRotated).toBe(0);
    expect(result.newKekVersion).toBe(2);
    expect(result.oldKekVersion).toBe(1);
    // No updates should have been called (all rows had null encryptedDek)
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('re-encrypts all sealed rows and returns correct count', async () => {
    const oldKek = makeKey32();
    const newKek = makeKey32();
    process.env['HOLDOUT_ENCRYPTION_KEY'] = keyToBase64(oldKek);

    // Create 3 real sealed payloads so the reencryptDek can actually work
    const sealed1 = sealPayload('payload 1');
    const sealed2 = sealPayload('payload 2');
    const sealed3 = sealPayload('payload 3');

    const fingerprint = kekFingerprint(oldKek);

    const selectActiveKek = makeSelectChainWithLimit([{
      version: 1,
      status: 'active',
      keyFingerprint: fingerprint,
    }]);
    const selectVaultRows = makeSelectChainEndingAtWhere([
      { id: 'row1', encryptedDek: sealed1.encryptedDek },
      { id: 'row2', encryptedDek: sealed2.encryptedDek },
      { id: 'row3', encryptedDek: sealed3.encryptedDek },
    ]);

    let selectCallCount = 0;
    const mockSelect = vi.fn(() => {
      selectCallCount++;
      return selectCallCount === 1 ? selectActiveKek : selectVaultRows;
    });

    const insertVersions = makeInsertChain([{ version: 2, keyFingerprint: kekFingerprint(newKek) }]);
    const insertLog1 = makeInsertNoReturn();
    const insertLog2 = makeInsertNoReturn();

    let insertCallCount = 0;
    const mockInsert = vi.fn(() => {
      insertCallCount++;
      if (insertCallCount === 1) return insertVersions;
      if (insertCallCount === 2) return insertLog1;
      return insertLog2;
    });

    const updateCalls: Array<{ id: string; encryptedDek: string }> = [];
    const mockUpdate = vi.fn(() => {
      const chain = {
        set: vi.fn((data: { encryptedDek: string; kekVersion: number }) => {
          const whereChain = {
            where: vi.fn((condition: unknown) => {
              // Capture the update for later verification
              updateCalls.push({ id: 'captured', encryptedDek: data.encryptedDek });
              return Promise.resolve(undefined);
            }),
          };
          return whereChain;
        }),
      };
      return chain;
    });

    const mockDb = {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
    } as unknown as import('@get-cauldron/shared').DbClient;

    const result = await rotateKek(mockDb, { oldKek, newKek, newKekLabel: 'v2' });

    expect(result.rowsRotated).toBe(3);
    expect(result.newKekVersion).toBe(2);
    expect(mockUpdate).toHaveBeenCalledTimes(3);
  });

  it('inserts rotation_started and rotation_completed audit events with correct event names', async () => {
    const oldKek = makeKey32();
    const newKek = makeKey32();
    process.env['HOLDOUT_ENCRYPTION_KEY'] = keyToBase64(oldKek);
    const fingerprint = kekFingerprint(oldKek);

    const selectActiveKek = makeSelectChainWithLimit([{
      version: 1,
      status: 'active',
      keyFingerprint: fingerprint,
    }]);
    const selectVaultRows = makeSelectChainEndingAtWhere([]); // no rows

    let selectCallCount = 0;
    const mockSelect = vi.fn(() => {
      selectCallCount++;
      return selectCallCount === 1 ? selectActiveKek : selectVaultRows;
    });

    const insertVersions = makeInsertChain([{ version: 2 }]);
    const insertedLogs: Array<{ event: string; payload: unknown }> = [];

    const mockInsert = vi.fn((table: unknown) => {
      if (table === kekVersions) return insertVersions;
      // For kekRotationLog
      const chain = {
        values: vi.fn((data: { event: string; payload: unknown }) => {
          insertedLogs.push({ event: data.event, payload: data.payload });
          return Promise.resolve(undefined);
        }),
      };
      return chain;
    });

    const mockDb = {
      select: mockSelect,
      insert: mockInsert,
      update: vi.fn(),
    } as unknown as import('@get-cauldron/shared').DbClient;

    await rotateKek(mockDb, { oldKek, newKek, newKekLabel: 'v2' });

    const events = insertedLogs.map((l) => l.event);
    expect(events).toContain('rotation_started');
    expect(events).toContain('rotation_completed');
  });

  it('inserts new kek_versions row with correct fingerprint', async () => {
    const oldKek = makeKey32();
    const newKek = makeKey32();
    process.env['HOLDOUT_ENCRYPTION_KEY'] = keyToBase64(oldKek);
    const fingerprint = kekFingerprint(oldKek);

    const selectActiveKek = makeSelectChainWithLimit([{
      version: 1,
      status: 'active',
      keyFingerprint: fingerprint,
    }]);
    const selectVaultRows = makeSelectChainEndingAtWhere([]);

    let selectCallCount = 0;
    const mockSelect = vi.fn(() => {
      selectCallCount++;
      return selectCallCount === 1 ? selectActiveKek : selectVaultRows;
    });

    type InsertedValues = { label: string; status: string; keyFingerprint: string };
    let capturedKekInsertValues: InsertedValues | null = null;
    const mockInsert = vi.fn((table: unknown) => {
      if (table === kekVersions) {
        const chain = {
          values: vi.fn((data: InsertedValues) => {
            capturedKekInsertValues = { ...data };
            return {
              returning: vi.fn().mockResolvedValue([{ version: 2 }]),
            };
          }),
        };
        return chain;
      }
      // kekRotationLog inserts
      return { values: vi.fn().mockResolvedValue(undefined) };
    });

    const mockDb = {
      select: mockSelect,
      insert: mockInsert,
      update: vi.fn(),
    } as unknown as import('@get-cauldron/shared').DbClient;

    await rotateKek(mockDb, { oldKek, newKek, newKekLabel: 'v2-test' });

    expect(capturedKekInsertValues).not.toBeNull();
    const captured = capturedKekInsertValues as unknown as InsertedValues;
    expect(captured.keyFingerprint).toBe(kekFingerprint(newKek));
    expect(captured.label).toBe('v2-test');
    expect(captured.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// retireKek (mocked DB)
// ---------------------------------------------------------------------------

describe('retireKek', () => {
  function makeSelectChain(returnValue: unknown) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn().mockResolvedValue(returnValue),
    };
    chain['from'].mockReturnValue(chain);
    chain['where'].mockReturnValue(chain);
    return chain;
  }

  it('blocks retirement when vault rows reference the version', async () => {
    const selectChain = makeSelectChain([{ id: 'some-vault-row' }]);
    const mockDb = {
      select: vi.fn(() => selectChain),
      update: vi.fn(),
      insert: vi.fn(),
    } as unknown as import('@get-cauldron/shared').DbClient;

    await expect(retireKek(mockDb, { kekVersion: 1 })).rejects.toThrow(/Cannot retire/);
    // Should not have updated or inserted anything
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('retires and logs when no rows reference the version', async () => {
    const selectChain = makeSelectChain([]); // no rows

    const updateChain = {
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    };

    const insertedLogs: Array<{ event: string }> = [];
    const insertChain = {
      values: vi.fn((data: { event: string }) => {
        insertedLogs.push({ event: data.event });
        return Promise.resolve(undefined);
      }),
    };

    const mockDb = {
      select: vi.fn(() => selectChain),
      update: vi.fn(() => updateChain),
      insert: vi.fn(() => insertChain),
    } as unknown as import('@get-cauldron/shared').DbClient;

    await retireKek(mockDb, { kekVersion: 1 });

    expect(mockDb.update).toHaveBeenCalled();
    expect(insertedLogs.map((l) => l.event)).toContain('old_key_retired');
  });
});
