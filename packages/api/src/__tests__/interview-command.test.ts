import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @cauldron/shared to prevent DATABASE_URL error at import time
vi.mock('@cauldron/shared', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  },
  interviews: {},
  eq: vi.fn(),
  desc: vi.fn(),
}));

// Mock @cauldron/engine
vi.mock('@cauldron/engine', () => {
  const MockInterviewFSM = vi.fn(function () {
    return {
      startOrResume: vi.fn(),
      submitAnswer: vi.fn(),
      generateSummary: vi.fn(),
      approveAndCrystallize: vi.fn(),
    };
  });
  return {
    InterviewFSM: MockInterviewFSM,
    loadConfig: vi.fn(),
    LLMGateway: vi.fn(function () { return { streamText: vi.fn() }; }),
    inngest: {},
    configureSchedulerDeps: vi.fn(),
    configureVaultDeps: vi.fn(),
  };
});

// Mock pino
vi.mock('pino', () => ({
  default: vi.fn(() => ({ level: 'info', info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
}));

// Mock context-bridge
vi.mock('../context-bridge.js', () => ({
  readPlanningArtifacts: vi.fn(),
  extractRequirementIds: vi.fn(),
}));

// Mock seed-writer
vi.mock('../review/seed-writer.js', () => ({
  writeSeedDraft: vi.fn(),
  readSeedDraft: vi.fn(),
}));

// Mock bootstrap
vi.mock('../bootstrap.js', () => ({
  bootstrap: vi.fn(),
}));

// Mock readline
vi.mock('node:readline', () => ({
  createInterface: vi.fn(),
}));

describe('interviewCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset process.argv
    process.argv = ['node', 'cli.ts', 'interview', '--project-id', 'test-project-123'];
  });

  it('Test 4: creates InterviewFSM and calls startOrResume with brownfield mode when .planning/ exists', async () => {
    const { InterviewFSM } = await import('@cauldron/engine');
    const { bootstrap } = await import('../bootstrap.js');
    const { readPlanningArtifacts } = await import('../context-bridge.js');
    const { writeSeedDraft } = await import('../review/seed-writer.js');

    const mockFsmInstance = {
      startOrResume: vi.fn().mockResolvedValue({ id: 'interview-id-1', phase: 'gathering' }),
      submitAnswer: vi.fn().mockResolvedValue({
        turn: { question: 'What is the goal?' },
        scores: { overall: 0.9 },
        thresholdMet: true,
        nextQuestion: null,
      }),
      generateSummary: vi.fn().mockResolvedValue({
        goal: 'Build a renaming tool',
        constraints: [],
        acceptanceCriteria: [],
        ontologySchema: { entities: [] },
        evaluationPrinciples: [],
        exitConditions: {},
      }),
    };

    (InterviewFSM as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return mockFsmInstance;
    });

    (bootstrap as ReturnType<typeof vi.fn>).mockResolvedValue({
      db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
      gateway: {},
      config: {},
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      inngest: {},
    });

    // Simulate prior context existing (brownfield)
    (readPlanningArtifacts as ReturnType<typeof vi.fn>).mockResolvedValue('## Project Context\nExisting project data');
    (writeSeedDraft as ReturnType<typeof vi.fn>).mockResolvedValue('/path/to/seed-draft.json');

    // Mock readline to return one answer then close
    const { createInterface } = await import('node:readline');
    const mockRl = {
      question: vi.fn((prompt: string, cb: (answer: string) => void) => {
        cb('My answer to the question');
      }),
      close: vi.fn(),
      [Symbol.asyncIterator]: vi.fn(),
    };
    (createInterface as ReturnType<typeof vi.fn>).mockReturnValue(mockRl);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);

    const { interviewCommand } = await import('../commands/interview.js');
    await interviewCommand();

    expect(bootstrap).toHaveBeenCalled();
    expect(readPlanningArtifacts).toHaveBeenCalled();
    expect(mockFsmInstance.startOrResume).toHaveBeenCalledWith(
      'test-project-123',
      expect.objectContaining({ mode: 'brownfield' }),
    );

    exitSpy.mockRestore();
  });

  it('Test 5: injects prior context before interview loop when .planning/ has content', async () => {
    const { InterviewFSM } = await import('@cauldron/engine');
    const { bootstrap } = await import('../bootstrap.js');
    const { readPlanningArtifacts } = await import('../context-bridge.js');
    const { writeSeedDraft } = await import('../review/seed-writer.js');

    const mockDb = {
      select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) }) }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      insert: vi.fn(),
    };

    (bootstrap as ReturnType<typeof vi.fn>).mockResolvedValue({
      db: mockDb,
      gateway: {},
      config: {},
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      inngest: {},
    });

    const priorContext = '## Project Context\nCauldron AI platform decisions';
    (readPlanningArtifacts as ReturnType<typeof vi.fn>).mockResolvedValue(priorContext);
    (writeSeedDraft as ReturnType<typeof vi.fn>).mockResolvedValue('/path/to/draft.json');

    const mockFsmInstance = {
      startOrResume: vi.fn().mockResolvedValue({ id: 'interview-id-2', phase: 'gathering' }),
      submitAnswer: vi.fn().mockResolvedValue({
        turn: { question: 'What constraints apply?' },
        scores: { overall: 0.85 },
        thresholdMet: true,
        nextQuestion: null,
      }),
      generateSummary: vi.fn().mockResolvedValue({
        goal: 'AI development platform',
        constraints: [],
        acceptanceCriteria: [],
        ontologySchema: { entities: [] },
        evaluationPrinciples: [],
        exitConditions: {},
      }),
    };
    (InterviewFSM as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return mockFsmInstance;
    });

    const { createInterface } = await import('node:readline');
    const mockRl = {
      question: vi.fn((prompt: string, cb: (answer: string) => void) => cb('Context answer')),
      close: vi.fn(),
    };
    (createInterface as ReturnType<typeof vi.fn>).mockReturnValue(mockRl);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { interviewCommand } = await import('../commands/interview.js');
    await interviewCommand();

    // Verify prior context was used (brownfield mode when context exists)
    expect(mockFsmInstance.startOrResume).toHaveBeenCalledWith(
      'test-project-123',
      expect.objectContaining({ mode: 'brownfield' }),
    );

    // Verify writeSeedDraft was called after threshold met
    expect(writeSeedDraft).toHaveBeenCalled();

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
