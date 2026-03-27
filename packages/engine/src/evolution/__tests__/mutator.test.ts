import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Seed } from '@get-cauldron/shared';

// Mock @get-cauldron/shared to avoid DATABASE_URL requirement
vi.mock('@get-cauldron/shared', () => ({
  seeds: {},
  appendEvent: vi.fn(),
}));

const makeSeed = (overrides: Partial<Seed> = {}): Seed => ({
  id: 'seed-id-1',
  projectId: 'project-id-1',
  parentId: null,
  interviewId: 'interview-id-1',
  version: 1,
  status: 'crystallized',
  goal: 'Build a CLI bulk file renaming tool',
  constraints: ['Must run on macOS'] as unknown as Seed['constraints'],
  acceptanceCriteria: ['AC-1'] as unknown as Seed['acceptanceCriteria'],
  ontologySchema: { entities: [] } as unknown as Seed['ontologySchema'],
  evaluationPrinciples: [] as unknown as Seed['evaluationPrinciples'],
  exitConditions: {} as unknown as Seed['exitConditions'],
  ambiguityScore: 0.1,
  crystallizedAt: new Date('2026-01-01'),
  createdAt: new Date('2026-01-01'),
  generation: 2,
  evolutionContext: null,
  ...overrides,
});

const makeGoalResult = (overrides = {}) => ({
  overallScore: 0.68,
  tier: 'ac_only' as const,
  dimensions: [],
  gapAnalysis: [
    { dimension: 'completeness', score: 0.6, description: 'Missing edge cases', gapId: 'abc123' },
  ],
  ...overrides,
});

describe('mutateSeed - tier ac_only', () => {
  let mockGateway: { generateObject: ReturnType<typeof vi.fn> };
  let mockDb: { insert: ReturnType<typeof vi.fn> };
  let valuesMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { appendEvent } = await import('@get-cauldron/shared');
    vi.mocked(appendEvent).mockResolvedValue(undefined as any);

    mockGateway = {
      generateObject: vi.fn(),
    };

    const returningMock = vi.fn().mockResolvedValue([
      makeSeed({ id: 'evolved-seed-id', generation: 3, version: 2 }),
    ]);
    valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
    mockDb = {
      insert: vi.fn().mockReturnValue({ values: valuesMock }),
    };
  });

  it('keeps goal and constraints unchanged for ac_only tier', async () => {
    const seed = makeSeed({ generation: 2 });
    const goalResult = makeGoalResult({ tier: 'ac_only' });

    mockGateway.generateObject.mockResolvedValueOnce({
      object: {
        acceptanceCriteria: [{ criterion: 'Updated AC-1', rationale: 'Addresses gap' }],
      },
    });

    const { mutateSeed } = await import('../mutator.js');
    const result = await mutateSeed({
      db: mockDb as any,
      gateway: mockGateway as any,
      seed,
      goalResult,
      projectId: 'project-id-1',
      seedId: 'seed-id-1',
    });

    expect(result).toBeDefined();
    const insertedValues = valuesMock.mock.calls[0]![0];
    expect(insertedValues.goal).toBe(seed.goal);
    expect(insertedValues.constraints).toBe(seed.constraints);
    expect(insertedValues.generation).toBe(3); // 2 + 1
  });

  it('populates evolutionContext with score, tier, gapAnalysis, parentSeedId', async () => {
    const seed = makeSeed({ generation: 2 });
    const goalResult = makeGoalResult({ tier: 'ac_only', overallScore: 0.68 });

    mockGateway.generateObject.mockResolvedValueOnce({
      object: { acceptanceCriteria: [] },
    });

    const { mutateSeed } = await import('../mutator.js');
    await mutateSeed({
      db: mockDb as any,
      gateway: mockGateway as any,
      seed,
      goalResult,
      projectId: 'project-id-1',
      seedId: 'seed-id-1',
    });

    const insertedValues = valuesMock.mock.calls[0]![0];
    expect(insertedValues.evolutionContext).toMatchObject({
      score: 0.68,
      tier: 'ac_only',
      parentSeedId: 'seed-id-1',
    });
  });
});

describe('mutateSeed - tier full', () => {
  let mockGateway: { generateObject: ReturnType<typeof vi.fn> };
  let mockDb: { insert: ReturnType<typeof vi.fn> };
  let valuesMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { appendEvent } = await import('@get-cauldron/shared');
    vi.mocked(appendEvent).mockResolvedValue(undefined as any);

    mockGateway = {
      generateObject: vi.fn(),
    };

    const returningMock = vi.fn().mockResolvedValue([
      makeSeed({ id: 'evolved-seed-id', generation: 3, version: 2 }),
    ]);
    valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
    mockDb = {
      insert: vi.fn().mockReturnValue({ values: valuesMock }),
    };
  });

  it('generates a completely new seed spec for full tier', async () => {
    const seed = makeSeed({ generation: 2 });
    const goalResult = makeGoalResult({ tier: 'full', overallScore: 0.3 });

    mockGateway.generateObject.mockResolvedValueOnce({
      object: {
        goal: 'Rewritten goal',
        constraints: [{ constraint: 'New constraint' }],
        acceptanceCriteria: [{ criterion: 'New AC' }],
        ontologySchema: { entities: [] },
      },
    });

    const { mutateSeed } = await import('../mutator.js');
    await mutateSeed({
      db: mockDb as any,
      gateway: mockGateway as any,
      seed,
      goalResult,
      projectId: 'project-id-1',
      seedId: 'seed-id-1',
    });

    const insertedValues = valuesMock.mock.calls[0]![0];
    expect(insertedValues.goal).toBe('Rewritten goal');
    expect(insertedValues.generation).toBe(3);
    expect(insertedValues.evolutionContext).toMatchObject({
      tier: 'full',
      parentSeedId: 'seed-id-1',
    });
  });
});

describe('mutateSeedFromProposal', () => {
  let mockDb: { insert: ReturnType<typeof vi.fn> };
  let valuesMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { appendEvent } = await import('@get-cauldron/shared');
    vi.mocked(appendEvent).mockResolvedValue(undefined as any);

    const returningMock = vi.fn().mockResolvedValue([
      makeSeed({ id: 'lateral-evolved-id', generation: 3, version: 2 }),
    ]);
    valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
    mockDb = {
      insert: vi.fn().mockReturnValue({ values: valuesMock }),
    };
  });

  it('uses proposal goal, constraints, acceptanceCriteria directly', async () => {
    const seed = makeSeed({ generation: 2 });
    const proposal = {
      persona: 'contrarian',
      goal: 'Lateral goal from contrarian',
      constraints: [{ constraint: 'Contrarian constraint' }],
      acceptanceCriteria: [{ criterion: 'Contrarian AC' }],
      rationale: 'This approach rethinks the problem',
    };

    const { mutateSeedFromProposal } = await import('../mutator.js');
    const result = await mutateSeedFromProposal({
      db: mockDb as any,
      seed,
      proposal,
      projectId: 'project-id-1',
      seedId: 'seed-id-1',
      lastScore: 0.3,
      lastGapAnalysis: [],
    });

    expect(result).toBeDefined();
    const insertedValues = valuesMock.mock.calls[0]![0];
    expect(insertedValues.goal).toBe('Lateral goal from contrarian');
    expect(insertedValues.constraints).toEqual([{ constraint: 'Contrarian constraint' }]);
    expect(insertedValues.acceptanceCriteria).toEqual([{ criterion: 'Contrarian AC' }]);
  });

  it('sets tier to full in evolutionContext', async () => {
    const seed = makeSeed({ generation: 2 });
    const proposal = {
      persona: 'simplifier',
      goal: 'Simplified goal',
      constraints: [],
      acceptanceCriteria: [],
      rationale: 'Simplify the approach',
    };

    const { mutateSeedFromProposal } = await import('../mutator.js');
    await mutateSeedFromProposal({
      db: mockDb as any,
      seed,
      proposal,
      projectId: 'project-id-1',
      seedId: 'seed-id-1',
      lastScore: 0.3,
      lastGapAnalysis: [],
    });

    const insertedValues = valuesMock.mock.calls[0]![0];
    expect(insertedValues.evolutionContext).toMatchObject({
      tier: 'full',
      score: 0.3,
      parentSeedId: 'seed-id-1',
    });
  });

  it('increments generation by 1', async () => {
    const seed = makeSeed({ generation: 2 });
    const proposal = {
      persona: 'hacker',
      goal: 'Hacker goal',
      constraints: [],
      acceptanceCriteria: [],
      rationale: 'Find a clever hack',
    };

    const { mutateSeedFromProposal } = await import('../mutator.js');
    await mutateSeedFromProposal({
      db: mockDb as any,
      seed,
      proposal,
      projectId: 'project-id-1',
      seedId: 'seed-id-1',
      lastScore: 0.3,
      lastGapAnalysis: [],
    });

    const insertedValues = valuesMock.mock.calls[0]![0];
    expect(insertedValues.generation).toBe(3); // 2 + 1
  });

  it('records persona in event payload', async () => {
    const { appendEvent } = await import('@get-cauldron/shared');
    const seed = makeSeed({ generation: 2 });
    const proposal = {
      persona: 'architect',
      goal: 'Architect goal',
      constraints: [],
      acceptanceCriteria: [],
      rationale: 'Rethink architecture',
    };

    const { mutateSeedFromProposal } = await import('../mutator.js');
    await mutateSeedFromProposal({
      db: mockDb as any,
      seed,
      proposal,
      projectId: 'project-id-1',
      seedId: 'seed-id-1',
      lastScore: 0.3,
      lastGapAnalysis: [],
    });

    expect(appendEvent).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        payload: expect.objectContaining({
          persona: 'architect',
          source: 'lateral_thinking',
        }),
      })
    );
  });
});
