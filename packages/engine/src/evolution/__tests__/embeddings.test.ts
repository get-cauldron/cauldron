import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ai', () => ({
  embed: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: {
    embedding: vi.fn(() => 'mock-embedding-model'),
  },
}));

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', async () => {
    const { cosineSimilarity } = await import('../embeddings.js');
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
  });

  it('returns 0.0 for orthogonal vectors', async () => {
    const { cosineSimilarity } = await import('../embeddings.js');
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0);
  });

  it('returns -1.0 for opposite vectors', async () => {
    const { cosineSimilarity } = await import('../embeddings.js');
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1.0);
  });

  it('returns 0 for zero vectors (avoid division by zero)', async () => {
    const { cosineSimilarity } = await import('../embeddings.js');
    expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
  });
});

describe('jaccardSimilarity', () => {
  it('returns 0.5 for sets with 50% overlap', async () => {
    const { jaccardSimilarity } = await import('../embeddings.js');
    expect(jaccardSimilarity(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']))).toBeCloseTo(0.5);
  });

  it('returns 1.0 for identical sets', async () => {
    const { jaccardSimilarity } = await import('../embeddings.js');
    expect(jaccardSimilarity(new Set(['a']), new Set(['a']))).toBeCloseTo(1.0);
  });

  it('returns 0.0 for disjoint sets', async () => {
    const { jaccardSimilarity } = await import('../embeddings.js');
    expect(jaccardSimilarity(new Set(['a']), new Set(['b']))).toBeCloseTo(0.0);
  });

  it('returns 0 for two empty sets (avoid division by zero)', async () => {
    const { jaccardSimilarity } = await import('../embeddings.js');
    expect(jaccardSimilarity(new Set<string>(), new Set<string>())).toBe(0);
  });
});

describe('hashGapId', () => {
  it('returns a consistent SHA-256 hex string', async () => {
    const { hashGapId } = await import('../embeddings.js');
    const result = hashGapId('usability', 'Interface not intuitive');
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns same hash for same inputs', async () => {
    const { hashGapId } = await import('../embeddings.js');
    const r1 = hashGapId('usability', 'Interface not intuitive');
    const r2 = hashGapId('usability', 'Interface not intuitive');
    expect(r1).toBe(r2);
  });

  it('returns different hash for different inputs', async () => {
    const { hashGapId } = await import('../embeddings.js');
    const r1 = hashGapId('usability', 'Interface not intuitive');
    const r2 = hashGapId('performance', 'Response too slow');
    expect(r1).not.toBe(r2);
  });
});

describe('computeEmbedding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls embed with the provided text and returns embedding vector', async () => {
    const { embed } = await import('ai');
    vi.mocked(embed).mockResolvedValueOnce({ embedding: [0.1, 0.2, 0.3], value: 'test' } as any);

    const { computeEmbedding } = await import('../embeddings.js');
    const result = await computeEmbedding('test text');

    expect(embed).toHaveBeenCalledOnce();
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });
});
