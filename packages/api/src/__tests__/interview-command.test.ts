import { describe, it, expect, vi, beforeEach } from 'vitest';

// interview.ts now uses tRPC client exclusively — no @cauldron/engine or @cauldron/shared imports
describe('interviewCommand', () => {
  let interviewCommand: typeof import('../commands/interview.js').interviewCommand;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../commands/interview.js');
    interviewCommand = mod.interviewCommand;
  });

  function makeClient(overrides?: {
    transcriptResult?: unknown;
    sendAnswerResult?: unknown;
    summaryResult?: unknown;
  }) {
    return {
      interview: {
        getTranscript: {
          query: vi.fn().mockResolvedValue(
            overrides?.transcriptResult ?? {
              interview: null,
              transcript: [],
              currentScores: null,
              status: 'not_started',
              phase: 'gathering',
              suggestions: [],
              activePerspective: null,
              thresholdMet: false,
            }
          ),
        },
        sendAnswer: {
          mutate: vi.fn().mockResolvedValue(
            overrides?.sendAnswerResult ?? {
              interviewId: 'iv-1',
              turnNumber: 1,
              currentScores: { overall: 0.5, goalClarity: 0.5, successCriteriaClarity: 0.5, constraintClarity: 0.5 },
              thresholdMet: false,
              phase: 'gathering',
            }
          ),
        },
        getSummary: {
          query: vi.fn().mockResolvedValue(
            overrides?.summaryResult ?? {
              summary: 'Build a file renamer',
              phase: 'reviewing',
              interviewId: 'iv-1',
            }
          ),
        },
      },
    } as unknown as Parameters<typeof interviewCommand>[0];
  }

  it('Test 1: exits with error when no projectId provided', async () => {
    const client = makeClient();
    const errspy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exitspy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as () => never);

    await expect(
      interviewCommand(client, [], { json: false })
    ).rejects.toThrow('process.exit called');

    expect(console.error).toHaveBeenCalled();
    errspy.mockRestore();
    exitspy.mockRestore();
  });

  it('Test 2: calls getTranscript on start', async () => {
    const transcriptFn = vi.fn().mockResolvedValue({
      interview: null,
      transcript: [],
      currentScores: null,
      status: 'not_started',
      phase: 'reviewing', // already past gathering — exits early
      suggestions: [],
      activePerspective: null,
      thresholdMet: false,
    });
    const client = {
      interview: {
        getTranscript: { query: transcriptFn },
        sendAnswer: { mutate: vi.fn() },
        getSummary: { query: vi.fn().mockResolvedValue({ summary: 'x', phase: 'reviewing', interviewId: 'iv-1' }) },
      },
    } as unknown as Parameters<typeof interviewCommand>[0];
    const logspy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await interviewCommand(client, [], { json: false, projectId: 'project-123' });

    expect(transcriptFn).toHaveBeenCalledWith({ projectId: 'project-123' });

    logspy.mockRestore();
  });

  it('Test 3: outputs JSON transcript state when json flag set', async () => {
    const state = {
      interview: null,
      transcript: [],
      currentScores: null,
      status: 'not_started',
      phase: 'gathering',
      suggestions: [],
      activePerspective: null,
      thresholdMet: false,
    };
    const client = makeClient({ transcriptResult: state });
    const logspy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await interviewCommand(client, [], { json: true, projectId: 'project-123' });

    const output = logspy.mock.calls[0]?.[0] as string;
    expect(() => JSON.parse(output)).not.toThrow();

    logspy.mockRestore();
  });
});
