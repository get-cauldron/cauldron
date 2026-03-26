import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InterviewTurn } from '../types.js';

// Mock gateway for testing
const mockGenerateObject = vi.fn();
const mockGateway = {
  generateObject: mockGenerateObject,
};

describe('synthesizeFromTranscript', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls gateway.generateObject with seedSummarySchema and SYNTHESIZER_SYSTEM_PROMPT', async () => {
    const { synthesizeFromTranscript, seedSummarySchema, SYNTHESIZER_SYSTEM_PROMPT } = await import('../synthesizer.js');

    const mockSummary = {
      goal: 'Build a CLI renaming tool',
      constraints: ['TypeScript only'],
      acceptanceCriteria: ['Accepts natural language input'],
      ontologySchema: { entities: [] },
      evaluationPrinciples: ['Correctness first'],
      exitConditions: { allTestsPass: true },
    };

    mockGenerateObject.mockResolvedValue({ object: mockSummary });

    const turn: InterviewTurn = {
      turnNumber: 1,
      perspective: 'researcher',
      question: 'What should the tool do?',
      mcOptions: ['Option A', 'Option B'],
      userAnswer: 'Rename files based on natural language patterns',
      ambiguityScoreSnapshot: { goalClarity: 0.5, constraintClarity: 0.5, successCriteriaClarity: 0.5, overall: 0.5, reasoning: 'test' },
      model: 'claude-3-5-sonnet-20241022',
      allCandidates: [],
      timestamp: new Date().toISOString(),
    };

    await synthesizeFromTranscript(mockGateway as any, [turn], 'project-123');

    expect(mockGenerateObject).toHaveBeenCalledOnce();
    const callArgs = mockGenerateObject.mock.calls[0][0];
    expect(callArgs.schema).toBe(seedSummarySchema);
    expect(callArgs.system).toBe(SYNTHESIZER_SYSTEM_PROMPT);
    expect(callArgs.stage).toBe('interview');
    expect(callArgs.projectId).toBe('project-123');
  });

  it('returns the parsed SeedSummary object from gateway response', async () => {
    const { synthesizeFromTranscript } = await import('../synthesizer.js');

    const mockSummary = {
      goal: 'Build a CLI renaming tool',
      constraints: ['TypeScript only', 'No external deps'],
      acceptanceCriteria: ['Accepts natural language input', 'Handles bulk rename'],
      ontologySchema: {
        entities: [
          { name: 'File', attributes: ['name', 'path'], relations: [] },
        ],
      },
      evaluationPrinciples: ['Correctness first', 'Speed second'],
      exitConditions: { allTestsPass: true, noRegressions: true },
    };

    mockGenerateObject.mockResolvedValue({ object: mockSummary });

    const result = await synthesizeFromTranscript(mockGateway as any, [], 'project-abc');

    expect(result).toEqual(mockSummary);
  });

  it('serializes transcript as numbered Q&A pairs in the prompt', async () => {
    const { synthesizeFromTranscript } = await import('../synthesizer.js');

    mockGenerateObject.mockResolvedValue({
      object: {
        goal: 'g', constraints: [], acceptanceCriteria: [],
        ontologySchema: { entities: [] }, evaluationPrinciples: [], exitConditions: {},
      },
    });

    const turns: InterviewTurn[] = [
      {
        turnNumber: 1,
        perspective: 'researcher',
        question: 'What should the tool do?',
        mcOptions: [],
        userAnswer: 'Rename files',
        freeformText: 'More details here',
        ambiguityScoreSnapshot: { goalClarity: 0.5, constraintClarity: 0.5, successCriteriaClarity: 0.5, overall: 0.5, reasoning: 'test' },
        model: 'claude-3-5-sonnet-20241022',
        allCandidates: [],
        timestamp: new Date().toISOString(),
      },
      {
        turnNumber: 2,
        perspective: 'architect',
        question: 'Any constraints?',
        mcOptions: [],
        userAnswer: 'TypeScript only',
        ambiguityScoreSnapshot: { goalClarity: 0.7, constraintClarity: 0.7, successCriteriaClarity: 0.7, overall: 0.7, reasoning: 'test' },
        model: 'claude-3-5-sonnet-20241022',
        allCandidates: [],
        timestamp: new Date().toISOString(),
      },
    ];

    await synthesizeFromTranscript(mockGateway as any, turns, 'project-xyz');

    const callArgs = mockGenerateObject.mock.calls[0][0];
    expect(callArgs.prompt).toContain('Turn 1 (researcher)');
    expect(callArgs.prompt).toContain('Turn 2 (architect)');
    expect(callArgs.prompt).toContain('Rename files');
    expect(callArgs.prompt).toContain('TypeScript only');
    expect(callArgs.prompt).toContain('More details here');
  });

  it('handles empty transcript (edge case)', async () => {
    const { synthesizeFromTranscript } = await import('../synthesizer.js');

    const emptySummary = {
      goal: 'Unspecified goal',
      constraints: [],
      acceptanceCriteria: [],
      ontologySchema: { entities: [] },
      evaluationPrinciples: [],
      exitConditions: {},
    };

    mockGenerateObject.mockResolvedValue({ object: emptySummary });

    const result = await synthesizeFromTranscript(mockGateway as any, [], 'project-empty');

    expect(result).toEqual(emptySummary);
    const callArgs = mockGenerateObject.mock.calls[0][0];
    expect(callArgs.prompt).toBeDefined();
  });
});

describe('formatScoreBreakdown', () => {
  it('produces correct formatted string for greenfield scores', async () => {
    const { formatScoreBreakdown } = await import('../format.js');

    const scores = {
      goalClarity: 0.85,
      constraintClarity: 0.60,
      successCriteriaClarity: 0.40,
      overall: 0.63,
      reasoning: 'test',
    };

    const result = formatScoreBreakdown(scores, 'greenfield');

    // D-17: full dimension breakdown
    expect(result.formatted).toContain('Goal: 85%');
    expect(result.formatted).toContain('Constraints: 60%');
    expect(result.formatted).toContain('Success criteria: 40%');
    expect(result.formatted).toContain('Overall: 63%');
    // Check separator format
    expect(result.formatted).toContain('--');
    // Greenfield should NOT include Context
    expect(result.formatted).not.toContain('Context:');
  });

  it('includes contextClarity for brownfield mode', async () => {
    const { formatScoreBreakdown } = await import('../format.js');

    const scores = {
      goalClarity: 0.75,
      constraintClarity: 0.65,
      successCriteriaClarity: 0.55,
      contextClarity: 0.45,
      overall: 0.62,
      reasoning: 'brownfield test',
    };

    const result = formatScoreBreakdown(scores, 'brownfield');

    expect(result.formatted).toContain('Context: 45%');
    expect(result.formatted).toContain('Goal: 75%');
  });

  it('identifies the weakest dimension', async () => {
    const { formatScoreBreakdown } = await import('../format.js');

    const scores = {
      goalClarity: 0.85,
      constraintClarity: 0.60,
      successCriteriaClarity: 0.40, // weakest
      overall: 0.63,
      reasoning: 'test',
    };

    const result = formatScoreBreakdown(scores, 'greenfield');

    expect(result.weakestDimension.dimension).toBe('successCriteriaClarity');
    expect(result.weakestDimension.score).toBe(0.40);
  });

  it('returns dimensions array with correct labels', async () => {
    const { formatScoreBreakdown } = await import('../format.js');

    const scores = {
      goalClarity: 0.8,
      constraintClarity: 0.7,
      successCriteriaClarity: 0.6,
      overall: 0.7,
      reasoning: 'test',
    };

    const result = formatScoreBreakdown(scores, 'greenfield');

    expect(result.dimensions).toHaveLength(3);
    expect(result.dimensions[0]!.label).toBe('Goal');
    expect(result.dimensions[1]!.label).toBe('Constraints');
    expect(result.dimensions[2]!.label).toBe('Success criteria');
  });
});
