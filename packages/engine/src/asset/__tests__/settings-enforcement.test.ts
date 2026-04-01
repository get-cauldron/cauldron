import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssetModeDisabledError, AssetConcurrencyLimitError } from '../errors.js';

// ---- Mock @get-cauldron/shared before importing job-store ----
const { mockSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
}));

vi.mock('@get-cauldron/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@get-cauldron/shared')>();
  return {
    ...actual,
    appendEvent: vi.fn(),
  };
});

import { checkAssetMode, checkAssetConcurrency } from '../job-store.js';

// ---- Helpers ----

/**
 * Build a mock DB that returns the given project settings row.
 * Used for checkAssetMode and checkAssetConcurrency tests.
 */
function makeProjectSettingsDb(settings: Record<string, unknown> | null) {
  const projectRow = settings !== null ? [{ settings }] : [{}];
  const countRow = [{ count: 0 }];

  const selectBuilder = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(projectRow),
  };

  const db = {
    select: vi.fn().mockReturnValue(selectBuilder),
    _selectBuilder: selectBuilder,
  };

  return db as unknown as Parameters<typeof checkAssetMode>[0];
}

function makeCountDb(maxConcurrentJobs: number | undefined, activeCount: number) {
  // First call: project settings query
  // Second call: count query
  let callCount = 0;

  const projectRow = [{ settings: { asset: { maxConcurrentJobs } } }];
  const countRow = [{ count: activeCount }];

  const selectBuilder = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(callCount === 1 ? projectRow : countRow);
    }),
  };

  const db = {
    select: vi.fn().mockReturnValue(selectBuilder),
    _selectBuilder: selectBuilder,
  };

  return db as unknown as Parameters<typeof checkAssetConcurrency>[0];
}

// ---- checkAssetMode tests ----

describe('checkAssetMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws AssetModeDisabledError when mode is disabled', async () => {
    const db = makeProjectSettingsDb({ asset: { mode: 'disabled' } });
    await expect(checkAssetMode(db, 'proj-001')).rejects.toThrow(AssetModeDisabledError);
  });

  it('throws AssetModeDisabledError with the correct projectId', async () => {
    const db = makeProjectSettingsDb({ asset: { mode: 'disabled' } });
    await expect(checkAssetMode(db, 'proj-001')).rejects.toMatchObject({
      projectId: 'proj-001',
    });
  });

  it('returns "paused" when mode is paused (does not throw)', async () => {
    const db = makeProjectSettingsDb({ asset: { mode: 'paused' } });
    const result = await checkAssetMode(db, 'proj-001');
    expect(result).toBe('paused');
  });

  it('returns "active" when mode is active', async () => {
    const db = makeProjectSettingsDb({ asset: { mode: 'active' } });
    const result = await checkAssetMode(db, 'proj-001');
    expect(result).toBe('active');
  });

  it('returns "active" when mode is undefined (default)', async () => {
    const db = makeProjectSettingsDb({ asset: {} });
    const result = await checkAssetMode(db, 'proj-001');
    expect(result).toBe('active');
  });

  it('returns "active" when asset settings are entirely absent', async () => {
    const db = makeProjectSettingsDb({});
    const result = await checkAssetMode(db, 'proj-001');
    expect(result).toBe('active');
  });
});

// ---- checkAssetConcurrency tests ----

describe('checkAssetConcurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws AssetConcurrencyLimitError when active count >= maxConcurrentJobs', async () => {
    // We need a db that returns project settings with maxConcurrentJobs=2, then count=2
    const projectRow = [{ settings: { asset: { maxConcurrentJobs: 2 } } }];
    const countRow = [{ count: 2 }];

    let callCount = 0;
    const selectBuilder = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount === 1 ? projectRow : countRow);
      }),
    };

    const db = {
      select: vi.fn().mockReturnValue(selectBuilder),
    } as unknown as Parameters<typeof checkAssetConcurrency>[0];

    await expect(checkAssetConcurrency(db, 'proj-001')).rejects.toThrow(AssetConcurrencyLimitError);
  });

  it('passes (does not throw) when active count < maxConcurrentJobs', async () => {
    const projectRow = [{ settings: { asset: { maxConcurrentJobs: 5 } } }];
    const countRow = [{ count: 3 }];

    let callCount = 0;
    const selectBuilder = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount === 1 ? projectRow : countRow);
      }),
    };

    const db = {
      select: vi.fn().mockReturnValue(selectBuilder),
    } as unknown as Parameters<typeof checkAssetConcurrency>[0];

    await expect(checkAssetConcurrency(db, 'proj-001')).resolves.toBeUndefined();
  });

  it('passes when maxConcurrentJobs is undefined (no limit)', async () => {
    const projectRow = [{ settings: { asset: {} } }];

    const selectBuilder = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(projectRow),
    };

    const db = {
      select: vi.fn().mockReturnValue(selectBuilder),
    } as unknown as Parameters<typeof checkAssetConcurrency>[0];

    await expect(checkAssetConcurrency(db, 'proj-001')).resolves.toBeUndefined();
  });
});
