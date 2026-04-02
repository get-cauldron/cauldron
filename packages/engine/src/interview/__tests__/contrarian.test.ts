import { describe, it, expect, vi, type Mock } from 'vitest';
import { contrarianOutputSchema, CONTRARIAN_SYSTEM_PROMPT, runContrarianAnalysis } from '../contrarian.js';
import type { LLMGateway } from '../../gateway/gateway.js';
import type { InterviewTurn } from '../types.js';

// ─── Schema Validation ────────────────────────────────────────────────────────

describe('contrarianOutputSchema', () => {
  it('validates an object with a valid framings array', () => {
    const result = contrarianOutputSchema.safeParse({
      framings: [
        {
          hypothesis: 'Users want real-time updates',
          alternative: 'Users want accurate final results, not real-time noise',
          reasoning: 'Real-time updates often introduce complexity without adding decision-making value',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('validates an object with multiple framings', () => {
    const result = contrarianOutputSchema.safeParse({
      framings: [
        {
          hypothesis: 'Users want real-time updates',
          alternative: 'Users want accurate final results',
          reasoning: 'Real-time can add noise',
        },
        {
          hypothesis: 'The system needs to be fast',
          alternative: 'The system needs to be predictable',
          reasoning: 'Predictability often matters more than raw speed',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty framings array', () => {
    const result = contrarianOutputSchema.safeParse({ framings: [] });
    expect(result.success).toBe(false);
  });

  it('rejects framing missing hypothesis', () => {
    const result = contrarianOutputSchema.safeParse({
      framings: [
        {
          alternative: 'Some alternative',
          reasoning: 'Some reasoning',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects framing missing alternative', () => {
    const result = contrarianOutputSchema.safeParse({
      framings: [
        {
          hypothesis: 'Some hypothesis',
          reasoning: 'Some reasoning',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects framing missing reasoning', () => {
    const result = contrarianOutputSchema.safeParse({
      framings: [
        {
          hypothesis: 'Some hypothesis',
          alternative: 'Some alternative',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing framings key', () => {
    const result = contrarianOutputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ─── CONTRARIAN_SYSTEM_PROMPT ─────────────────────────────────────────────────

describe('CONTRARIAN_SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof CONTRARIAN_SYSTEM_PROMPT).toBe('string');
    expect(CONTRARIAN_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it('contains hypothesis-related keywords', () => {
    const lower = CONTRARIAN_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain('hypothesis');
  });

  it('contains alternative-framing keywords', () => {
    const lower = CONTRARIAN_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain('alternative');
  });

  it('contains orthogonal or perpendicular thinking keywords', () => {
    const lower = CONTRARIAN_SYSTEM_PROMPT.toLowerCase();
    const hasOrthogonal = lower.includes('orthogonal') || lower.includes('perpendicular');
    expect(hasOrthogonal).toBe(true);
  });
});

// ─── runContrarianAnalysis ────────────────────────────────────────────────────

function makeTurn(userAnswer: string, turnNumber = 1): InterviewTurn {
  return {
    turnNumber,
    perspective: 'henry-wu',
    question: 'What problem are you solving?',
    mcOptions: [],
    userAnswer,
    ambiguityScoreSnapshot: {
      goalClarity: 0.5,
      constraintClarity: 0.5,
      successCriteriaClarity: 0.5,
      overall: 0.5,
      reasoning: 'mid-progress',
    },
    model: 'test-model',
    allCandidates: [],
    timestamp: new Date().toISOString(),
  };
}

describe('runContrarianAnalysis', () => {
  it('calls gateway.generateObject with stage "interview"', async () => {
    const mockGateway = {
      generateObject: vi.fn().mockResolvedValue({
        object: {
          framings: [
            {
              hypothesis: 'Users want real-time updates',
              alternative: 'Users want accurate final results',
              reasoning: 'Accuracy matters more',
            },
          ],
        },
      }),
    } as unknown as LLMGateway;

    const transcript = [makeTurn('I want a real-time dashboard')];
    await runContrarianAnalysis(mockGateway, transcript, 'proj-1', {});

    expect(mockGateway.generateObject).toHaveBeenCalledOnce();
    const callArgs = (mockGateway.generateObject as Mock).mock.calls[0][0];
    expect(callArgs.stage).toBe('interview');
  });

  it('calls gateway.generateObject with the contrarian system prompt', async () => {
    const mockGateway = {
      generateObject: vi.fn().mockResolvedValue({
        object: {
          framings: [
            {
              hypothesis: 'Test hypothesis',
              alternative: 'Test alternative',
              reasoning: 'Test reasoning',
            },
          ],
        },
      }),
    } as unknown as LLMGateway;

    const transcript = [makeTurn('I want a dashboard')];
    await runContrarianAnalysis(mockGateway, transcript, 'proj-1', {});

    const callArgs = (mockGateway.generateObject as Mock).mock.calls[0][0];
    expect(callArgs.system).toBe(CONTRARIAN_SYSTEM_PROMPT);
  });

  it('calls gateway.generateObject with the contrarian schema', async () => {
    const mockGateway = {
      generateObject: vi.fn().mockResolvedValue({
        object: {
          framings: [
            {
              hypothesis: 'Test hypothesis',
              alternative: 'Test alternative',
              reasoning: 'Test reasoning',
            },
          ],
        },
      }),
    } as unknown as LLMGateway;

    const transcript = [makeTurn('I want a dashboard')];
    await runContrarianAnalysis(mockGateway, transcript, 'proj-1', {});

    const callArgs = (mockGateway.generateObject as Mock).mock.calls[0][0];
    expect(callArgs.schema).toBe(contrarianOutputSchema);
  });

  it('returns ContrarianFraming[] from the gateway response', async () => {
    const expectedFramings = [
      {
        hypothesis: 'Users want real-time updates',
        alternative: 'Users want accurate final results',
        reasoning: 'Accuracy matters more',
      },
    ];

    const mockGateway = {
      generateObject: vi.fn().mockResolvedValue({ object: { framings: expectedFramings } }),
    } as unknown as LLMGateway;

    const transcript = [makeTurn('I want a real-time dashboard')];
    const result = await runContrarianAnalysis(mockGateway, transcript, 'proj-1', {});

    expect(result).toEqual(expectedFramings);
  });

  it('uses config.contrarianModel when provided', async () => {
    const mockGateway = {
      generateObject: vi.fn().mockResolvedValue({
        object: {
          framings: [
            {
              hypothesis: 'H',
              alternative: 'A',
              reasoning: 'R',
            },
          ],
        },
      }),
    } as unknown as LLMGateway;

    const transcript = [makeTurn('Some statement')];
    await runContrarianAnalysis(mockGateway, transcript, 'proj-1', {
      contrarianModel: 'claude-3-haiku',
    });

    const callArgs = (mockGateway.generateObject as Mock).mock.calls[0][0];
    // contrarianModel is mapped to modelOverride — the gateway uses it to bypass the stage's model chain
    expect(callArgs).toHaveProperty('modelOverride', 'claude-3-haiku');
  });

  it('only sends the last 2 turns to the contrarian (focused context)', async () => {
    const mockGateway = {
      generateObject: vi.fn().mockResolvedValue({
        object: {
          framings: [
            {
              hypothesis: 'H',
              alternative: 'A',
              reasoning: 'R',
            },
          ],
        },
      }),
    } as unknown as LLMGateway;

    const transcript = [
      makeTurn('First answer', 1),
      makeTurn('Second answer', 2),
      makeTurn('Third answer', 3),
      makeTurn('Fourth answer', 4),
    ];
    await runContrarianAnalysis(mockGateway, transcript, 'proj-1', {});

    const callArgs = (mockGateway.generateObject as Mock).mock.calls[0][0];
    const prompt = callArgs.prompt as string;
    // Should contain the last two answers but not the first two
    expect(prompt).toContain('Third answer');
    expect(prompt).toContain('Fourth answer');
    expect(prompt).not.toContain('First answer');
    expect(prompt).not.toContain('Second answer');
  });
});
