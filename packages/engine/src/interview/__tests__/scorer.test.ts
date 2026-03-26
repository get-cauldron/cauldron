import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  greenfieldScoresSchema,
  brownfieldScoresSchema,
  computeWeightedScore,
  scoreTranscript,
  validateScoreRules,
  SCORER_SYSTEM_PROMPT,
  buildScorerPrompt,
} from '../scorer.js';
import type { AmbiguityScores, InterviewTurn } from '../types.js';
import type { LLMGateway } from '../../gateway/gateway.js';

// ─── computeWeightedScore ────────────────────────────────────────────────────

describe('computeWeightedScore', () => {
  it('computes greenfield score with 40/30/30 weights', () => {
    const scores = {
      goalClarity: 0.8,
      constraintClarity: 0.6,
      successCriteriaClarity: 0.5,
      reasoning: 'test',
    };
    // 0.8*0.4 + 0.6*0.3 + 0.5*0.3 = 0.32 + 0.18 + 0.15 = 0.65
    expect(computeWeightedScore(scores, 'greenfield')).toBeCloseTo(0.65, 10);
  });

  it('computes brownfield score with 35/25/25/15 weights', () => {
    const scores = {
      goalClarity: 0.8,
      constraintClarity: 0.6,
      successCriteriaClarity: 0.5,
      contextClarity: 0.7,
      reasoning: 'test',
    };
    // 0.8*0.35 + 0.6*0.25 + 0.5*0.25 + 0.7*0.15 = 0.28 + 0.15 + 0.125 + 0.105 = 0.66
    expect(computeWeightedScore(scores, 'brownfield')).toBeCloseTo(0.66, 10);
  });

  it('returns 1.0 when all greenfield scores are 1.0', () => {
    const scores = {
      goalClarity: 1.0,
      constraintClarity: 1.0,
      successCriteriaClarity: 1.0,
    };
    expect(computeWeightedScore(scores, 'greenfield')).toBeCloseTo(1.0, 10);
  });

  it('returns 0.0 when all greenfield scores are 0.0', () => {
    const scores = {
      goalClarity: 0.0,
      constraintClarity: 0.0,
      successCriteriaClarity: 0.0,
    };
    expect(computeWeightedScore(scores, 'greenfield')).toBeCloseTo(0.0, 10);
  });
});

// ─── validateScoreRules ──────────────────────────────────────────────────────

describe('validateScoreRules', () => {
  const validScores = {
    goalClarity: 0.7,
    constraintClarity: 0.6,
    successCriteriaClarity: 0.5,
  };

  it('returns valid when scores are in range and no big drops', () => {
    const previous: AmbiguityScores = {
      goalClarity: 0.7,
      constraintClarity: 0.6,
      successCriteriaClarity: 0.5,
      overall: 0.62,
      reasoning: 'previous',
    };
    const result = validateScoreRules(validScores, previous);
    expect(result.valid).toBe(true);
    expect(result.anomalies).toHaveLength(0);
  });

  it('returns anomaly when a dimension drops more than 0.3 from previous', () => {
    const previous: AmbiguityScores = {
      goalClarity: 0.9,
      constraintClarity: 0.6,
      successCriteriaClarity: 0.5,
      overall: 0.72,
      reasoning: 'previous',
    };
    const current = {
      goalClarity: 0.5, // dropped 0.4 — anomaly
      constraintClarity: 0.6,
      successCriteriaClarity: 0.5,
    };
    const result = validateScoreRules(current, previous);
    expect(result.valid).toBe(false);
    expect(result.anomalies.length).toBeGreaterThan(0);
    expect(result.anomalies[0]).toContain('goalClarity');
  });

  it('does not flag drop of less than 0.3', () => {
    const previous: AmbiguityScores = {
      goalClarity: 0.8,
      constraintClarity: 0.6,
      successCriteriaClarity: 0.5,
      overall: 0.67,
      reasoning: 'previous',
    };
    const current = {
      goalClarity: 0.55, // dropped 0.25 — NOT anomaly (< 0.3 threshold)
      constraintClarity: 0.6,
      successCriteriaClarity: 0.5,
    };
    const result = validateScoreRules(current, previous);
    expect(result.valid).toBe(true);
  });

  it('returns anomaly when a dimension is below 0', () => {
    const current = {
      goalClarity: -0.1,
      constraintClarity: 0.6,
      successCriteriaClarity: 0.5,
    };
    const result = validateScoreRules(current, null);
    expect(result.valid).toBe(false);
    expect(result.anomalies.some((a) => a.includes('goalClarity'))).toBe(true);
  });

  it('returns anomaly when a dimension is above 1', () => {
    const current = {
      goalClarity: 1.1,
      constraintClarity: 0.6,
      successCriteriaClarity: 0.5,
    };
    const result = validateScoreRules(current, null);
    expect(result.valid).toBe(false);
    expect(result.anomalies.some((a) => a.includes('goalClarity'))).toBe(true);
  });

  it('returns valid when no previous scores', () => {
    const result = validateScoreRules(validScores, null);
    expect(result.valid).toBe(true);
    expect(result.anomalies).toHaveLength(0);
  });
});

// ─── Zod schemas ─────────────────────────────────────────────────────────────

describe('greenfieldScoresSchema', () => {
  it('accepts valid scores', () => {
    const result = greenfieldScoresSchema.safeParse({
      goalClarity: 0.8,
      constraintClarity: 0.6,
      successCriteriaClarity: 0.5,
      reasoning: 'test rationale',
    });
    expect(result.success).toBe(true);
  });

  it('rejects goalClarity > 1', () => {
    const result = greenfieldScoresSchema.safeParse({
      goalClarity: 1.1,
      constraintClarity: 0.6,
      successCriteriaClarity: 0.5,
      reasoning: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects goalClarity < 0', () => {
    const result = greenfieldScoresSchema.safeParse({
      goalClarity: -0.1,
      constraintClarity: 0.6,
      successCriteriaClarity: 0.5,
      reasoning: 'test',
    });
    expect(result.success).toBe(false);
  });
});

describe('brownfieldScoresSchema', () => {
  it('requires contextClarity field', () => {
    // Missing contextClarity — should fail
    const result = brownfieldScoresSchema.safeParse({
      goalClarity: 0.8,
      constraintClarity: 0.6,
      successCriteriaClarity: 0.5,
      reasoning: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid brownfield scores including contextClarity', () => {
    const result = brownfieldScoresSchema.safeParse({
      goalClarity: 0.8,
      constraintClarity: 0.6,
      successCriteriaClarity: 0.5,
      contextClarity: 0.7,
      reasoning: 'test',
    });
    expect(result.success).toBe(true);
  });
});

// ─── scoreTranscript ─────────────────────────────────────────────────────────

describe('scoreTranscript', () => {
  const mockGateway = {
    generateObject: vi.fn(),
  } as unknown as LLMGateway;

  const emptyTranscript: InterviewTurn[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls gateway with temperature=0 for deterministic scoring', async () => {
    (mockGateway.generateObject as ReturnType<typeof vi.fn>).mockResolvedValue({
      object: {
        goalClarity: 0.8,
        constraintClarity: 0.7,
        successCriteriaClarity: 0.6,
        reasoning: 'looks good',
      },
    });

    await scoreTranscript(mockGateway, emptyTranscript, 'greenfield', 'proj-1', null, {});

    const callArgs = (mockGateway.generateObject as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.temperature).toBe(0);
  });

  it('returns AmbiguityScores with computed overall', async () => {
    (mockGateway.generateObject as ReturnType<typeof vi.fn>).mockResolvedValue({
      object: {
        goalClarity: 0.8,
        constraintClarity: 0.6,
        successCriteriaClarity: 0.5,
        reasoning: 'reasonable',
      },
    });

    const result = await scoreTranscript(mockGateway, emptyTranscript, 'greenfield', 'proj-1', null, {});

    // overall should be weighted: 0.8*0.4 + 0.6*0.3 + 0.5*0.3 = 0.65
    expect(result.overall).toBeCloseTo(0.65, 10);
    expect(result.goalClarity).toBe(0.8);
    expect(result.reasoning).toBe('reasonable');
  });

  it('retries once when rule validation detects anomaly', async () => {
    const previous: AmbiguityScores = {
      goalClarity: 0.9,
      constraintClarity: 0.8,
      successCriteriaClarity: 0.7,
      overall: 0.81,
      reasoning: 'previous',
    };

    // First call returns anomalous scores (goalClarity dropped 0.5 from 0.9)
    const firstResponse = {
      object: { goalClarity: 0.4, constraintClarity: 0.8, successCriteriaClarity: 0.7, reasoning: 'anomaly' },
    };
    // Retry returns valid scores
    const retryResponse = {
      object: { goalClarity: 0.85, constraintClarity: 0.8, successCriteriaClarity: 0.7, reasoning: 'corrected' },
    };

    (mockGateway.generateObject as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(retryResponse);

    const result = await scoreTranscript(mockGateway, emptyTranscript, 'greenfield', 'proj-1', previous, {});

    // Should have called gateway twice
    expect((mockGateway.generateObject as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
    // Should use retry result
    expect(result.goalClarity).toBe(0.85);
  });

  it('uses stage interview for gateway calls', async () => {
    (mockGateway.generateObject as ReturnType<typeof vi.fn>).mockResolvedValue({
      object: { goalClarity: 0.7, constraintClarity: 0.7, successCriteriaClarity: 0.7, reasoning: 'ok' },
    });

    await scoreTranscript(mockGateway, emptyTranscript, 'greenfield', 'proj-1', null, {});

    const callArgs = (mockGateway.generateObject as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.stage).toBe('interview');
  });
});

// ─── SCORER_SYSTEM_PROMPT calibration regression tests ───────────────────────

describe('SCORER_SYSTEM_PROMPT calibration', () => {
  it('contains "0.8-1.0" anchoring text for high-clarity examples', () => {
    expect(SCORER_SYSTEM_PROMPT).toContain('0.8-1.0');
  });

  it('contains "specific, testable" concrete-answer reward signal', () => {
    expect(SCORER_SYSTEM_PROMPT).toContain('specific, testable');
  });

  it('contains "MOST RECENT state of knowledge" recency instruction', () => {
    expect(SCORER_SYSTEM_PROMPT).toContain('MOST RECENT state of knowledge');
  });
});

// ─── buildScorerPrompt recency weighting regression tests ────────────────────

function makeTurns(count: number): InterviewTurn[] {
  const baseScores = {
    goalClarity: 0.5,
    constraintClarity: 0.5,
    successCriteriaClarity: 0.5,
    overall: 0.5,
    reasoning: 'test',
  };
  return Array.from({ length: count }, (_, i) => ({
    turnNumber: i + 1,
    perspective: 'researcher' as const,
    question: `Question ${i + 1}?`,
    mcOptions: [],
    userAnswer: `Answer ${i + 1}`,
    freeformText: undefined,
    ambiguityScoreSnapshot: baseScores,
    model: 'test-model',
    allCandidates: [],
    timestamp: new Date().toISOString(),
  }));
}

describe('buildScorerPrompt recency weighting', () => {
  it('returns "No interview turns yet" message for 0 turns', () => {
    const result = buildScorerPrompt([], 'greenfield');
    expect(result).toContain('No interview turns yet');
  });

  it('does NOT contain "MOST RECENT ANSWERS" for 2 turns (too few for splitting)', () => {
    const result = buildScorerPrompt(makeTurns(2), 'greenfield');
    expect(result).not.toContain('MOST RECENT ANSWERS');
  });

  it('contains "MOST RECENT ANSWERS" for 5 turns', () => {
    const result = buildScorerPrompt(makeTurns(5), 'greenfield');
    expect(result).toContain('MOST RECENT ANSWERS');
  });

  it('contains "MOST RECENT ANSWERS" for exactly 3 turns (boundary case)', () => {
    const result = buildScorerPrompt(makeTurns(3), 'greenfield');
    expect(result).toContain('MOST RECENT ANSWERS');
  });
});
