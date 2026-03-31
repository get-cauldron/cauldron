import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @get-cauldron/shared to prevent DATABASE_URL error at import time
vi.mock('@get-cauldron/shared', () => ({
  db: {
    execute: vi.fn(),
  },
  ensureMigrations: vi.fn().mockResolvedValue(undefined),
}));

const mockRedisInstance = {
  ping: vi.fn(),
  quit: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn(),
};

vi.mock('ioredis', () => ({
  default: vi.fn(function MockRedis() {
    return mockRedisInstance;
  }),
}));

const mockExecFile = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));

const mockIsServerRunning = vi.fn();
vi.mock('../server-check.js', () => ({
  isServerRunning: mockIsServerRunning,
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('healthCheck', () => {
  let healthCheck: () => Promise<void>;
  let mockDb: { execute: ReturnType<typeof vi.fn> };
  const originalEnv = process.env;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgres://cauldron:cauldron@localhost:5432/cauldron',
      REDIS_URL: 'redis://localhost:6379',
      INNGEST_DEV: '1',
      ANTHROPIC_API_KEY: 'test-key',
      HOLDOUT_ENCRYPTION_KEY: 'test-holdout-key',
    };
    // Re-import to get fresh module with cleared mocks
    const mod = await import('../health.js');
    healthCheck = mod.healthCheck;

    const shared = await import('@get-cauldron/shared');
    mockDb = shared.db as unknown as { execute: ReturnType<typeof vi.fn> };

    mockRedisInstance.ping.mockResolvedValue('PONG');
    mockExecFile.mockImplementation((_file, _args, cb) => cb(null));
    mockIsServerRunning.mockResolvedValue(true);
  });

  it('Test 1: succeeds when all required pre-execution checks pass', async () => {
    // First call: SELECT 1 (connectivity), second call: pg_tables (schema check)
    mockDb.execute
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce([
        { tablename: 'projects' }, { tablename: 'seeds' }, { tablename: 'interviews' },
        { tablename: 'beads' }, { tablename: 'bead_edges' }, { tablename: 'events' },
        { tablename: 'holdout_vault' }, { tablename: 'project_snapshots' },
      ]);
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(healthCheck()).resolves.toBeUndefined();
    expect(mockRedisInstance.ping).toHaveBeenCalledTimes(1);
    expect(mockExecFile).toHaveBeenCalledWith(
      'codebase-memory-mcp',
      ['--version'],
      expect.any(Function)
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8288/v1/events',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '[]',
      })
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/api/inngest',
      expect.objectContaining({ method: 'GET' })
    );
    expect(mockIsServerRunning).toHaveBeenCalledWith('http://localhost:3000');
    expect(consoleSpy).toHaveBeenCalledWith('All required pre-execution checks passed');

    consoleSpy.mockRestore();
  });

  it('Test 2: exits with error when DB query fails', async () => {
    mockDb.execute.mockRejectedValueOnce(new Error('Connection refused'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);

    await healthCheck();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('PostgreSQL not reachable')
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('Test 3: exits with error when Inngest endpoint is unreachable', async () => {
    mockDb.execute
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce([
        { tablename: 'projects' }, { tablename: 'seeds' }, { tablename: 'interviews' },
        { tablename: 'beads' }, { tablename: 'bead_edges' }, { tablename: 'events' },
        { tablename: 'holdout_vault' }, { tablename: 'project_snapshots' },
      ]);
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);

    await healthCheck();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Inngest dev server not reachable')
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('Test 4: exits with error when codebase-memory-mcp is unavailable', async () => {
    mockDb.execute
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce([
        { tablename: 'projects' }, { tablename: 'seeds' }, { tablename: 'interviews' },
        { tablename: 'beads' }, { tablename: 'bead_edges' }, { tablename: 'events' },
        { tablename: 'holdout_vault' }, { tablename: 'project_snapshots' },
      ]);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    mockExecFile.mockImplementationOnce((_file, _args, cb) => cb(new Error('ENOENT')));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);

    await healthCheck();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('codebase-memory-mcp not available')
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('Test 5: exits with error when web server is unreachable', async () => {
    mockDb.execute
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce([
        { tablename: 'projects' }, { tablename: 'seeds' }, { tablename: 'interviews' },
        { tablename: 'beads' }, { tablename: 'bead_edges' }, { tablename: 'events' },
        { tablename: 'holdout_vault' }, { tablename: 'project_snapshots' },
      ]);
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    mockIsServerRunning.mockResolvedValueOnce(false);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);

    await healthCheck();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cauldron web server not reachable')
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
