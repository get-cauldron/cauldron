import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @get-cauldron/shared to prevent DATABASE_URL error at import time
vi.mock('@get-cauldron/shared', () => ({
  seeds: {},
  llmUsage: {},
}));

// Mock embeddings module
vi.mock('../embeddings.js', () => ({
  computeEmbedding: vi.fn(),
  cosineSimilarity: vi.fn(),
  jaccardSimilarity: vi.fn(),
}));

// Mock crystallizer
vi.mock('../../interview/crystallizer.js', () => ({
  getSeedLineage: vi.fn(),
}));

import {
  checkHardCap,
  checkStagnation,
  checkOntologyStability,
  checkOscillation,
  checkRepetitiveFeedback,
  checkConvergence,
} from '../convergence.js';
import { computeEmbedding, cosineSimilarity, jaccardSimilarity } from '../embeddings.js';
import { getSeedLineage } from '../../interview/crystallizer.js';
import type { Seed } from '@get-cauldron/shared';
import type { GapAnalysis, EvolutionContext } from '../types.js';

type EmbeddingFn = (text: string) => Promise<number[]>;

const mockComputeEmbedding = computeEmbedding as unknown as ReturnType<typeof vi.fn> & EmbeddingFn;
const mockCosineSimilarity = cosineSimilarity as ReturnType<typeof vi.fn>;
const mockJaccardSimilarity = jaccardSimilarity as ReturnType<typeof vi.fn>;
const mockGetSeedLineage = getSeedLineage as ReturnType<typeof vi.fn>;

function makeSeed(overrides: Partial<Seed> = {}): Seed {
  return {
    id: 'seed-1',
    projectId: 'proj-1',
    parentId: null,
    interviewId: null,
    version: 1,
    status: 'crystallized',
    goal: 'test goal',
    constraints: [],
    acceptanceCriteria: ['AC1', 'AC2'],
    ontologySchema: {},
    evaluationPrinciples: [],
    exitConditions: {},
    ambiguityScore: null,
    crystallizedAt: new Date(),
    createdAt: new Date(),
    generation: 0,
    evolutionContext: null,
    ...overrides,
  };
}

function makeSeedWithScore(id: string, score: number, generation = 0): Seed {
  const ec: EvolutionContext = {
    score,
    tier: 'full',
    gapAnalysis: [],
    parentSeedId: 'root',
  };
  return makeSeed({ id, generation, evolutionContext: ec });
}

describe('checkHardCap', () => {
  it('fires at generation 30', () => {
    const result = checkHardCap(30);
    expect(result.fired).toBe(true);
    expect(result.type).toBe('hard_cap');
  });

  it('does not fire at generation 29', () => {
    const result = checkHardCap(29);
    expect(result.fired).toBe(false);
  });

  it('does not fire at generation 0', () => {
    const result = checkHardCap(0);
    expect(result.fired).toBe(false);
  });

  it('fires at generation 31', () => {
    const result = checkHardCap(31);
    expect(result.fired).toBe(true);
  });
});

describe('checkStagnation', () => {
  it('fires when 3 consecutive seeds have the same score', () => {
    const lineage = [
      makeSeedWithScore('s1', 0.65),
      makeSeedWithScore('s2', 0.65),
      makeSeedWithScore('s3', 0.65),
    ];
    const result = checkStagnation(lineage);
    expect(result.fired).toBe(true);
    expect(result.type).toBe('stagnation');
  });

  it('does not fire with 2 same + 1 different score', () => {
    const lineage = [
      makeSeedWithScore('s1', 0.70),
      makeSeedWithScore('s2', 0.65),
      makeSeedWithScore('s3', 0.65),
    ];
    const result = checkStagnation(lineage);
    expect(result.fired).toBe(false);
  });

  it('does not fire with fewer than 3 seeds', () => {
    const lineage = [
      makeSeedWithScore('s1', 0.65),
      makeSeedWithScore('s2', 0.65),
    ];
    const result = checkStagnation(lineage);
    expect(result.fired).toBe(false);
  });

  it('does not fire with empty lineage', () => {
    const result = checkStagnation([]);
    expect(result.fired).toBe(false);
  });
});

describe('checkOntologyStability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fires when Jaccard >= 0.95 AND cosine >= 0.95', async () => {
    mockComputeEmbedding.mockResolvedValue([1, 0, 0]);
    mockJaccardSimilarity.mockReturnValue(0.96);
    mockCosineSimilarity.mockReturnValue(0.97);

    const current = makeSeed({ id: 'c', acceptanceCriteria: ['AC1', 'AC2'] });
    const previous = makeSeed({ id: 'p', acceptanceCriteria: ['AC1', 'AC2'] });

    const result = await checkOntologyStability({
      currentSeed: current,
      previousSeed: previous,
      computeEmbeddingFn: mockComputeEmbedding,
    });

    expect(result.fired).toBe(true);
    expect(result.type).toBe('ontology_stability');
  });

  it('does not fire when cosine is below threshold (0.90)', async () => {
    mockComputeEmbedding.mockResolvedValue([1, 0, 0]);
    mockJaccardSimilarity.mockReturnValue(0.96);
    mockCosineSimilarity.mockReturnValue(0.90);

    const current = makeSeed({ id: 'c', acceptanceCriteria: ['AC1'] });
    const previous = makeSeed({ id: 'p', acceptanceCriteria: ['AC1'] });

    const result = await checkOntologyStability({
      currentSeed: current,
      previousSeed: previous,
      computeEmbeddingFn: mockComputeEmbedding,
    });

    expect(result.fired).toBe(false);
  });

  it('does not fire when Jaccard is below threshold (0.80)', async () => {
    mockComputeEmbedding.mockResolvedValue([1, 0, 0]);
    mockJaccardSimilarity.mockReturnValue(0.80);
    mockCosineSimilarity.mockReturnValue(0.97);

    const current = makeSeed({ id: 'c', acceptanceCriteria: ['AC1'] });
    const previous = makeSeed({ id: 'p', acceptanceCriteria: ['AC2'] });

    const result = await checkOntologyStability({
      currentSeed: current,
      previousSeed: previous,
      computeEmbeddingFn: mockComputeEmbedding,
    });

    expect(result.fired).toBe(false);
  });
});

describe('checkOscillation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fire with fewer than 3 seeds (no grandparent)', async () => {
    const lineage = [
      makeSeed({ id: 's1', acceptanceCriteria: ['AC1'] }),
      makeSeed({ id: 's2', acceptanceCriteria: ['AC2'] }),
    ];

    const result = await checkOscillation({
      lineage,
      currentIndex: 1,
      computeEmbeddingFn: mockComputeEmbedding,
    });

    expect(result.fired).toBe(false);
  });

  it('fires when similarity to grandparent (period-2) >= 0.95', async () => {
    mockComputeEmbedding.mockResolvedValue([1, 0, 0]);
    mockCosineSimilarity.mockReturnValue(0.97);

    const lineage = [
      makeSeed({ id: 's1', acceptanceCriteria: ['AC1'] }),
      makeSeed({ id: 's2', acceptanceCriteria: ['AC2'] }),
      makeSeed({ id: 's3', acceptanceCriteria: ['AC1'] }),
    ];

    const result = await checkOscillation({
      lineage,
      currentIndex: 2,
      computeEmbeddingFn: mockComputeEmbedding,
    });

    expect(result.fired).toBe(true);
    expect(result.type).toBe('oscillation');
  });

  it('fires when similarity to great-grandparent (period-3) >= 0.95', async () => {
    // For period-2: cosine below threshold; for period-3: above threshold
    mockComputeEmbedding.mockResolvedValue([1, 0, 0]);
    mockCosineSimilarity
      .mockReturnValueOnce(0.80) // period-2 similarity
      .mockReturnValueOnce(0.97); // period-3 similarity

    const lineage = [
      makeSeed({ id: 's1', acceptanceCriteria: ['AC1'] }),
      makeSeed({ id: 's2', acceptanceCriteria: ['AC2'] }),
      makeSeed({ id: 's3', acceptanceCriteria: ['AC3'] }),
      makeSeed({ id: 's4', acceptanceCriteria: ['AC1'] }),
    ];

    const result = await checkOscillation({
      lineage,
      currentIndex: 3,
      computeEmbeddingFn: mockComputeEmbedding,
    });

    expect(result.fired).toBe(true);
  });

  it('fires when similarity to great-great-grandparent (period-4) >= 0.95', async () => {
    mockComputeEmbedding.mockResolvedValue([1, 0, 0]);
    mockCosineSimilarity
      .mockReturnValueOnce(0.80) // period-2 similarity
      .mockReturnValueOnce(0.80) // period-3 similarity
      .mockReturnValueOnce(0.97); // period-4 similarity

    const lineage = [
      makeSeed({ id: 's1', acceptanceCriteria: ['AC1'] }),
      makeSeed({ id: 's2', acceptanceCriteria: ['AC2'] }),
      makeSeed({ id: 's3', acceptanceCriteria: ['AC3'] }),
      makeSeed({ id: 's4', acceptanceCriteria: ['AC4'] }),
      makeSeed({ id: 's5', acceptanceCriteria: ['AC1'] }),
    ];

    const result = await checkOscillation({
      lineage,
      currentIndex: 4,
      computeEmbeddingFn: mockComputeEmbedding,
    });

    expect(result.fired).toBe(true);
  });

  it('does not fire when all period comparisons below 0.95', async () => {
    mockComputeEmbedding.mockResolvedValue([1, 0, 0]);
    mockCosineSimilarity.mockReturnValue(0.80);

    const lineage = [
      makeSeed({ id: 's1', acceptanceCriteria: ['AC1'] }),
      makeSeed({ id: 's2', acceptanceCriteria: ['AC2'] }),
      makeSeed({ id: 's3', acceptanceCriteria: ['AC3'] }),
    ];

    const result = await checkOscillation({
      lineage,
      currentIndex: 2,
      computeEmbeddingFn: mockComputeEmbedding,
    });

    expect(result.fired).toBe(false);
  });
});

describe('checkRepetitiveFeedback', () => {
  it('fires when 80% of current gap IDs match previous (80% >= 70%)', () => {
    const currentGaps: GapAnalysis[] = [
      { dimension: 'a', score: 0.5, description: 'd1', gapId: 'gap1' },
      { dimension: 'b', score: 0.5, description: 'd2', gapId: 'gap2' },
      { dimension: 'c', score: 0.5, description: 'd3', gapId: 'gap3' },
      { dimension: 'd', score: 0.5, description: 'd4', gapId: 'gap4' },
      { dimension: 'e', score: 0.5, description: 'd5', gapId: 'gap5' },
    ];
    const previousGaps: GapAnalysis[] = [
      { dimension: 'a', score: 0.5, description: 'd1', gapId: 'gap1' },
      { dimension: 'b', score: 0.5, description: 'd2', gapId: 'gap2' },
      { dimension: 'c', score: 0.5, description: 'd3', gapId: 'gap3' },
      { dimension: 'd', score: 0.5, description: 'd4', gapId: 'gap4' },
      { dimension: 'z', score: 0.5, description: 'dz', gapId: 'gapZ' },
    ];

    const result = checkRepetitiveFeedback({ currentGaps, previousGaps });
    expect(result.fired).toBe(true);
    expect(result.type).toBe('repetitive_feedback');
  });

  it('does not fire when 50% overlap (< 70%)', () => {
    const currentGaps: GapAnalysis[] = [
      { dimension: 'a', score: 0.5, description: 'd1', gapId: 'gap1' },
      { dimension: 'b', score: 0.5, description: 'd2', gapId: 'gap2' },
    ];
    const previousGaps: GapAnalysis[] = [
      { dimension: 'a', score: 0.5, description: 'd1', gapId: 'gap1' },
      { dimension: 'z', score: 0.5, description: 'dz', gapId: 'gapZ' },
    ];

    const result = checkRepetitiveFeedback({ currentGaps, previousGaps });
    expect(result.fired).toBe(false);
  });

  it('does not fire when no previous generation gap IDs', () => {
    const currentGaps: GapAnalysis[] = [
      { dimension: 'a', score: 0.5, description: 'd1', gapId: 'gap1' },
    ];

    const result = checkRepetitiveFeedback({ currentGaps, previousGaps: [] });
    expect(result.fired).toBe(false);
  });

  it('does not fire when current gaps are empty', () => {
    const result = checkRepetitiveFeedback({ currentGaps: [], previousGaps: [] });
    expect(result.fired).toBe(false);
  });
});

describe('checkConvergence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns halt=true for hard_cap at generation 30', async () => {
    const seed = makeSeedWithScore('s1', 0.5, 30);
    mockGetSeedLineage.mockResolvedValue([seed]);
    mockComputeEmbedding.mockResolvedValue([1, 0, 0]);
    mockJaccardSimilarity.mockReturnValue(0.5);
    mockCosineSimilarity.mockReturnValue(0.5);

    const result = await checkConvergence({
      db: {} as never,
      seedId: 's1',
      currentGeneration: 30,
      currentScore: 0.5,
      currentGaps: [],
      computeEmbeddingFn: mockComputeEmbedding,
    });

    expect(result.halt).toBe(true);
    expect(result.signal?.type).toBe('hard_cap');
  });

  it('returns halt=true for stagnation signal', async () => {
    const lineage = [
      makeSeedWithScore('s1', 0.65, 0),
      makeSeedWithScore('s2', 0.65, 1),
      makeSeedWithScore('s3', 0.65, 2),
    ];
    mockGetSeedLineage.mockResolvedValue(lineage);
    mockComputeEmbedding.mockResolvedValue([1, 0, 0]);
    mockJaccardSimilarity.mockReturnValue(0.5);
    mockCosineSimilarity.mockReturnValue(0.5);

    const result = await checkConvergence({
      db: {} as never,
      seedId: 's3',
      currentGeneration: 2,
      currentScore: 0.65,
      currentGaps: [],
      computeEmbeddingFn: mockComputeEmbedding,
    });

    expect(result.halt).toBe(true);
    expect(result.signal?.type).toBe('stagnation');
  });

  it('returns halt=false when no signals fire', async () => {
    const lineage = [
      makeSeedWithScore('s1', 0.60, 0),
      makeSeedWithScore('s2', 0.65, 1),
    ];
    mockGetSeedLineage.mockResolvedValue(lineage);
    mockComputeEmbedding.mockResolvedValue([1, 0, 0]);
    mockJaccardSimilarity.mockReturnValue(0.50);
    mockCosineSimilarity.mockReturnValue(0.50);

    const result = await checkConvergence({
      db: {} as never,
      seedId: 's2',
      currentGeneration: 1,
      currentScore: 0.65,
      currentGaps: [],
      computeEmbeddingFn: mockComputeEmbedding,
    });

    expect(result.halt).toBe(false);
    expect(result.signal).toBeUndefined();
  });

  it('checks signals in priority order: hard_cap first', async () => {
    // hard_cap should fire before stagnation
    const lineage = [
      makeSeedWithScore('s1', 0.65, 28),
      makeSeedWithScore('s2', 0.65, 29),
      makeSeedWithScore('s3', 0.65, 30),
    ];
    mockGetSeedLineage.mockResolvedValue(lineage);
    mockComputeEmbedding.mockResolvedValue([1, 0, 0]);
    mockJaccardSimilarity.mockReturnValue(0.5);
    mockCosineSimilarity.mockReturnValue(0.5);

    const result = await checkConvergence({
      db: {} as never,
      seedId: 's3',
      currentGeneration: 30,
      currentScore: 0.65,
      currentGaps: [],
      computeEmbeddingFn: mockComputeEmbedding,
    });

    expect(result.halt).toBe(true);
    expect(result.signal?.type).toBe('hard_cap');
  });
});
