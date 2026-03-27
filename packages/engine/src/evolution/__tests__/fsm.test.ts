import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies before importing the module under test
vi.mock('@cauldron/shared', () => ({
  appendEvent: vi.fn().mockResolvedValue(undefined),
  seeds: {},
  eq: vi.fn(),
}));

vi.mock('../evaluator.js', () => ({
  evaluateGoalAttainment: vi.fn(),
}));

vi.mock('../convergence.js', () => ({
  checkConvergence: vi.fn(),
  checkStagnation: vi.fn(),
}));

vi.mock('../mutator.js', () => ({
  mutateSeed: vi.fn(),
  mutateSeedFromProposal: vi.fn(),
}));

vi.mock('../lateral-thinking.js', () => ({
  runLateralThinking: vi.fn(),
}));

vi.mock('../budget.js', () => ({
  checkLineageBudget: vi.fn(),
}));

vi.mock('../../interview/crystallizer.js', () => ({
  getSeedLineage: vi.fn(),
}));

vi.mock('../../holdout/events.js', () => ({
  inngest: {
    createFunction: vi.fn().mockReturnValue({}),
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

import { appendEvent } from '@cauldron/shared';
import { evaluateGoalAttainment } from '../evaluator.js';
import { checkConvergence, checkStagnation } from '../convergence.js';
import { mutateSeed, mutateSeedFromProposal } from '../mutator.js';
import { runLateralThinking } from '../lateral-thinking.js';
import { checkLineageBudget } from '../budget.js';
import { getSeedLineage } from '../../interview/crystallizer.js';
import { BudgetExceededError } from '../../gateway/errors.js';

import { evolutionCycleHandler, configureEvolutionDeps } from '../events.js';

const mockDb = {} as any;
const mockGateway = {} as any;

const fakeSeed = {
  id: 'seed-123',
  projectId: 'proj-456',
  generation: 2,
  goal: 'Build a file renamer',
  acceptanceCriteria: [],
  constraints: [],
  ontologySchema: {},
  evaluationPrinciples: [],
  exitConditions: {},
  interviewId: null,
  parentId: null,
  version: 1,
  status: 'crystallized' as const,
  ambiguityScore: 0.1,
  crystallizedAt: new Date(),
  createdAt: new Date(),
  evolutionContext: null,
};

const fakeStep = {
  run: vi.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn()),
  sendEvent: vi.fn().mockResolvedValue(undefined),
};

const baseEvent = {
  data: {
    seedId: 'seed-123',
    projectId: 'proj-456',
    codeSummary: 'A Node.js CLI that renames files',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  configureEvolutionDeps({ db: mockDb, gateway: mockGateway, budgetLimitCents: 10000 });

  // Default: budget check passes
  vi.mocked(checkLineageBudget).mockResolvedValue(undefined);

  // Default: load seed from DB
  vi.mocked(mockDb).select = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([fakeSeed]),
    }),
  });

  // Default: no stagnation
  vi.mocked(checkStagnation).mockReturnValue({
    type: 'stagnation',
    fired: false,
    detail: 'No stagnation',
  });

  // Default: lineage for stagnation check
  vi.mocked(getSeedLineage).mockResolvedValue([fakeSeed]);

  // Default: no convergence
  vi.mocked(checkConvergence).mockResolvedValue({ halt: false });
});

describe('evolutionCycleHandler', () => {
  it('scenario 1: goal met — score >= SUCCESS_THRESHOLD => converged status', async () => {
    vi.mocked(evaluateGoalAttainment).mockResolvedValue({
      overallScore: 0.96,
      dimensions: [],
      gapAnalysis: [],
      tier: 'ac_only',
    });

    const result = await evolutionCycleHandler({ event: baseEvent, step: fakeStep });

    expect(result.status).toBe('converged');
    expect(result.reason).toBe('goal_met');

    // Should emit evolution_goal_met
    expect(appendEvent).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ type: 'evolution_goal_met' })
    );

    // Should send evolution_converged to trigger holdout unseal
    expect(fakeStep.sendEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: 'evolution_converged' })
    );
  });

  it('scenario 2: convergence halt — checkConvergence returns halt=true => halted status', async () => {
    vi.mocked(evaluateGoalAttainment).mockResolvedValue({
      overallScore: 0.7,
      dimensions: [],
      gapAnalysis: [],
      tier: 'ac_only',
    });

    vi.mocked(checkConvergence).mockResolvedValue({
      halt: true,
      signal: { type: 'hard_cap', fired: true, detail: 'Max generations reached' },
    });

    const result = await evolutionCycleHandler({ event: baseEvent, step: fakeStep });

    expect(result.status).toBe('halted');
    expect(result.signal).toBe('hard_cap');

    // Should emit evolution_halted
    expect(appendEvent).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ type: 'evolution_halted' })
    );

    // Should send evolution_converged for holdout unseal
    expect(fakeStep.sendEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: 'evolution_converged' })
    );
  });

  it('scenario 3: normal evolution full tier — dispatches decomposition with tier=full, no previousSeedId', async () => {
    vi.mocked(evaluateGoalAttainment).mockResolvedValue({
      overallScore: 0.3,
      dimensions: [],
      gapAnalysis: [],
      tier: 'full',
    });

    const newSeed = { ...fakeSeed, id: 'new-seed-789' };
    vi.mocked(mutateSeed).mockResolvedValue(newSeed as any);

    const result = await evolutionCycleHandler({ event: baseEvent, step: fakeStep });

    expect(result.status).toBe('cycle_complete');
    expect(result.nextSeedId).toBe('new-seed-789');

    // mutateSeed called (not mutateSeedFromProposal)
    expect(mutateSeed).toHaveBeenCalled();
    expect(mutateSeedFromProposal).not.toHaveBeenCalled();

    // Decomposition event sent with tier='full' and NO previousSeedId
    expect(fakeStep.sendEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        name: 'bead.dispatch_requested',
        data: expect.objectContaining({
          seedId: 'new-seed-789',
          tier: 'full',
        }),
      })
    );

    // previousSeedId should NOT be in the dispatch event data for full tier
    const sentEvent = vi.mocked(fakeStep.sendEvent).mock.calls.find(
      call => call[1]?.name === 'bead.dispatch_requested'
    );
    expect(sentEvent?.[1]?.data?.previousSeedId).toBeUndefined();
  });

  it('scenario 4: normal evolution ac_only tier — dispatches decomposition with tier=ac_only and previousSeedId', async () => {
    vi.mocked(evaluateGoalAttainment).mockResolvedValue({
      overallScore: 0.7,
      dimensions: [],
      gapAnalysis: [],
      tier: 'ac_only',
    });

    const newSeed = { ...fakeSeed, id: 'evolved-seed-abc' };
    vi.mocked(mutateSeed).mockResolvedValue(newSeed as any);

    const result = await evolutionCycleHandler({ event: baseEvent, step: fakeStep });

    expect(result.status).toBe('cycle_complete');
    expect(result.nextSeedId).toBe('evolved-seed-abc');

    // Decomposition event sent with tier='ac_only' AND previousSeedId=original seedId (per D-08)
    expect(fakeStep.sendEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        name: 'bead.dispatch_requested',
        data: expect.objectContaining({
          seedId: 'evolved-seed-abc',
          tier: 'ac_only',
          previousSeedId: 'seed-123', // original seed ID for bead reuse per D-08
        }),
      })
    );
  });

  it('scenario 5: stagnation + lateral success => mutateSeedFromProposal called, cycle_complete', async () => {
    vi.mocked(evaluateGoalAttainment).mockResolvedValue({
      overallScore: 0.6,
      dimensions: [],
      gapAnalysis: [{ dimension: 'goal_alignment', score: 0.6, description: 'Missing X', gapId: 'abc' }],
      tier: 'ac_only',
    });

    vi.mocked(checkStagnation).mockReturnValue({
      type: 'stagnation',
      fired: true,
      detail: 'Score unchanged for 3 generations',
    });

    const lateralProposal = {
      persona: 'contrarian',
      goal: 'A radically different approach',
      constraints: [],
      acceptanceCriteria: [],
      rationale: 'Challenge assumptions',
    };
    vi.mocked(runLateralThinking).mockResolvedValue(lateralProposal);

    const lateralSeed = { ...fakeSeed, id: 'lateral-seed-xyz' };
    vi.mocked(mutateSeedFromProposal).mockResolvedValue(lateralSeed as any);

    const result = await evolutionCycleHandler({ event: baseEvent, step: fakeStep });

    expect(result.status).toBe('cycle_complete');
    expect(result.nextSeedId).toBe('lateral-seed-xyz');

    // mutateSeedFromProposal called (NOT mutateSeed) when lateral thinking succeeds
    expect(mutateSeedFromProposal).toHaveBeenCalledWith(
      expect.objectContaining({ proposal: lateralProposal })
    );
    expect(mutateSeed).not.toHaveBeenCalled();

    // Dispatched with tier='full' (lateral is always full regen)
    expect(fakeStep.sendEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        name: 'bead.dispatch_requested',
        data: expect.objectContaining({ tier: 'full' }),
      })
    );
  });

  it('scenario 6: stagnation + lateral failure => halted with reason escalated', async () => {
    vi.mocked(evaluateGoalAttainment).mockResolvedValue({
      overallScore: 0.5,
      dimensions: [],
      gapAnalysis: [],
      tier: 'ac_only',
    });

    vi.mocked(checkStagnation).mockReturnValue({
      type: 'stagnation',
      fired: true,
      detail: 'Score unchanged',
    });

    vi.mocked(runLateralThinking).mockResolvedValue(null);

    const result = await evolutionCycleHandler({ event: baseEvent, step: fakeStep });

    expect(result.status).toBe('halted');
    expect(result.reason).toBe('escalated');

    // evolution_escalated should be emitted
    expect(appendEvent).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ type: 'evolution_escalated' })
    );

    // evolution_converged should be sent for holdout unseal (D-19)
    expect(fakeStep.sendEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: 'evolution_converged' })
    );
  });

  it('scenario 7: budget exceeded => halted with reason budget_exceeded', async () => {
    vi.mocked(checkLineageBudget).mockRejectedValue(
      new BudgetExceededError('seed-123', 10000, 10500)
    );

    const result = await evolutionCycleHandler({ event: baseEvent, step: fakeStep });

    expect(result.status).toBe('halted');
    expect(result.reason).toBe('budget_exceeded');

    // evolution_halted should be emitted
    expect(appendEvent).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ type: 'evolution_halted' })
    );

    // evolution_converged should be sent
    expect(fakeStep.sendEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: 'evolution_converged' })
    );
  });
});
