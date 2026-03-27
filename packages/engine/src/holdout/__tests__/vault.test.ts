import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HoldoutScenario } from '../types.js';
import {
  createVault,
  approveScenarios,
  rejectScenarios,
  sealVault,
  getVaultStatus,
} from '../vault.js';

// Mock @get-cauldron/shared to avoid DATABASE_URL requirement
vi.mock('@get-cauldron/shared', () => ({
  holdoutVault: { name: 'holdout_vault' },
  appendEvent: vi.fn().mockResolvedValue({}),
}));

// Mock the crypto module to avoid HOLDOUT_ENCRYPTION_KEY requirement
vi.mock('../crypto.js', () => ({
  sealPayload: vi.fn().mockReturnValue({
    ciphertext: 'fake-ciphertext',
    iv: 'fake-iv',
    authTag: 'fake-auth-tag',
    encryptedDek: 'fake-dek-iv:fake-dek-auth:fake-dek-ciphertext',
  }),
}));

const makeScenario = (id: string, n: number): HoldoutScenario => ({
  id,
  title: `Scenario ${n}`,
  given: `Given state ${n}`,
  when: `When action ${n}`,
  then: `Then result ${n}`,
  category: 'edge_case',
  acceptanceCriterionRef: 'AC-1',
  severity: 'major',
});

const FIVE_SCENARIOS: HoldoutScenario[] = [
  makeScenario('00000000-0000-0000-0000-000000000001', 1),
  makeScenario('00000000-0000-0000-0000-000000000002', 2),
  makeScenario('00000000-0000-0000-0000-000000000003', 3),
  makeScenario('00000000-0000-0000-0000-000000000004', 4),
  makeScenario('00000000-0000-0000-0000-000000000005', 5),
];

const VAULT_ID = 'vault-uuid-1';
const SEED_ID = 'seed-uuid-1';
const PROJECT_ID = 'project-uuid-1';

function makeMockDb(vaultRow: Record<string, unknown> = {}) {
  const defaultRow = {
    id: VAULT_ID,
    seedId: SEED_ID,
    status: 'pending_review',
    draftScenarios: FIVE_SCENARIOS.map(s => ({ ...s, _approved: false })),
    ciphertext: null,
    encryptedDek: null,
    iv: null,
    authTag: null,
    encryptedAt: null,
    ...vaultRow,
  };

  const mockUpdate = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([defaultRow]),
  };

  const mockInsert = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([defaultRow]),
  };

  const mockSelect = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([defaultRow]),
  };

  return {
    insert: vi.fn().mockReturnValue(mockInsert),
    select: vi.fn().mockReturnValue(mockSelect),
    update: vi.fn().mockReturnValue(mockUpdate),
    _mockRow: defaultRow,
  };
}

describe('createVault', () => {
  it('Test 1: inserts holdout_vault row with status pending_review and draft_scenarios JSONB', async () => {
    const mockDb = makeMockDb();
    const vaultId = await createVault(mockDb as any, {
      seedId: SEED_ID,
      scenarios: FIVE_SCENARIOS,
    });

    expect(mockDb.insert).toHaveBeenCalled();
    const insertArg = (mockDb.insert.mock.calls[0][0] as any);
    expect(insertArg).toBeDefined();

    // Verify values were called with correct status
    const valuesArg = mockDb.insert().values.mock.calls[0][0];
    expect(valuesArg.status).toBe('pending_review');
    expect(valuesArg.draftScenarios).toBeDefined();

    expect(vaultId).toBe(VAULT_ID);
  });
});

describe('approveScenarios', () => {
  it('Test 2: transitions status from pending_review to approved', async () => {
    const draftWithAnnotations = FIVE_SCENARIOS.map(s => ({ ...s, _approved: false }));
    const mockDb = makeMockDb({ draftScenarios: draftWithAnnotations });

    const result = await approveScenarios(mockDb as any, {
      vaultId: VAULT_ID,
      approvedIds: 'all',
    });

    expect(result.approved).toBe(5);
    // update should have been called with status 'approved'
    const updateSet = mockDb.update().set.mock.calls[0][0];
    expect(updateSet.status).toBe('approved');
  });

  it('Test 3: rejects approval if fewer than 5 scenarios approved', async () => {
    const onlyThree = FIVE_SCENARIOS.slice(0, 3).map(s => ({ ...s, _approved: false }));
    const mockDb = makeMockDb({ draftScenarios: onlyThree });

    await expect(
      approveScenarios(mockDb as any, {
        vaultId: VAULT_ID,
        approvedIds: 'all',
      })
    ).rejects.toThrow('Minimum 5 approved scenarios required');
  });
});

describe('rejectScenarios', () => {
  it('Test 4: returns rejected scenario IDs without changing vault status', async () => {
    const mockDb = makeMockDb();

    const result = await rejectScenarios(mockDb as any, {
      vaultId: VAULT_ID,
      rejectedIds: ['00000000-0000-0000-0000-000000000001'],
      reasons: ['Missing null check'],
    });

    // Should NOT call update (status unchanged)
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(result.rejectedIds).toEqual(['00000000-0000-0000-0000-000000000001']);
    expect(result.reasons).toEqual(['Missing null check']);
  });
});

describe('sealVault', () => {
  it('Test 5: transitions from approved to sealed, encrypts via sealPayload, stores columns, nulls draft_scenarios', async () => {
    const approvedScenarios = FIVE_SCENARIOS.map(s => ({ ...s, _approved: true }));
    const mockDb = makeMockDb({
      status: 'approved',
      draftScenarios: approvedScenarios,
    });

    await sealVault(mockDb as any, {
      vaultId: VAULT_ID,
      projectId: PROJECT_ID,
    });

    // Should have called update with encrypted columns
    const updateSet = mockDb.update().set.mock.calls[0][0];
    expect(updateSet.ciphertext).toBe('fake-ciphertext');
    expect(updateSet.iv).toBe('fake-iv');
    expect(updateSet.authTag).toBe('fake-auth-tag');
    expect(updateSet.encryptedDek).toContain('fake-dek');
    expect(updateSet.status).toBe('sealed');
    expect(updateSet.draftScenarios).toBeNull();
    expect(updateSet.encryptedAt).toBeInstanceOf(Date);
  });

  it('Test 6: rejects sealing if status is not "approved"', async () => {
    const mockDb = makeMockDb({ status: 'pending_review' });

    await expect(
      sealVault(mockDb as any, { vaultId: VAULT_ID, projectId: PROJECT_ID })
    ).rejects.toThrow();
  });

  it('Test 7: rejects sealing if fewer than 5 approved scenarios', async () => {
    const onlyThreeApproved = FIVE_SCENARIOS.slice(0, 3).map(s => ({ ...s, _approved: true }));
    const mockDb = makeMockDb({ status: 'approved', draftScenarios: onlyThreeApproved });

    await expect(
      sealVault(mockDb as any, { vaultId: VAULT_ID, projectId: PROJECT_ID })
    ).rejects.toThrow('Minimum 5');
  });

  it('Test 8: appends holdouts_sealed event via appendEvent', async () => {
    const { appendEvent } = await import('@get-cauldron/shared');
    vi.mocked(appendEvent).mockClear();

    const approvedScenarios = FIVE_SCENARIOS.map(s => ({ ...s, _approved: true }));
    const mockDb = makeMockDb({
      status: 'approved',
      draftScenarios: approvedScenarios,
    });

    await sealVault(mockDb as any, {
      vaultId: VAULT_ID,
      projectId: PROJECT_ID,
    });

    expect(appendEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'holdouts_sealed' })
    );
  });
});

describe('getVaultStatus', () => {
  it('Test 9: returns current status, scenario count, and sealed state', async () => {
    const draftScenarios = FIVE_SCENARIOS.map(s => ({ ...s, _approved: true }));
    const mockDb = makeMockDb({ status: 'approved', draftScenarios });

    const result = await getVaultStatus(mockDb as any, VAULT_ID);

    expect(result.status).toBe('approved');
    expect(result.scenarioCount).toBe(5);
    expect(result.isSealed).toBe(false);
  });

  it('Test 10: invalid state machine transitions are rejected (pending_review -> sealed)', async () => {
    const approvedScenarios = FIVE_SCENARIOS.map(s => ({ ...s, _approved: true }));
    const mockDb = makeMockDb({ status: 'pending_review', draftScenarios: approvedScenarios });

    // sealVault from pending_review should fail (must be approved first)
    await expect(
      sealVault(mockDb as any, { vaultId: VAULT_ID, projectId: PROJECT_ID })
    ).rejects.toThrow();
  });
});
