import { describe, it, expect, vi, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// Mocks — must be hoisted before any imports that transitively touch them
// ────────────────────────────────────────────────────────────────────────────

const mockSubmitAnswer = vi.fn();
const mockStartOrResume = vi.fn();
const mockCrystallizeSeed = vi.fn();

// vi.fn(function(){}) pattern required — arrow functions cannot be used as constructors in Vitest
// eslint-disable-next-line prefer-arrow-callback
const MockInterviewFSM = vi.fn(function (this: unknown) {
  Object.assign(this as object, {
    submitAnswer: mockSubmitAnswer,
    startOrResume: mockStartOrResume,
  });
});

vi.mock('@get-cauldron/engine', () => ({
  InterviewFSM: MockInterviewFSM,
  crystallizeSeed: (...args: unknown[]) => mockCrystallizeSeed(...args),
  ImmutableSeedError: class ImmutableSeedError extends Error {
    seedId: string;
    constructor(seedId: string) {
      super(`Seed ${seedId} is crystallized and cannot be mutated`);
      this.name = 'ImmutableSeedError';
      this.seedId = seedId;
    }
  },
  approveScenarios: vi.fn(),
  sealVault: vi.fn(),
  generateHoldoutScenarios: vi.fn().mockResolvedValue([{ scenario: 'test' }]),
  createVault: vi.fn().mockResolvedValue(undefined),
  synthesizeFromTranscript: vi.fn().mockResolvedValue({ goal: 'test', constraints: [], acceptanceCriteria: [] }),
}));

vi.mock('@get-cauldron/shared', () => ({
  db: {},
  interviews: { projectId: 'projectId', id: 'id', createdAt: 'createdAt', phase: 'phase' },
  seeds: {},
  holdoutVault: {},
}));

// Mock drizzle helpers used in interview router
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => `eq(${String(_col)}, ${String(_val)})`),
  desc: vi.fn((col: unknown) => `desc(${String(col)})`),
}));

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const mockGateway = {};
const mockConfig = {};
const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

/**
 * Build a minimal fake tRPC context for the interview router.
 * db.select() uses a fluent builder pattern that ultimately resolves to an array.
 */
function makeCtx(overrides: {
  interviewRow?: Partial<{
    id: string;
    projectId: string;
    phase: string;
    status: string;
    mode: string;
    turnCount: number;
    transcript: unknown;
    currentAmbiguityScore: unknown;
    createdAt: Date;
    completedAt: Date | null;
  }> | null;
} = {}) {
  const defaultInterview = {
    id: 'interview-123',
    projectId: 'project-abc',
    phase: 'gathering',
    status: 'active',
    mode: 'greenfield',
    turnCount: 0,
    transcript: [],
    currentAmbiguityScore: null,
    createdAt: new Date(),
    completedAt: null,
  };

  const interviewRow =
    overrides.interviewRow === null
      ? undefined
      : { ...defaultInterview, ...(overrides.interviewRow ?? {}) };

  const selectResult = interviewRow !== undefined ? [interviewRow] : [];

  const chainable = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(selectResult),
  };

  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };

  const db = {
    select: vi.fn().mockReturnValue(chainable),
    update: vi.fn().mockReturnValue(updateChain),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'seed-1', version: 1 }]),
      }),
    }),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      // Pass the db itself as the transaction client so inner queries use the same mocks
      return fn(db);
    }),
  } as Record<string, unknown>;

  const getEngineDeps = vi.fn().mockResolvedValue({
    gateway: mockGateway,
    config: mockConfig,
    logger: mockLogger,
  });

  return { db, authenticated: true, getEngineDeps };
}

// ────────────────────────────────────────────────────────────────────────────
// Import router AFTER mocks are registered
// ────────────────────────────────────────────────────────────────────────────

// We test the mutation logic directly by calling the resolver fn through the
// tRPC caller interface, but for unit isolation we invoke the raw procedure
// by building the context manually. The interviewRouter is imported after mocks.

const { interviewRouter } = await import('../interview.js');

// Helper to invoke a mutation procedure with a fake context
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callMutation(name: keyof typeof interviewRouter._def.procedures, input: unknown, ctx: any) {
  const caller = interviewRouter.createCaller(ctx);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (caller as any)[name](input);
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe('sendAnswer tRPC mutation — InterviewFSM wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls InterviewFSM.submitAnswer with correct arguments', async () => {
    const fakeTurnResult = {
      turn: {
        turnNumber: 1,
        perspective: 'henry-wu',
        question: 'What is the main user need?',
        mcOptions: ['Option A', 'Option B'],
        userAnswer: 'My answer',
        freeformText: undefined,
        ambiguityScoreSnapshot: { goalClarity: 0.5, constraintClarity: 0.5, successCriteriaClarity: 0.5, overall: 0.5, reasoning: '' },
        model: 'claude-3-5-haiku-20241022',
        allCandidates: [],
        timestamp: new Date().toISOString(),
      },
      scores: { goalClarity: 0.5, constraintClarity: 0.5, successCriteriaClarity: 0.5, overall: 0.5, reasoning: '' },
      nextQuestion: { selectedCandidate: { question: 'Next?', perspective: 'henry-wu', model: '' }, mcOptions: [], allCandidates: [] },
      thresholdMet: false,
    };

    mockSubmitAnswer.mockResolvedValue(fakeTurnResult);

    const ctx = makeCtx();
    await callMutation('sendAnswer', { projectId: 'project-abc', answer: 'My answer', freeformText: undefined }, ctx);

    // InterviewFSM should be constructed with (db, gateway, config, logger)
    expect(MockInterviewFSM).toHaveBeenCalledOnce();
    expect(MockInterviewFSM).toHaveBeenCalledWith(ctx.db, mockGateway, mockConfig, mockLogger);

    // submitAnswer should be called with (interviewId, projectId, { userAnswer, freeformText })
    expect(mockSubmitAnswer).toHaveBeenCalledWith('interview-123', 'project-abc', {
      userAnswer: 'My answer',
      freeformText: undefined,
    });
  });

  it('maps TurnResult fields to the expected response shape', async () => {
    const scores = { goalClarity: 0.6, constraintClarity: 0.7, successCriteriaClarity: 0.5, overall: 0.6, reasoning: 'OK' };
    const turn = {
      turnNumber: 2,
      perspective: 'hickam',
      question: 'Any constraints?',
      mcOptions: [],
      userAnswer: 'No constraints',
      freeformText: 'extra',
      ambiguityScoreSnapshot: scores,
      model: 'mistral-large-latest',
      allCandidates: [],
      timestamp: new Date().toISOString(),
    };
    const nextQuestion = { selectedCandidate: { question: 'Next question', perspective: 'henry-wu', model: 'mistral-large-latest' }, mcOptions: [], allCandidates: [] };

    mockSubmitAnswer.mockResolvedValue({ turn, scores, nextQuestion, thresholdMet: false });

    const ctx = makeCtx({ interviewRow: { turnCount: 1 } });
    const result = await callMutation('sendAnswer', { projectId: 'project-abc', answer: 'No constraints', freeformText: 'extra' }, ctx);

    expect(result).toMatchObject({
      interviewId: 'interview-123',
      turnNumber: 2,
      currentScores: scores,
      thresholdMet: false,
      phase: 'gathering',
      nextQuestion,
    });
    expect(result.turn).toEqual(turn);
  });

  it("returns phase='reviewing' when thresholdMet is true", async () => {
    const scores = { goalClarity: 0.9, constraintClarity: 0.9, successCriteriaClarity: 0.9, overall: 0.9, reasoning: 'Clear' };
    const turn = {
      turnNumber: 5,
      perspective: 'henry-wu',
      question: 'Ready?',
      mcOptions: [],
      userAnswer: 'Yes',
      freeformText: undefined,
      ambiguityScoreSnapshot: scores,
      model: 'claude-3-5-haiku-20241022',
      allCandidates: [],
      timestamp: new Date().toISOString(),
    };

    mockSubmitAnswer.mockResolvedValue({ turn, scores, nextQuestion: null, thresholdMet: true });

    const ctx = makeCtx({ interviewRow: { turnCount: 4 } });
    const result = await callMutation('sendAnswer', { projectId: 'project-abc', answer: 'Yes' }, ctx);

    expect(result.thresholdMet).toBe(true);
    expect(result.phase).toBe('reviewing');
    expect(result.nextQuestion).toBeNull();
  });

  it('throws when no interview exists for the project', async () => {
    const ctx = makeCtx({ interviewRow: null });

    await expect(
      callMutation('sendAnswer', { projectId: 'project-abc', answer: 'Some answer' }, ctx),
    ).rejects.toThrow('No active interview found for project project-abc');

    // FSM should NOT be instantiated when interview lookup fails
    expect(MockInterviewFSM).not.toHaveBeenCalled();
    expect(mockSubmitAnswer).not.toHaveBeenCalled();
  });

  it('throws when interview is not in gathering phase without calling engine', async () => {
    const ctx = makeCtx({ interviewRow: { phase: 'reviewing' } });

    await expect(
      callMutation('sendAnswer', { projectId: 'project-abc', answer: 'Some answer' }, ctx),
    ).rejects.toThrow("Cannot submit answer: interview is in phase 'reviewing', expected 'gathering'");

    // getEngineDeps should NOT be called (fast-fail before engine init)
    expect(ctx.getEngineDeps).not.toHaveBeenCalled();
    expect(MockInterviewFSM).not.toHaveBeenCalled();
  });
});

describe('startInterview tRPC mutation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls InterviewFSM.startOrResume with projectId and mode', async () => {
    mockStartOrResume.mockResolvedValue({
      id: 'interview-new',
      mode: 'greenfield',
      status: 'active',
      phase: 'gathering',
    });
    const ctx = makeCtx();
    const result = await callMutation('startInterview', { projectId: 'project-abc', mode: 'greenfield' }, ctx);
    expect(MockInterviewFSM).toHaveBeenCalledWith(ctx.db, mockGateway, mockConfig, mockLogger);
    expect(mockStartOrResume).toHaveBeenCalledWith('project-abc', { mode: 'greenfield' });
    expect(result).toMatchObject({
      interviewId: 'interview-new',
      mode: 'greenfield',
      status: 'active',
      phase: 'gathering',
    });
  });

  it('works without mode parameter (defaults to undefined)', async () => {
    mockStartOrResume.mockResolvedValue({
      id: 'interview-new',
      mode: 'greenfield',
      status: 'active',
      phase: 'gathering',
    });
    const ctx = makeCtx();
    await callMutation('startInterview', { projectId: 'project-abc' }, ctx);
    expect(mockStartOrResume).toHaveBeenCalledWith('project-abc', { mode: undefined });
  });
});

describe('approveSummary tRPC mutation — crystallizeSeed wiring', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const validSummary = {
    goal: 'Build a CLI tool',
    constraints: [{ text: 'Must be fast' }],
    acceptanceCriteria: [{ text: 'Renames files' }],
    ontologySchema: { entities: [{ name: 'File', attributes: ['path'], relations: [] }] },
    evaluationPrinciples: [{ text: 'Performance' }],
    exitConditions: [{ condition: 'done', description: 'All files renamed' }],
  };

  it('calls crystallizeSeed with correct arguments', async () => {
    mockCrystallizeSeed.mockResolvedValue({ id: 'seed-123', version: 1 });
    const ctx = makeCtx({ interviewRow: { phase: 'reviewing', currentAmbiguityScore: { overall: 0.85 } } });
    const result = await callMutation('approveSummary', { projectId: 'project-abc', summary: validSummary }, ctx);

    expect(mockCrystallizeSeed).toHaveBeenCalledWith(
      ctx.db,
      'interview-123',
      'project-abc',
      validSummary,
      0.85,
    );
    expect(result).toEqual({ seedId: 'seed-123', version: 1 });
  });

  it('converts ImmutableSeedError to TRPCError CONFLICT', async () => {
    // Import the mock ImmutableSeedError class from the mock
    const { ImmutableSeedError } = await import('@get-cauldron/engine');
    mockCrystallizeSeed.mockRejectedValue(new ImmutableSeedError('seed-dup'));
    const ctx = makeCtx({ interviewRow: { phase: 'reviewing', currentAmbiguityScore: { overall: 0.9 } } });

    await expect(
      callMutation('approveSummary', { projectId: 'project-abc', summary: validSummary }, ctx),
    ).rejects.toThrow(/crystallized and cannot be mutated/);
  });

  it('transitions reviewing -> approved before calling crystallizeSeed', async () => {
    mockCrystallizeSeed.mockResolvedValue({ id: 'seed-456', version: 1 });
    const ctx = makeCtx({ interviewRow: { phase: 'reviewing', currentAmbiguityScore: { overall: 0.8 } } });
    await callMutation('approveSummary', { projectId: 'project-abc', summary: validSummary }, ctx);

    // db.update should be called for the reviewing->approved transition
    expect(ctx.db.update).toHaveBeenCalled();
  });
});
