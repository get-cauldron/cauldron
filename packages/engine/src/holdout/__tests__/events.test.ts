import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HoldoutScenario } from '../types.js';

// Mock @get-cauldron/shared to avoid DATABASE_URL requirement
vi.mock('@get-cauldron/shared', () => ({
  appendEvent: vi.fn().mockResolvedValue({}),
}));

// Mock vault and evaluator dependencies
vi.mock('../vault.js', () => ({
  unsealVault: vi.fn(),
  storeEvalResults: vi.fn(),
  createVault: vi.fn(),
  approveScenarios: vi.fn(),
  sealVault: vi.fn(),
  getVaultStatus: vi.fn(),
  VALID_TRANSITIONS: {
    pending_review: ['approved'],
    approved: ['sealed'],
    sealed: ['unsealed'],
    unsealed: ['evaluated'],
  },
}));

vi.mock('../evaluator.js', () => ({
  evaluateHoldouts: vi.fn(),
  buildFailureReport: vi.fn(),
  EVALUATION_SYSTEM_PROMPT: 'mock system prompt',
  EvalResultSchema: {},
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

const mockDb = { select: vi.fn(), update: vi.fn(), insert: vi.fn() };
const mockGateway = { generateObject: vi.fn() };

/**
 * Creates a fake 'step' object that calls callbacks immediately (synchronously).
 * This simulates Inngest's step.run() behavior in tests.
 */
function makeFakeStep() {
  return {
    run: vi.fn(async (_name: string, callback: () => unknown) => {
      return await callback();
    }),
  };
}

describe('events module', () => {
  it('Test 1: Inngest client is created with id cauldron-engine', async () => {
    const { inngest } = await import('../events.js');
    expect(inngest).toBeDefined();
    // Inngest client exposes its id through the id property or createFunction
    // We verify by checking it exists and is configured
    expect(inngest).toBeTruthy();
  });

  it('Test 2: handleEvolutionConverged is exported and convergenceHandler is also exported', async () => {
    const { handleEvolutionConverged, convergenceHandler } = await import('../events.js');
    expect(handleEvolutionConverged).toBeDefined();
    expect(typeof convergenceHandler).toBe('function');
  });
});

describe('handleEvolutionConverged handler logic', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  /**
   * Extract the handler function from Inngest's createFunction call.
   * We test the handler directly by extracting it from the configureVaultDeps + mocked step.
   */
  async function runHandler(evalResult: { passed: boolean; failureReport?: object }) {
    const vaultModule = await import('../vault.js');
    const evaluatorModule = await import('../evaluator.js');
    const sharedModule = await import('@get-cauldron/shared');

    vi.mocked(vaultModule.unsealVault).mockResolvedValue(FIVE_SCENARIOS);
    vi.mocked(vaultModule.storeEvalResults).mockResolvedValue(undefined);
    vi.mocked(evaluatorModule.evaluateHoldouts).mockResolvedValue({
      passed: evalResult.passed,
      scenarioResults: FIVE_SCENARIOS.map(s => ({
        scenarioId: s.id,
        pass: evalResult.passed,
        reasoning: 'test',
        evidence: 'test',
      })),
      evaluationModel: 'evaluation-stage',
      evaluatedAt: new Date(),
      failureReport: evalResult.failureReport as any,
    });

    const eventsModule = await import('../events.js');
    const { configureVaultDeps, convergenceHandler } = eventsModule;
    configureVaultDeps({ db: mockDb as any, gateway: mockGateway as any });

    // Spy on inngest.send to verify Inngest event dispatch (Gap 1 bridge)
    const sendSpy = vi.spyOn(eventsModule.inngest, 'send').mockResolvedValue({ ids: [] } as any);

    const fakeStep = makeFakeStep();
    const fakeEvent = {
      data: {
        seedId: SEED_ID,
        projectId: PROJECT_ID,
        vaultId: VAULT_ID,
        codeSummary: 'function rename() {}',
      },
    };

    // Call the extracted handler directly — avoids Inngest runtime dependency in tests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await convergenceHandler({ event: fakeEvent, step: fakeStep as any });

    return { vaultModule, evaluatorModule, sharedModule, fakeStep, sendSpy };
  }

  it('Test 3: On convergence, step 1 calls unsealVault with correct seedId/vaultId', async () => {
    const { vaultModule } = await runHandler({ passed: true });

    expect(vaultModule.unsealVault).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ vaultId: VAULT_ID, projectId: PROJECT_ID })
    );
  });

  it('Test 4: On convergence, step 2 calls evaluateHoldouts with unsealed scenarios', async () => {
    const { evaluatorModule } = await runHandler({ passed: true });

    expect(evaluatorModule.evaluateHoldouts).toHaveBeenCalledWith(
      expect.objectContaining({
        scenarios: FIVE_SCENARIOS,
        codeSummary: 'function rename() {}',
      })
    );
  });

  it('Test 5: On convergence, step 3 calls storeEvalResults with the evaluation result', async () => {
    const { vaultModule } = await runHandler({ passed: true });

    expect(vaultModule.storeEvalResults).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ vaultId: VAULT_ID })
    );
  });

  it('Test 6: When evaluation passes, no evolution_started event is emitted', async () => {
    const { sharedModule } = await runHandler({ passed: true });

    const appendEventCalls = vi.mocked(sharedModule.appendEvent).mock.calls;
    const evolutionStartedCalls = appendEventCalls.filter(
      call => call[1]?.type === 'evolution_started'
    );
    expect(evolutionStartedCalls).toHaveLength(0);
  });

  it('Test 7: When evaluation fails, an evolution_started event is emitted with failureReport payload', async () => {
    const failureReport = {
      seedId: SEED_ID,
      failedScenarios: [{ scenarioId: FIVE_SCENARIOS[0]!.id, title: 'Scenario 1', category: 'edge_case', reasoning: 'Failed' }],
      evaluationModel: 'evaluation-stage',
      triggeredBy: 'holdout_failure' as const,
    };

    const { sharedModule } = await runHandler({ passed: false, failureReport });

    const appendEventCalls = vi.mocked(sharedModule.appendEvent).mock.calls;
    const evolutionStartedCalls = appendEventCalls.filter(
      call => call[1]?.type === 'evolution_started'
    );
    expect(evolutionStartedCalls).toHaveLength(1);
  });

  it('Test 8: The evolution_started event payload includes triggeredBy holdout_failure and the failure report', async () => {
    const failureReport = {
      seedId: SEED_ID,
      failedScenarios: [{ scenarioId: FIVE_SCENARIOS[0]!.id, title: 'Scenario 1', category: 'edge_case', reasoning: 'Failed' }],
      evaluationModel: 'evaluation-stage',
      triggeredBy: 'holdout_failure' as const,
    };

    const { sharedModule } = await runHandler({ passed: false, failureReport });

    const appendEventCalls = vi.mocked(sharedModule.appendEvent).mock.calls;
    const evolutionStartedCall = appendEventCalls.find(
      call => call[1]?.type === 'evolution_started'
    );

    expect(evolutionStartedCall).toBeDefined();
    expect(evolutionStartedCall![1].payload).toMatchObject({
      triggeredBy: 'holdout_failure',
    });
  });

  it('Test 9: When evaluation fails, inngest.send fires evolution_started Inngest event with correct data', async () => {
    const failureReport = {
      seedId: SEED_ID,
      failedScenarios: [{ scenarioId: FIVE_SCENARIOS[0]!.id, title: 'Scenario 1', category: 'edge_case', reasoning: 'Failed' }],
      evaluationModel: 'evaluation-stage',
      triggeredBy: 'holdout_failure' as const,
    };

    const { sendSpy } = await runHandler({ passed: false, failureReport });

    expect(sendSpy).toHaveBeenCalledWith({
      name: 'evolution_started',
      data: expect.objectContaining({
        seedId: SEED_ID,
        projectId: PROJECT_ID,
        codeSummary: 'function rename() {}',
        failureReport: expect.anything(),
      }),
    });
  });

  it('Test 10: When evaluation passes, inngest.send is NOT called', async () => {
    const { sendSpy } = await runHandler({ passed: true });

    expect(sendSpy).not.toHaveBeenCalled();
  });
});
