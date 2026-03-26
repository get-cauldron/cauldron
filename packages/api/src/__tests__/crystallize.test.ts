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

// Mock @cauldron/engine — InterviewFSM must be a class-compatible mock
vi.mock('@cauldron/engine', () => {
  const MockInterviewFSM = vi.fn(function () {
    return {
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

// Mock seed-writer
vi.mock('../review/seed-writer.js', () => ({
  readSeedDraft: vi.fn(),
}));

// Mock bootstrap
vi.mock('../bootstrap.js', () => ({
  bootstrap: vi.fn(),
}));

describe('crystallizeCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.argv = ['node', 'cli.ts', 'crystallize', '--project-id', 'test-project-123'];
  });

  it('Test 1: reads seed draft file via readSeedDraft', async () => {
    const { InterviewFSM } = await import('@cauldron/engine');
    const { bootstrap } = await import('../bootstrap.js');
    const { readSeedDraft } = await import('../review/seed-writer.js');

    const mockSeedSummary = {
      goal: 'Build a rename tool',
      constraints: [],
      acceptanceCriteria: [],
      ontologySchema: { entities: [] },
      evaluationPrinciples: [],
      exitConditions: {},
    };

    (readSeedDraft as ReturnType<typeof vi.fn>).mockResolvedValue(mockSeedSummary);

    const mockInterview = { id: 'interview-id-abc', phase: 'reviewing', projectId: 'test-project-123' };
    const mockDbQuery = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockInterview]),
    };

    const mockDb = {
      select: vi.fn().mockReturnValue(mockDbQuery),
    };

    (bootstrap as ReturnType<typeof vi.fn>).mockResolvedValue({
      db: mockDb,
      gateway: {},
      config: {},
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      inngest: {},
    });

    const mockFsmInstance = {
      approveAndCrystallize: vi.fn().mockResolvedValue({ id: 'seed-id-xyz' }),
    };
    (InterviewFSM as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return mockFsmInstance;
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { crystallizeCommand } = await import('../commands/crystallize.js');
    await crystallizeCommand();

    expect(readSeedDraft).toHaveBeenCalledWith(
      expect.any(String), // projectRoot (cwd)
      'test-project-123',
    );

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('Test 2: calls fsm.approveAndCrystallize with interview and project IDs', async () => {
    const { InterviewFSM } = await import('@cauldron/engine');
    const { bootstrap } = await import('../bootstrap.js');
    const { readSeedDraft } = await import('../review/seed-writer.js');

    const mockSeedSummary = {
      goal: 'AI dev platform',
      constraints: ['TypeScript only'],
      acceptanceCriteria: ['End-to-end pipeline works'],
      ontologySchema: { entities: [] },
      evaluationPrinciples: [],
      exitConditions: {},
    };

    (readSeedDraft as ReturnType<typeof vi.fn>).mockResolvedValue(mockSeedSummary);

    const mockInterview = { id: 'interview-reviewing-123', phase: 'reviewing', projectId: 'test-project-123' };
    const mockDbQuery = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockInterview]),
    };

    const mockDb = {
      select: vi.fn().mockReturnValue(mockDbQuery),
    };

    (bootstrap as ReturnType<typeof vi.fn>).mockResolvedValue({
      db: mockDb,
      gateway: {},
      config: {},
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      inngest: {},
    });

    const mockFsmInstance = {
      approveAndCrystallize: vi.fn().mockResolvedValue({ id: 'crystallized-seed-456' }),
    };
    (InterviewFSM as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return mockFsmInstance;
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { crystallizeCommand } = await import('../commands/crystallize.js');
    await crystallizeCommand();

    expect(mockFsmInstance.approveAndCrystallize).toHaveBeenCalledWith(
      'interview-reviewing-123',
      'test-project-123',
      mockSeedSummary,
    );

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('Test 3: exits with error when seed draft file does not exist', async () => {
    const { bootstrap } = await import('../bootstrap.js');
    const { readSeedDraft } = await import('../review/seed-writer.js');

    // readSeedDraft throws when file not found
    (readSeedDraft as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("ENOENT: no such file or directory, open '/path/to/seed-draft.json'"),
    );

    (bootstrap as ReturnType<typeof vi.fn>).mockResolvedValue({
      db: { select: vi.fn() },
      gateway: {},
      config: {},
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      inngest: {},
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { crystallizeCommand } = await import('../commands/crystallize.js');
    await crystallizeCommand();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('No seed draft found'),
    );
    expect(process.exit).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('Test 4: prints crystallized seed ID on success', async () => {
    const { InterviewFSM } = await import('@cauldron/engine');
    const { bootstrap } = await import('../bootstrap.js');
    const { readSeedDraft } = await import('../review/seed-writer.js');

    const mockSeedSummary = {
      goal: 'Build renaming tool',
      constraints: [],
      acceptanceCriteria: [],
      ontologySchema: { entities: [] },
      evaluationPrinciples: [],
      exitConditions: {},
    };

    (readSeedDraft as ReturnType<typeof vi.fn>).mockResolvedValue(mockSeedSummary);

    const mockInterview = { id: 'interview-final-789', phase: 'reviewing', projectId: 'test-project-123' };
    const mockDbQuery = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockInterview]),
    };

    const mockDb = {
      select: vi.fn().mockReturnValue(mockDbQuery),
    };

    (bootstrap as ReturnType<typeof vi.fn>).mockResolvedValue({
      db: mockDb,
      gateway: {},
      config: {},
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      inngest: {},
    });

    const mockFsmInstance = {
      approveAndCrystallize: vi.fn().mockResolvedValue({ id: 'SEED-final-999' }),
    };
    (InterviewFSM as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return mockFsmInstance;
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { crystallizeCommand } = await import('../commands/crystallize.js');
    await crystallizeCommand();

    const logCalls = (consoleSpy.mock.calls as string[][]).map(c => String(c[0]));
    expect(logCalls.some(line => line.includes('SEED-final-999'))).toBe(true);

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
