import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules that execute.ts imports
vi.mock('hono', () => {
  const mockHonoInstance = { on: vi.fn().mockReturnThis(), fetch: vi.fn() };
  function Hono(this: unknown) {
    return mockHonoInstance;
  }
  return { Hono: vi.fn(Hono) };
});

vi.mock('@hono/node-server', () => ({
  serve: vi.fn().mockReturnValue({ close: vi.fn() }),
}));

vi.mock('inngest/hono', () => ({
  serve: vi.fn().mockReturnValue(vi.fn()),
}));

// Mock @cauldron/shared
vi.mock('@cauldron/shared', () => ({
  db: { select: vi.fn(), update: vi.fn() },
  seeds: {},
  beads: {},
  eq: vi.fn(),
  desc: vi.fn(),
  and: vi.fn(),
}));

// Mock @cauldron/engine
vi.mock('@cauldron/engine', () => ({
  loadConfig: vi.fn(),
  LLMGateway: vi.fn(function () { return {}; }),
  inngest: { send: vi.fn() },
  configureSchedulerDeps: vi.fn(),
  configureVaultDeps: vi.fn(),
  findReadyBeads: vi.fn(),
  handleBeadDispatchRequested: { id: 'mock-dispatch' },
  handleBeadCompleted: { id: 'mock-completion' },
  handleMergeRequested: { id: 'mock-merge' },
  handleEvolutionConverged: { id: 'mock-convergence' },
}));

// Mock pino
vi.mock('pino', () => ({
  default: vi.fn(() => ({ level: 'info', info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
}));

// Mock bootstrap
vi.mock('../bootstrap.js', () => ({
  bootstrap: vi.fn(),
}));

// Mock self-build
vi.mock('../self-build.js', () => ({
  captureEngineSnapshot: vi.fn().mockReturnValue('a'.repeat(40)),
  detectEngineChange: vi.fn().mockReturnValue(false),
  hasMigrationFiles: vi.fn().mockReturnValue(false),
}));

describe('executeCommand', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // After clearAllMocks, restore return values for infrastructure mocks
    const nodeSrvPkg = await import('@hono/node-server');
    (nodeSrvPkg.serve as ReturnType<typeof vi.fn>).mockReturnValue({ close: vi.fn() });
    const inngestHonoPkg = await import('inngest/hono');
    (inngestHonoPkg.serve as ReturnType<typeof vi.fn>).mockReturnValue(vi.fn());
    const selfBuildPkg = await import('../self-build.js');
    (selfBuildPkg.captureEngineSnapshot as ReturnType<typeof vi.fn>).mockReturnValue('a'.repeat(40));
    (selfBuildPkg.detectEngineChange as ReturnType<typeof vi.fn>).mockReturnValue(false);

    process.argv = ['node', 'cli.ts', 'execute', '--project-id', 'project-exec-123'];
  });

  it('Test 6: executeCommand dispatches ready beads via inngest.send', async () => {
    const { findReadyBeads } = await import('@cauldron/engine');
    const { bootstrap } = await import('../bootstrap.js');

    const mockSeed = { id: 'seed-exec-1', projectId: 'project-exec-123', status: 'crystallized' };
    const mockReadyBeads = [
      { id: 'bead-ready-1', seedId: 'seed-exec-1' },
      { id: 'bead-ready-2', seedId: 'seed-exec-1' },
    ];

    const mockSeedDbQuery = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockSeed]),
    };

    const mockDb = {
      select: vi.fn().mockReturnValue(mockSeedDbQuery),
      update: vi.fn(),
    };

    const mockInngest = { send: vi.fn().mockResolvedValue(undefined) };

    (findReadyBeads as ReturnType<typeof vi.fn>).mockResolvedValue(mockReadyBeads);

    (bootstrap as ReturnType<typeof vi.fn>).mockResolvedValue({
      db: mockDb,
      gateway: {},
      config: { selfBuild: false },
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      inngest: mockInngest,
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { executeCommand } = await import('../commands/execute.js');
    await executeCommand();

    expect(mockInngest.send).toHaveBeenCalledTimes(2);
    expect(mockInngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'bead.dispatch_requested',
        data: expect.objectContaining({ beadId: 'bead-ready-1' }),
      })
    );

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('Test 7: executeCommand with --resume re-dispatches pending/failed beads only', async () => {
    process.argv = ['node', 'cli.ts', 'execute', '--project-id', 'project-exec-123', '--resume'];

    const { findReadyBeads } = await import('@cauldron/engine');
    const { bootstrap } = await import('../bootstrap.js');

    const mockSeed = { id: 'seed-exec-2', projectId: 'project-exec-123', status: 'crystallized' };
    const mockReadyBeads = [{ id: 'bead-resumed-1', seedId: 'seed-exec-2' }];

    const mockSeedDbQuery = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockSeed]),
    };

    const mockUpdateWhere = vi.fn().mockResolvedValue([]);
    const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
    const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

    const mockDb = {
      select: vi.fn().mockReturnValue(mockSeedDbQuery),
      update: mockUpdate,
    };

    const mockInngest = { send: vi.fn().mockResolvedValue(undefined) };

    (findReadyBeads as ReturnType<typeof vi.fn>).mockResolvedValue(mockReadyBeads);

    (bootstrap as ReturnType<typeof vi.fn>).mockResolvedValue({
      db: mockDb,
      gateway: {},
      config: { selfBuild: false },
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      inngest: mockInngest,
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { executeCommand } = await import('../commands/execute.js');
    await executeCommand();

    // Should have updated failed beads back to pending
    expect(mockUpdate).toHaveBeenCalled();
    // Should have dispatched ready beads
    expect(mockInngest.send).toHaveBeenCalledTimes(1);

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('Test 8: executeCommand starts Hono server on port 3001 when selfBuild is false', async () => {
    const { findReadyBeads } = await import('@cauldron/engine');
    const { bootstrap } = await import('../bootstrap.js');
    const { Hono } = await import('hono');
    const { serve } = await import('@hono/node-server');

    const mockSeed = { id: 'seed-exec-3', projectId: 'project-exec-123', status: 'crystallized' };

    const mockSeedDbQuery = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockSeed]),
    };

    const mockDb = {
      select: vi.fn().mockReturnValue(mockSeedDbQuery),
      update: vi.fn(),
    };

    const mockInngest = { send: vi.fn().mockResolvedValue(undefined) };

    (findReadyBeads as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    (bootstrap as ReturnType<typeof vi.fn>).mockResolvedValue({
      db: mockDb,
      gateway: {},
      config: { selfBuild: false },
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      inngest: mockInngest,
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { executeCommand } = await import('../commands/execute.js');
    await executeCommand();

    expect(Hono).toHaveBeenCalled();
    expect(serve).toHaveBeenCalledWith(
      expect.objectContaining({ port: 3001 })
    );

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('Test 9: executeCommand captures engine snapshot when selfBuild is true', async () => {
    const { findReadyBeads } = await import('@cauldron/engine');
    const { bootstrap } = await import('../bootstrap.js');
    const { captureEngineSnapshot } = await import('../self-build.js');

    const mockSeed = { id: 'seed-exec-4', projectId: 'project-exec-123', status: 'crystallized' };

    const mockSeedDbQuery = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockSeed]),
    };

    const mockDb = {
      select: vi.fn().mockReturnValue(mockSeedDbQuery),
      update: vi.fn(),
    };

    const mockInngest = { send: vi.fn().mockResolvedValue(undefined) };

    (findReadyBeads as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    (bootstrap as ReturnType<typeof vi.fn>).mockResolvedValue({
      db: mockDb,
      gateway: {},
      config: { selfBuild: true },
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      inngest: mockInngest,
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { executeCommand } = await import('../commands/execute.js');
    await executeCommand();

    expect(captureEngineSnapshot).toHaveBeenCalled();

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
