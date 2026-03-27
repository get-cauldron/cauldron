import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Seed } from '@cauldron/shared';

// Mock @cauldron/shared to avoid DATABASE_URL requirement
vi.mock('@cauldron/shared', () => ({
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
  acceptanceCriteria: ['AC-1', 'AC-2'] as unknown as Seed['acceptanceCriteria'],
  ontologySchema: {} as unknown as Seed['ontologySchema'],
  evaluationPrinciples: [] as unknown as Seed['evaluationPrinciples'],
  exitConditions: {} as unknown as Seed['exitConditions'],
  ambiguityScore: 0.1,
  crystallizedAt: new Date('2026-01-01'),
  createdAt: new Date('2026-01-01'),
  generation: 0,
  evolutionContext: null,
  ...overrides,
});

describe('buildRubric', () => {
  it('returns default rubric when evaluationPrinciples is empty', async () => {
    const { buildRubric } = await import('../evaluator.js');
    const rubric = buildRubric([]);
    expect(rubric).toHaveLength(3);
    expect(rubric[0]).toMatchObject({ name: 'goal_alignment', weight: 0.4 });
    expect(rubric[1]).toMatchObject({ name: 'completeness', weight: 0.3 });
    expect(rubric[2]).toMatchObject({ name: 'quality', weight: 0.3 });
  });

  it('normalizes weights to sum to 1.0 when provided', async () => {
    const { buildRubric } = await import('../evaluator.js');
    const rubric = buildRubric([
      { name: 'usability', weight: 3, description: 'Easy to use' },
      { name: 'performance', weight: 2, description: 'Fast responses' },
    ]);
    expect(rubric).toHaveLength(2);
    const total = rubric.reduce((sum, d) => sum + d.weight, 0);
    expect(total).toBeCloseTo(1.0);
    expect(rubric[0]!.weight).toBeCloseTo(0.6);
    expect(rubric[1]!.weight).toBeCloseTo(0.4);
  });

  it('handles single dimension by assigning weight 1.0', async () => {
    const { buildRubric } = await import('../evaluator.js');
    const rubric = buildRubric([{ name: 'correctness', weight: 5, description: 'Works correctly' }]);
    expect(rubric).toHaveLength(1);
    expect(rubric[0]!.weight).toBeCloseTo(1.0);
  });
});

describe('evaluateGoalAttainment', () => {
  let mockGateway: { generateObject: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGateway = {
      generateObject: vi.fn(),
    };
  });

  it('computes weighted score correctly', async () => {
    const seed = makeSeed({
      evaluationPrinciples: [
        { name: 'usability', weight: 0.6, description: 'Easy to use' },
        { name: 'performance', weight: 0.4, description: 'Fast responses' },
      ] as unknown as Seed['evaluationPrinciples'],
    });

    mockGateway.generateObject.mockResolvedValueOnce({
      object: {
        dimensions: [
          { name: 'usability', score: 0.8, reasoning: 'Good UI', gapStatement: 'Could be more intuitive' },
          { name: 'performance', score: 0.5, reasoning: 'Slow on large files', gapStatement: 'Needs optimization' },
        ],
      },
    });

    const { evaluateGoalAttainment } = await import('../evaluator.js');
    const result = await evaluateGoalAttainment({
      gateway: mockGateway as any,
      seed,
      codeSummary: 'CLI tool code summary',
      projectId: 'project-id-1',
      evolutionCycle: 1,
      seedId: 'seed-id-1',
    });

    // 0.6*0.8 + 0.4*0.5 = 0.48 + 0.20 = 0.68
    expect(result.overallScore).toBeCloseTo(0.68);
    expect(result.tier).toBe('ac_only'); // >= 0.4 => ac_only
  });

  it('sets tier to full when overallScore < 0.4', async () => {
    const seed = makeSeed();
    mockGateway.generateObject.mockResolvedValueOnce({
      object: {
        dimensions: [
          { name: 'goal_alignment', score: 0.2, reasoning: 'Barely works', gapStatement: 'Does not meet goal' },
          { name: 'completeness', score: 0.3, reasoning: 'Missing features', gapStatement: 'Many ACs incomplete' },
          { name: 'quality', score: 0.4, reasoning: 'Poor code', gapStatement: 'Needs refactor' },
        ],
      },
    });

    const { evaluateGoalAttainment } = await import('../evaluator.js');
    const result = await evaluateGoalAttainment({
      gateway: mockGateway as any,
      seed,
      codeSummary: 'Code summary',
      projectId: 'project-id-1',
      evolutionCycle: 1,
      seedId: 'seed-id-1',
    });

    // 0.4*0.2 + 0.3*0.3 + 0.3*0.4 = 0.08 + 0.09 + 0.12 = 0.29
    expect(result.overallScore).toBeCloseTo(0.29);
    expect(result.tier).toBe('full');
  });

  it('generates gap analysis with one entry per dimension where score < 1.0', async () => {
    const seed = makeSeed();
    mockGateway.generateObject.mockResolvedValueOnce({
      object: {
        dimensions: [
          { name: 'goal_alignment', score: 1.0, reasoning: 'Perfect', gapStatement: '' },
          { name: 'completeness', score: 0.7, reasoning: 'Mostly done', gapStatement: 'Missing edge cases' },
          { name: 'quality', score: 0.9, reasoning: 'Good', gapStatement: 'Minor issues' },
        ],
      },
    });

    const { evaluateGoalAttainment } = await import('../evaluator.js');
    const result = await evaluateGoalAttainment({
      gateway: mockGateway as any,
      seed,
      codeSummary: 'Code summary',
      projectId: 'project-id-1',
      evolutionCycle: 1,
      seedId: 'seed-id-1',
    });

    // Only 2 gaps (goal_alignment = 1.0 is excluded)
    expect(result.gapAnalysis).toHaveLength(2);
    expect(result.gapAnalysis[0]!.dimension).toBe('completeness');
    expect(result.gapAnalysis[1]!.dimension).toBe('quality');
  });

  it('includes gapId as SHA-256 hash of dimension + description', async () => {
    const seed = makeSeed();
    mockGateway.generateObject.mockResolvedValueOnce({
      object: {
        dimensions: [
          { name: 'completeness', score: 0.6, reasoning: 'Some missing', gapStatement: 'Missing edge cases' },
        ],
      },
    });

    const { evaluateGoalAttainment } = await import('../evaluator.js');
    const result = await evaluateGoalAttainment({
      gateway: mockGateway as any,
      seed: makeSeed({
        evaluationPrinciples: [{ name: 'completeness', weight: 1, description: 'Complete' }] as unknown as Seed['evaluationPrinciples'],
      }),
      codeSummary: 'Code summary',
      projectId: 'project-id-1',
      evolutionCycle: 1,
      seedId: 'seed-id-1',
    });

    expect(result.gapAnalysis[0]!.gapId).toMatch(/^[0-9a-f]{64}$/);
  });

  it('calls gateway with stage: evaluation', async () => {
    const seed = makeSeed();
    mockGateway.generateObject.mockResolvedValueOnce({
      object: {
        dimensions: [
          { name: 'goal_alignment', score: 0.8, reasoning: 'Good', gapStatement: 'Minor gap' },
          { name: 'completeness', score: 0.7, reasoning: 'Mostly complete', gapStatement: 'Some gaps' },
          { name: 'quality', score: 0.9, reasoning: 'High quality', gapStatement: 'Tiny gap' },
        ],
      },
    });

    const { evaluateGoalAttainment } = await import('../evaluator.js');
    await evaluateGoalAttainment({
      gateway: mockGateway as any,
      seed,
      codeSummary: 'Code summary',
      projectId: 'project-id-1',
      evolutionCycle: 1,
      seedId: 'seed-id-1',
    });

    expect(mockGateway.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'evaluation' })
    );
  });
});
