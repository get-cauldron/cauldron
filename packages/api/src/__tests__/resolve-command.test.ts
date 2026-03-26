import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

// Mock @cauldron/shared to prevent DATABASE_URL error at import time
vi.mock('@cauldron/shared', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
  beads: {},
  seeds: {},
  eq: vi.fn(),
  appendEvent: vi.fn(),
}));

// Mock @cauldron/engine
vi.mock('@cauldron/engine', () => ({
  loadConfig: vi.fn(),
  LLMGateway: vi.fn(function () { return {}; }),
  inngest: {},
  configureSchedulerDeps: vi.fn(),
  configureVaultDeps: vi.fn(),
}));

// Mock pino
vi.mock('pino', () => ({
  default: vi.fn(() => ({ level: 'info', info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
}));

// Mock bootstrap
vi.mock('../bootstrap.js', () => ({
  bootstrap: vi.fn(),
}));

describe('resolveCommand', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = join(tmpdir(), `cauldron-resolve-test-${randomBytes(8).toString('hex')}`);
    mkdirSync(tempDir, { recursive: true });
    process.argv = ['node', 'cli.ts', 'resolve', 'bead-conflict-456'];
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('Test 4: resolveCommand reads conflict diff, marks bead for re-merge, appends conflict_resolved event', async () => {
    const { appendEvent } = await import('@cauldron/shared');
    const { bootstrap } = await import('../bootstrap.js');

    // Create conflict file
    const reviewDir = join(tempDir, '.cauldron', 'review');
    mkdirSync(reviewDir, { recursive: true });
    writeFileSync(join(reviewDir, 'conflict-bead-conflict-456.diff'), 'resolved content', 'utf-8');

    const mockBead = { id: 'bead-conflict-456', seedId: 'seed-abc', status: 'failed' };
    const mockSeed = { projectId: 'project-resolve-abc' };

    // First call: beads query → returns bead
    const mockBeadDbQuery = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockBead]),
    };

    // Second call: seeds query → returns seed with projectId
    const mockSeedDbQuery = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockSeed]),
    };

    const mockUpdateQuery = {
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };

    const mockDb = {
      select: vi.fn()
        .mockReturnValueOnce(mockBeadDbQuery)
        .mockReturnValueOnce(mockSeedDbQuery),
      update: vi.fn().mockReturnValue(mockUpdateQuery),
    };

    (appendEvent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    (bootstrap as ReturnType<typeof vi.fn>).mockResolvedValue({
      db: mockDb,
      gateway: {},
      config: {},
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      inngest: {},
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Set project root to use temp dir for conflict file lookup
    process.argv = ['node', 'cli.ts', 'resolve', 'bead-conflict-456', '--project-root', tempDir];

    const { resolveCommand } = await import('../commands/resolve.js');
    await resolveCommand();

    expect(appendEvent).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        type: 'conflict_resolved',
        payload: expect.objectContaining({ beadId: 'bead-conflict-456' }),
      })
    );

    const logCalls = (consoleSpy.mock.calls as string[][]).map(c => String(c[0]));
    expect(logCalls.some(line => line.includes('bead-conflict-456'))).toBe(true);

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('Test 5: exits with error when no conflict file found', async () => {
    const { bootstrap } = await import('../bootstrap.js');

    const mockDb = {
      select: vi.fn(),
      update: vi.fn(),
    };

    (bootstrap as ReturnType<typeof vi.fn>).mockResolvedValue({
      db: mockDb,
      gateway: {},
      config: {},
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      inngest: {},
    });

    // No conflict file exists in tempDir
    process.argv = ['node', 'cli.ts', 'resolve', 'bead-no-conflict-789', '--project-root', tempDir];

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { resolveCommand } = await import('../commands/resolve.js');
    await resolveCommand();

    expect(process.exit).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
