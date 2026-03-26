import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HoldoutScenario } from '../types.js';

// Mock @cauldron/shared to avoid DATABASE_URL requirement
vi.mock('@cauldron/shared', () => ({
  holdoutVault: { name: 'holdout_vault' },
  appendEvent: vi.fn().mockResolvedValue({}),
}));

// Mock the crypto module
vi.mock('../crypto.js', () => ({
  unsealPayload: vi.fn(),
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
    status: 'sealed',
    draftScenarios: null,
    ciphertext: 'fake-ciphertext',
    encryptedDek: 'fake-dek-iv:fake-dek-auth:fake-dek-ciphertext',
    iv: 'fake-iv',
    authTag: 'fake-auth-tag',
    encryptedAt: new Date(),
    ...vaultRow,
  };

  const mockUpdate = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([defaultRow]),
  };

  const mockSelect = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([defaultRow]),
  };

  return {
    insert: vi.fn(),
    select: vi.fn().mockReturnValue(mockSelect),
    update: vi.fn().mockReturnValue(mockUpdate),
    _mockRow: defaultRow,
  };
}

function makeMockGateway(evalResults: Array<{ scenarioId: string; pass: boolean; reasoning: string; evidence: string }>) {
  return {
    generateObject: vi.fn().mockResolvedValue({
      object: { scenarioResults: evalResults },
    }),
  };
}

// --- Tests for unsealVault ---

describe('unsealVault', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('Test 1: reads sealed vault, calls unsealPayload, transitions to unsealed, emits holdouts_unsealed event', async () => {
    const { unsealPayload } = await import('../crypto.js');
    const { appendEvent } = await import('@cauldron/shared');
    vi.mocked(unsealPayload).mockReturnValue(JSON.stringify(FIVE_SCENARIOS));
    vi.mocked(appendEvent).mockResolvedValue({} as any);

    const mockDb = makeMockDb({ status: 'sealed' });

    const { unsealVault } = await import('../vault.js');
    await unsealVault(mockDb as any, { vaultId: VAULT_ID, projectId: PROJECT_ID });

    expect(unsealPayload).toHaveBeenCalledWith(expect.objectContaining({
      ciphertext: 'fake-ciphertext',
    }));

    const updateSet = mockDb.update().set.mock.calls[0][0];
    expect(updateSet.status).toBe('unsealed');
    expect(updateSet.unsealedAt).toBeInstanceOf(Date);

    expect(appendEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'holdouts_unsealed' })
    );
  });

  it('Test 2: throws if vault status is not sealed', async () => {
    const mockDb = makeMockDb({ status: 'approved' });

    const { unsealVault } = await import('../vault.js');
    await expect(
      unsealVault(mockDb as any, { vaultId: VAULT_ID, projectId: PROJECT_ID })
    ).rejects.toThrow();
  });

  it('Test 3: returns parsed HoldoutScenario[] array', async () => {
    const { unsealPayload } = await import('../crypto.js');
    vi.mocked(unsealPayload).mockReturnValue(JSON.stringify(FIVE_SCENARIOS));

    const mockDb = makeMockDb({ status: 'sealed' });

    const { unsealVault } = await import('../vault.js');
    const result = await unsealVault(mockDb as any, { vaultId: VAULT_ID, projectId: PROJECT_ID });

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(5);
    expect(result[0]!.id).toBe('00000000-0000-0000-0000-000000000001');
  });
});

// --- Tests for evaluateHoldouts ---

describe('evaluateHoldouts', () => {
  it('Test 4: calls gateway.generateObject with stage evaluation and correct schema', async () => {
    const allPassResults = FIVE_SCENARIOS.map(s => ({
      scenarioId: s.id,
      pass: true,
      reasoning: 'Implementation satisfies requirement',
      evidence: 'Code at line 42',
    }));
    const mockGateway = makeMockGateway(allPassResults);

    const { evaluateHoldouts } = await import('../evaluator.js');
    await evaluateHoldouts({
      gateway: mockGateway as any,
      scenarios: FIVE_SCENARIOS,
      codeSummary: 'function rename(files, pattern): renames files matching pattern',
      projectId: PROJECT_ID,
      seedId: SEED_ID,
    });

    expect(mockGateway.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'evaluation' })
    );
  });

  it('Test 5: evaluation prompt includes both scenario content and code summary', async () => {
    const allPassResults = FIVE_SCENARIOS.map(s => ({
      scenarioId: s.id,
      pass: true,
      reasoning: 'Passes',
      evidence: 'See code',
    }));
    const mockGateway = makeMockGateway(allPassResults);

    const { evaluateHoldouts } = await import('../evaluator.js');
    await evaluateHoldouts({
      gateway: mockGateway as any,
      scenarios: FIVE_SCENARIOS,
      codeSummary: 'UNIQUE_CODE_SUMMARY_TOKEN',
      projectId: PROJECT_ID,
      seedId: SEED_ID,
    });

    const callArg = mockGateway.generateObject.mock.calls[0][0];
    expect(callArg.prompt).toContain('UNIQUE_CODE_SUMMARY_TOKEN');
    expect(callArg.prompt).toContain('Scenario 1');
  });

  it('Test 6: returns HoldoutEvalResult with per-scenario pass/fail', async () => {
    const mixedResults = [
      { scenarioId: FIVE_SCENARIOS[0]!.id, pass: true, reasoning: 'Passes', evidence: 'Code ref' },
      { scenarioId: FIVE_SCENARIOS[1]!.id, pass: false, reasoning: 'Failed', evidence: 'No null check' },
      { scenarioId: FIVE_SCENARIOS[2]!.id, pass: true, reasoning: 'Passes', evidence: 'Code ref' },
      { scenarioId: FIVE_SCENARIOS[3]!.id, pass: true, reasoning: 'Passes', evidence: 'Code ref' },
      { scenarioId: FIVE_SCENARIOS[4]!.id, pass: true, reasoning: 'Passes', evidence: 'Code ref' },
    ];
    const mockGateway = makeMockGateway(mixedResults);

    const { evaluateHoldouts } = await import('../evaluator.js');
    const result = await evaluateHoldouts({
      gateway: mockGateway as any,
      scenarios: FIVE_SCENARIOS,
      codeSummary: 'test summary',
      projectId: PROJECT_ID,
      seedId: SEED_ID,
    });

    expect(result.scenarioResults).toHaveLength(5);
    expect(result.scenarioResults[0]!.pass).toBe(true);
    expect(result.scenarioResults[1]!.pass).toBe(false);
  });

  it('Test 7: when all scenarios pass, result.passed is true and no failureReport', async () => {
    const allPassResults = FIVE_SCENARIOS.map(s => ({
      scenarioId: s.id,
      pass: true,
      reasoning: 'All good',
      evidence: 'Code ref',
    }));
    const mockGateway = makeMockGateway(allPassResults);

    const { evaluateHoldouts } = await import('../evaluator.js');
    const result = await evaluateHoldouts({
      gateway: mockGateway as any,
      scenarios: FIVE_SCENARIOS,
      codeSummary: 'test summary',
      projectId: PROJECT_ID,
      seedId: SEED_ID,
    });

    expect(result.passed).toBe(true);
    expect(result.failureReport).toBeUndefined();
  });

  it('Test 8: when any scenario fails, result.passed is false and failureReport is populated', async () => {
    const failResults = [
      { scenarioId: FIVE_SCENARIOS[0]!.id, pass: false, reasoning: 'Missing feature', evidence: 'No code found' },
      ...FIVE_SCENARIOS.slice(1).map(s => ({
        scenarioId: s.id, pass: true, reasoning: 'OK', evidence: 'ref',
      })),
    ];
    const mockGateway = makeMockGateway(failResults);

    const { evaluateHoldouts } = await import('../evaluator.js');
    const result = await evaluateHoldouts({
      gateway: mockGateway as any,
      scenarios: FIVE_SCENARIOS,
      codeSummary: 'test summary',
      projectId: PROJECT_ID,
      seedId: SEED_ID,
    });

    expect(result.passed).toBe(false);
    expect(result.failureReport).toBeDefined();
    expect(result.failureReport!.failedScenarios).toHaveLength(1);
    expect(result.failureReport!.triggeredBy).toBe('holdout_failure');
  });
});

// --- Tests for buildFailureReport ---

describe('buildFailureReport', () => {
  it('Test 9: extracts failed scenarios into HoldoutFailureReport with triggeredBy holdout_failure', async () => {
    const { buildFailureReport } = await import('../evaluator.js');

    const evalResults = [
      { scenarioId: FIVE_SCENARIOS[0]!.id, pass: false, reasoning: 'Missing null check', evidence: 'N/A' },
      { scenarioId: FIVE_SCENARIOS[1]!.id, pass: true, reasoning: 'Passes', evidence: 'ref' },
      { scenarioId: FIVE_SCENARIOS[2]!.id, pass: false, reasoning: 'Wrong output', evidence: 'line 12' },
    ];

    const report = buildFailureReport({
      seedId: SEED_ID,
      scenarios: FIVE_SCENARIOS,
      evalResults,
      evaluationModel: 'google/gemini-2.0-flash',
    });

    expect(report.triggeredBy).toBe('holdout_failure');
    expect(report.seedId).toBe(SEED_ID);
    expect(report.failedScenarios).toHaveLength(2);
    expect(report.failedScenarios[0]!.scenarioId).toBe(FIVE_SCENARIOS[0]!.id);
    expect(report.failedScenarios[0]!.title).toBe('Scenario 1');
    expect(report.failedScenarios[0]!.category).toBe('edge_case');
    expect(report.failedScenarios[0]!.reasoning).toBe('Missing null check');
  });
});

// --- Tests for storeEvalResults ---

describe('storeEvalResults', () => {
  it('Test 10: updates vault with results JSONB, evaluatedAt, status evaluated', async () => {
    const mockDb = makeMockDb({ status: 'unsealed' });

    const evalResult = {
      passed: true,
      scenarioResults: [],
      evaluationModel: 'evaluation-stage',
      evaluatedAt: new Date(),
    };

    const { storeEvalResults } = await import('../vault.js');
    await storeEvalResults(mockDb as any, { vaultId: VAULT_ID, results: evalResult });

    const updateSet = mockDb.update().set.mock.calls[0][0];
    expect(updateSet.status).toBe('evaluated');
    expect(updateSet.results).toEqual(evalResult);
    expect(updateSet.evaluatedAt).toBeInstanceOf(Date);
  });
});
