import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @cauldron/shared to prevent DATABASE_URL error at import time
vi.mock('@cauldron/shared', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  },
  seeds: {},
  eq: vi.fn(),
  desc: vi.fn(),
  and: vi.fn(),
}));

// Mock @cauldron/engine
vi.mock('@cauldron/engine', () => ({
  runDecomposition: vi.fn(),
  loadConfig: vi.fn(),
  LLMGateway: vi.fn(function () { return {}; }),
  inngest: { send: vi.fn() },
  configureSchedulerDeps: vi.fn(),
  configureVaultDeps: vi.fn(),
  generateHoldoutScenarios: vi.fn(),
  createVault: vi.fn(),
  approveScenarios: vi.fn(),
  sealVault: vi.fn(),
  findReadyBeads: vi.fn(),
  handleBeadDispatchRequested: {},
  handleBeadCompleted: {},
  handleEvolutionConverged: {},
}));

// Mock pino
vi.mock('pino', () => ({
  default: vi.fn(() => ({ level: 'info', info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
}));

// Mock bootstrap
vi.mock('../bootstrap.js', () => ({
  bootstrap: vi.fn(),
}));

describe('decomposeCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.argv = ['node', 'cli.ts', 'decompose', '--project-id', 'project-abc-123'];
  });

  it('Test 1: calls runDecomposition with seed and project context', async () => {
    const { runDecomposition } = await import('@cauldron/engine');
    const { bootstrap } = await import('../bootstrap.js');

    const mockSeed = {
      id: 'seed-id-001',
      projectId: 'project-abc-123',
      status: 'crystallized',
      goal: 'Build a rename tool',
      constraints: [],
      acceptanceCriteria: [],
    };

    const mockDbQuery = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockSeed]),
    };

    const mockDb = {
      select: vi.fn().mockReturnValue(mockDbQuery),
    };

    const mockInngest = { send: vi.fn() };

    (bootstrap as ReturnType<typeof vi.fn>).mockResolvedValue({
      db: mockDb,
      gateway: { generateObject: vi.fn() },
      config: {},
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      inngest: mockInngest,
    });

    (runDecomposition as ReturnType<typeof vi.fn>).mockResolvedValue({
      dispatchedBeadIds: ['bead-1', 'bead-2', 'bead-3'],
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { decomposeCommand } = await import('../commands/decompose.js');
    await decomposeCommand();

    expect(runDecomposition).toHaveBeenCalledWith(
      expect.objectContaining({
        seed: mockSeed,
        projectId: 'project-abc-123',
        tokenBudget: 180_000,
      })
    );

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('Test 2: prints dispatched bead count on success', async () => {
    const { runDecomposition } = await import('@cauldron/engine');
    const { bootstrap } = await import('../bootstrap.js');

    const mockSeed = {
      id: 'seed-id-002',
      projectId: 'project-abc-123',
      status: 'crystallized',
      goal: 'Build a rename tool',
    };

    const mockDbQuery = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockSeed]),
    };

    const mockDb = {
      select: vi.fn().mockReturnValue(mockDbQuery),
    };

    (bootstrap as ReturnType<typeof vi.fn>).mockResolvedValue({
      db: mockDb,
      gateway: {},
      config: {},
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      inngest: { send: vi.fn() },
    });

    (runDecomposition as ReturnType<typeof vi.fn>).mockResolvedValue({
      dispatchedBeadIds: ['bead-a', 'bead-b'],
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { decomposeCommand } = await import('../commands/decompose.js');
    await decomposeCommand();

    const logCalls = (consoleSpy.mock.calls as string[][]).map(c => String(c[0]));
    expect(logCalls.some(line => line.includes('2'))).toBe(true);

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('Test 3: exits with error when no crystallized seed found', async () => {
    const { bootstrap } = await import('../bootstrap.js');

    const mockDbQuery = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };

    const mockDb = {
      select: vi.fn().mockReturnValue(mockDbQuery),
    };

    (bootstrap as ReturnType<typeof vi.fn>).mockResolvedValue({
      db: mockDb,
      gateway: {},
      config: {},
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      inngest: { send: vi.fn() },
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { decomposeCommand } = await import('../commands/decompose.js');
    await decomposeCommand();

    expect(process.exit).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
