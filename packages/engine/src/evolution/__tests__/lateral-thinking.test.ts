import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Seed } from '@get-cauldron/shared';
import type { GapAnalysis } from '../types.js';

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
  constraints: [] as unknown as Seed['constraints'],
  acceptanceCriteria: ['rename files', 'support regex patterns'] as unknown as Seed['acceptanceCriteria'],
  ontologySchema: {} as unknown as Seed['ontologySchema'],
  evaluationPrinciples: [] as unknown as Seed['evaluationPrinciples'],
  exitConditions: {} as unknown as Seed['exitConditions'],
  ambiguityScore: 0.1,
  crystallizedAt: new Date('2026-01-01'),
  createdAt: new Date('2026-01-01'),
  generation: 2,
  evolutionContext: null,
  ...overrides,
});

const makeGapAnalysis = (): GapAnalysis[] => [
  {
    dimension: 'completeness',
    score: 0.5,
    description: 'Missing regex support for complex patterns',
    gapId: 'abc123',
  },
  {
    dimension: 'quality',
    score: 0.6,
    description: 'Error handling insufficient',
    gapId: 'def456',
  },
];

describe('PERSONAS', () => {
  it('exports exactly 5 persona names', async () => {
    const { PERSONAS } = await import('../lateral-thinking.js');
    expect(PERSONAS).toHaveLength(5);
    expect(PERSONAS).toContain('contrarian');
    expect(PERSONAS).toContain('hacker');
    expect(PERSONAS).toContain('occam');
    expect(PERSONAS).toContain('henry-wu');
    expect(PERSONAS).toContain('heist-o-tron');
  });
});

describe('generatePersonaProposal', () => {
  let mockGateway: { generateObject: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGateway = {
      generateObject: vi.fn(),
    };
  });

  it('calls gateway.generateObject at stage evaluation', async () => {
    mockGateway.generateObject.mockResolvedValueOnce({
      object: {
        goal: 'Rethink the whole approach',
        constraints: [{ constraint: 'Keep it simple' }],
        acceptanceCriteria: [{ criterion: 'All tests pass' }],
        rationale: 'The current approach is fundamentally flawed',
      },
    });

    const { generatePersonaProposal } = await import('../lateral-thinking.js');
    await generatePersonaProposal({
      gateway: mockGateway as any,
      persona: 'contrarian',
      seed: makeSeed(),
      gapAnalysis: makeGapAnalysis(),
      projectId: 'project-id-1',
      seedId: 'seed-id-1',
    });

    expect(mockGateway.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'evaluation' })
    );
  });

  it('includes the persona name in the returned proposal', async () => {
    mockGateway.generateObject.mockResolvedValueOnce({
      object: {
        goal: 'Hacked solution',
        constraints: [{ constraint: 'Minimal complexity' }],
        acceptanceCriteria: [{ criterion: 'Works fast' }],
        rationale: 'Shortest path to solution',
      },
    });

    const { generatePersonaProposal } = await import('../lateral-thinking.js');
    const proposal = await generatePersonaProposal({
      gateway: mockGateway as any,
      persona: 'hacker',
      seed: makeSeed(),
      gapAnalysis: makeGapAnalysis(),
      projectId: 'project-id-1',
      seedId: 'seed-id-1',
    });

    expect(proposal.persona).toBe('hacker');
    expect(proposal.goal).toBe('Hacked solution');
    expect(proposal.rationale).toBe('Shortest path to solution');
  });

  it('each persona uses a distinct prompt referencing its role', async () => {
    const callPrompts: string[] = [];
    mockGateway.generateObject.mockImplementation((opts: any) => {
      callPrompts.push(opts.system ?? opts.prompt ?? '');
      return Promise.resolve({
        object: {
          goal: `${opts.system}-goal`,
          constraints: [{ constraint: 'c' }],
          acceptanceCriteria: [{ criterion: 'ac' }],
          rationale: 'r',
        },
      });
    });

    const { generatePersonaProposal, PERSONAS } = await import('../lateral-thinking.js');
    for (const persona of PERSONAS) {
      await generatePersonaProposal({
        gateway: mockGateway as any,
        persona,
        seed: makeSeed(),
        gapAnalysis: makeGapAnalysis(),
        projectId: 'project-id-1',
        seedId: 'seed-id-1',
      });
    }

    // All 5 prompts should be distinct
    const uniquePrompts = new Set(callPrompts);
    expect(uniquePrompts.size).toBe(5);
  });
});

describe('metaJudgeSelect', () => {
  let mockGateway: { generateObject: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGateway = {
      generateObject: vi.fn(),
    };
  });

  it('returns null when meta-judge says viable: false', async () => {
    mockGateway.generateObject.mockResolvedValueOnce({
      object: {
        selectedPersona: null,
        mergedProposal: null,
        reasoning: 'None of the proposals are viable',
        viable: false,
      },
    });

    const { metaJudgeSelect } = await import('../lateral-thinking.js');
    const result = await metaJudgeSelect({
      gateway: mockGateway as any,
      proposals: [
        { persona: 'contrarian', goal: 'g1', constraints: [], acceptanceCriteria: [], rationale: 'r1' },
        { persona: 'hacker', goal: 'g2', constraints: [], acceptanceCriteria: [], rationale: 'r2' },
        { persona: 'occam', goal: 'g3', constraints: [], acceptanceCriteria: [], rationale: 'r3' },
        { persona: 'henry-wu', goal: 'g4', constraints: [], acceptanceCriteria: [], rationale: 'r4' },
        { persona: 'heist-o-tron', goal: 'g5', constraints: [], acceptanceCriteria: [], rationale: 'r5' },
      ],
      originalSeed: makeSeed(),
      projectId: 'project-id-1',
      seedId: 'seed-id-1',
    });

    expect(result).toBeNull();
  });

  it('returns a LateralThinkingProposal when meta-judge selects a viable proposal', async () => {
    mockGateway.generateObject.mockResolvedValueOnce({
      object: {
        selectedPersona: 'heist-o-tron',
        mergedProposal: {
          goal: 'Rethink the structural decomposition',
          constraints: [{ constraint: 'Keep boundaries clean' }],
          acceptanceCriteria: [{ criterion: 'Modules are independent' }],
          rationale: 'The architecture needs rethinking',
        },
        reasoning: 'Heist-o-tron proposal addresses the root cause',
        viable: true,
      },
    });

    const { metaJudgeSelect } = await import('../lateral-thinking.js');
    const result = await metaJudgeSelect({
      gateway: mockGateway as any,
      proposals: [
        { persona: 'contrarian', goal: 'g1', constraints: [], acceptanceCriteria: [], rationale: 'r1' },
        { persona: 'hacker', goal: 'g2', constraints: [], acceptanceCriteria: [], rationale: 'r2' },
        { persona: 'occam', goal: 'g3', constraints: [], acceptanceCriteria: [], rationale: 'r3' },
        { persona: 'henry-wu', goal: 'g4', constraints: [], acceptanceCriteria: [], rationale: 'r4' },
        { persona: 'heist-o-tron', goal: 'g5', constraints: [], acceptanceCriteria: [], rationale: 'r5' },
      ],
      originalSeed: makeSeed(),
      projectId: 'project-id-1',
      seedId: 'seed-id-1',
    });

    expect(result).not.toBeNull();
    expect(result!.goal).toBe('Rethink the structural decomposition');
    expect(result!.persona).toBe('heist-o-tron');
    expect(result!.rationale).toBe('The architecture needs rethinking');
  });

  it('passes all 5 proposal labels to the meta-judge prompt', async () => {
    mockGateway.generateObject.mockResolvedValueOnce({
      object: {
        selectedPersona: 'hacker',
        mergedProposal: {
          goal: 'Fast path',
          constraints: [{ constraint: 'Minimal code' }],
          acceptanceCriteria: [{ criterion: 'Works' }],
          rationale: 'Pragmatic',
        },
        reasoning: 'Best option',
        viable: true,
      },
    });

    const { metaJudgeSelect } = await import('../lateral-thinking.js');
    const proposals = [
      { persona: 'contrarian', goal: 'g1', constraints: [], acceptanceCriteria: [], rationale: 'r1' },
      { persona: 'hacker', goal: 'g2', constraints: [], acceptanceCriteria: [], rationale: 'r2' },
      { persona: 'occam', goal: 'g3', constraints: [], acceptanceCriteria: [], rationale: 'r3' },
      { persona: 'henry-wu', goal: 'g4', constraints: [], acceptanceCriteria: [], rationale: 'r4' },
      { persona: 'heist-o-tron', goal: 'g5', constraints: [], acceptanceCriteria: [], rationale: 'r5' },
    ];

    await metaJudgeSelect({
      gateway: mockGateway as any,
      proposals,
      originalSeed: makeSeed(),
      projectId: 'project-id-1',
      seedId: 'seed-id-1',
    });

    const callArgs = mockGateway.generateObject.mock.calls[0]![0];
    // Prompt should contain all 5 persona labels
    const prompt = callArgs.prompt as string;
    expect(prompt).toContain('contrarian');
    expect(prompt).toContain('hacker');
    expect(prompt).toContain('occam');
    expect(prompt).toContain('henry-wu');
    expect(prompt).toContain('heist-o-tron');
  });

  it('calls gateway at stage evaluation', async () => {
    mockGateway.generateObject.mockResolvedValueOnce({
      object: {
        selectedPersona: 'occam',
        mergedProposal: {
          goal: 'Simple',
          constraints: [{ constraint: 'Less is more' }],
          acceptanceCriteria: [{ criterion: 'Minimal' }],
          rationale: 'Simplest',
        },
        reasoning: 'Best for the user',
        viable: true,
      },
    });

    const { metaJudgeSelect } = await import('../lateral-thinking.js');
    await metaJudgeSelect({
      gateway: mockGateway as any,
      proposals: [
        { persona: 'contrarian', goal: 'g1', constraints: [], acceptanceCriteria: [], rationale: 'r1' },
        { persona: 'hacker', goal: 'g2', constraints: [], acceptanceCriteria: [], rationale: 'r2' },
        { persona: 'occam', goal: 'g3', constraints: [], acceptanceCriteria: [], rationale: 'r3' },
        { persona: 'henry-wu', goal: 'g4', constraints: [], acceptanceCriteria: [], rationale: 'r4' },
        { persona: 'heist-o-tron', goal: 'g5', constraints: [], acceptanceCriteria: [], rationale: 'r5' },
      ],
      originalSeed: makeSeed(),
      projectId: 'project-id-1',
      seedId: 'seed-id-1',
    });

    expect(mockGateway.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'evaluation' })
    );
  });
});

describe('runLateralThinking', () => {
  let mockGateway: { generateObject: ReturnType<typeof vi.fn> };
  let mockStep: { run: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGateway = {
      generateObject: vi.fn(),
    };
    // step.run calls the callback directly (same pattern as holdout/events tests)
    mockStep = {
      run: vi.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn()),
    };
  });

  it('runs all 5 personas in parallel via step.run', async () => {
    // Mock persona responses
    mockGateway.generateObject
      .mockResolvedValueOnce({ object: { goal: 'contrarian-goal', constraints: [{ constraint: 'c1' }], acceptanceCriteria: [{ criterion: 'ac1' }], rationale: 'r1' } })
      .mockResolvedValueOnce({ object: { goal: 'hacker-goal', constraints: [{ constraint: 'c2' }], acceptanceCriteria: [{ criterion: 'ac2' }], rationale: 'r2' } })
      .mockResolvedValueOnce({ object: { goal: 'occam-goal', constraints: [{ constraint: 'c3' }], acceptanceCriteria: [{ criterion: 'ac3' }], rationale: 'r3' } })
      .mockResolvedValueOnce({ object: { goal: 'henry-wu-goal', constraints: [{ constraint: 'c4' }], acceptanceCriteria: [{ criterion: 'ac4' }], rationale: 'r4' } })
      .mockResolvedValueOnce({ object: { goal: 'heist-o-tron-goal', constraints: [{ constraint: 'c5' }], acceptanceCriteria: [{ criterion: 'ac5' }], rationale: 'r5' } })
      // meta-judge
      .mockResolvedValueOnce({
        object: {
          selectedPersona: 'hacker',
          mergedProposal: { goal: 'hacker-goal', constraints: [{ constraint: 'c2' }], acceptanceCriteria: [{ criterion: 'ac2' }], rationale: 'r2' },
          reasoning: 'Hacker wins',
          viable: true,
        },
      });

    const { runLateralThinking } = await import('../lateral-thinking.js');
    await runLateralThinking({
      step: mockStep as any,
      gateway: mockGateway as any,
      seed: makeSeed(),
      gapAnalysis: makeGapAnalysis(),
      projectId: 'project-id-1',
      seedId: 'seed-id-1',
    });

    // 5 persona calls + 1 meta-judge call = 6 total step.run invocations
    expect(mockStep.run).toHaveBeenCalledTimes(6);
    // Check that each persona was called with its named step
    expect(mockStep.run).toHaveBeenCalledWith('lateral-thinking-contrarian', expect.any(Function));
    expect(mockStep.run).toHaveBeenCalledWith('lateral-thinking-hacker', expect.any(Function));
    expect(mockStep.run).toHaveBeenCalledWith('lateral-thinking-occam', expect.any(Function));
    expect(mockStep.run).toHaveBeenCalledWith('lateral-thinking-henry-wu', expect.any(Function));
    expect(mockStep.run).toHaveBeenCalledWith('lateral-thinking-heist-o-tron', expect.any(Function));
    expect(mockStep.run).toHaveBeenCalledWith('lateral-thinking-meta-judge', expect.any(Function));
  });

  it('returns null when meta-judge finds no viable proposal', async () => {
    mockGateway.generateObject
      .mockResolvedValueOnce({ object: { goal: 'g1', constraints: [{ constraint: 'c' }], acceptanceCriteria: [{ criterion: 'ac' }], rationale: 'r' } })
      .mockResolvedValueOnce({ object: { goal: 'g2', constraints: [{ constraint: 'c' }], acceptanceCriteria: [{ criterion: 'ac' }], rationale: 'r' } })
      .mockResolvedValueOnce({ object: { goal: 'g3', constraints: [{ constraint: 'c' }], acceptanceCriteria: [{ criterion: 'ac' }], rationale: 'r' } })
      .mockResolvedValueOnce({ object: { goal: 'g4', constraints: [{ constraint: 'c' }], acceptanceCriteria: [{ criterion: 'ac' }], rationale: 'r' } })
      .mockResolvedValueOnce({ object: { goal: 'g5', constraints: [{ constraint: 'c' }], acceptanceCriteria: [{ criterion: 'ac' }], rationale: 'r' } })
      .mockResolvedValueOnce({
        object: {
          selectedPersona: null,
          mergedProposal: null,
          reasoning: 'No viable option found',
          viable: false,
        },
      });

    const { runLateralThinking } = await import('../lateral-thinking.js');
    const result = await runLateralThinking({
      step: mockStep as any,
      gateway: mockGateway as any,
      seed: makeSeed(),
      gapAnalysis: makeGapAnalysis(),
      projectId: 'project-id-1',
      seedId: 'seed-id-1',
    });

    expect(result).toBeNull();
  });

  it('returns a LateralThinkingProposal on success', async () => {
    mockGateway.generateObject
      .mockResolvedValueOnce({ object: { goal: 'g1', constraints: [{ constraint: 'c' }], acceptanceCriteria: [{ criterion: 'ac' }], rationale: 'r' } })
      .mockResolvedValueOnce({ object: { goal: 'g2', constraints: [{ constraint: 'c' }], acceptanceCriteria: [{ criterion: 'ac' }], rationale: 'r' } })
      .mockResolvedValueOnce({ object: { goal: 'g3', constraints: [{ constraint: 'c' }], acceptanceCriteria: [{ criterion: 'ac' }], rationale: 'r' } })
      .mockResolvedValueOnce({ object: { goal: 'g4', constraints: [{ constraint: 'c' }], acceptanceCriteria: [{ criterion: 'ac' }], rationale: 'r' } })
      .mockResolvedValueOnce({ object: { goal: 'g5', constraints: [{ constraint: 'c' }], acceptanceCriteria: [{ criterion: 'ac' }], rationale: 'r' } })
      .mockResolvedValueOnce({
        object: {
          selectedPersona: 'henry-wu',
          mergedProposal: {
            goal: 'Use proven library pattern',
            constraints: [{ constraint: 'Use existing library' }],
            acceptanceCriteria: [{ criterion: 'Library tests pass' }],
            rationale: 'Proven approach minimizes risk',
          },
          reasoning: 'Henry Wu proposal best fits the gap',
          viable: true,
        },
      });

    const { runLateralThinking } = await import('../lateral-thinking.js');
    const result = await runLateralThinking({
      step: mockStep as any,
      gateway: mockGateway as any,
      seed: makeSeed(),
      gapAnalysis: makeGapAnalysis(),
      projectId: 'project-id-1',
      seedId: 'seed-id-1',
    });

    expect(result).not.toBeNull();
    expect(result!.persona).toBe('henry-wu');
    expect(result!.goal).toBe('Use proven library pattern');
    expect(result!.rationale).toBe('Proven approach minimizes risk');
  });
});
