import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @get-cauldron/shared to prevent DATABASE_URL error at import time
vi.mock('@get-cauldron/shared', () => ({
  db: {
    execute: vi.fn(),
  },
  ensureMigrations: vi.fn().mockResolvedValue(undefined),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('healthCheck', () => {
  let healthCheck: () => Promise<void>;
  let mockDb: { execute: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-import to get fresh module with cleared mocks
    const mod = await import('../health.js');
    healthCheck = mod.healthCheck;

    const shared = await import('@get-cauldron/shared');
    mockDb = shared.db as unknown as { execute: ReturnType<typeof vi.fn> };
  });

  it('Test 1: succeeds when DB query returns and Inngest endpoint responds 200', async () => {
    // First call: SELECT 1 (connectivity), second call: pg_tables (schema check)
    mockDb.execute
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce([
        { tablename: 'projects' }, { tablename: 'seeds' }, { tablename: 'interviews' },
        { tablename: 'beads' }, { tablename: 'bead_edges' }, { tablename: 'events' },
        { tablename: 'holdout_vault' }, { tablename: 'project_snapshots' },
      ]);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(healthCheck()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith('All services healthy');

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
    mockDb.execute.mockResolvedValueOnce([{ '?column?': 1 }]);
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
});
