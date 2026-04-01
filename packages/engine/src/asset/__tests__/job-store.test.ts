import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Hoisted mock factories ----
const { mockAppendEvent } = vi.hoisted(() => ({
  mockAppendEvent: vi.fn(),
}));

vi.mock('@get-cauldron/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@get-cauldron/shared')>();
  return {
    ...actual,
    appendEvent: mockAppendEvent,
  };
});

import {
  submitAssetJob,
  claimJob,
  updateJobStatus,
  completeJob,
  failJob,
  cancelJob,
  getAssetJob,
  appendAssetEvent,
  listAssetJobs,
} from '../job-store.js';
import { AssetJobError } from '../errors.js';
import type { AssetJobParams } from '../types.js';

// ---- Helpers ----

function makeParams(overrides: Partial<AssetJobParams> = {}): AssetJobParams {
  return {
    projectId: 'proj-uuid-001',
    prompt: 'a beautiful sunset over mountains',
    width: 1024,
    height: 768,
    ...overrides,
  };
}

function makeJobRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'job-uuid-001',
    projectId: 'proj-uuid-001',
    status: 'pending' as const,
    priority: 0,
    prompt: 'a beautiful sunset over mountains',
    negativePrompt: null,
    width: 1024,
    height: 768,
    seed: null,
    steps: null,
    guidanceScale: null,
    idempotencyKey: null,
    extras: {},
    outputMetadata: null,
    artifactPath: null,
    failureReason: null,
    executorAdapter: 'comfyui',
    claimedAt: null,
    completedAt: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---- Mock DB builder ----

function makeMockDb(overrides: {
  insertReturning?: unknown[];
  selectResult?: unknown[];
  updateReturning?: unknown[];
} = {}) {
  const {
    insertReturning = [makeJobRow()],
    selectResult = [makeJobRow()],
    updateReturning = [makeJobRow({ status: 'claimed', version: 2, claimedAt: new Date() })],
  } = overrides;

  // Build a chainable drizzle-like mock
  const updateBuilder = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(updateReturning),
  };

  const insertBuilder = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(insertReturning),
    onConflictDoNothing: vi.fn().mockReturnThis(),
  };

  const selectBuilder = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(selectResult),
  };

  const db = {
    insert: vi.fn().mockReturnValue(insertBuilder),
    select: vi.fn().mockReturnValue(selectBuilder),
    update: vi.fn().mockReturnValue(updateBuilder),
    _insertBuilder: insertBuilder,
    _selectBuilder: selectBuilder,
    _updateBuilder: updateBuilder,
  };

  return db as unknown as Parameters<typeof submitAssetJob>[0]['db'];
}

// ---- Tests ----

describe('submitAssetJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppendEvent.mockResolvedValue({ id: 'evt-001' });
  });

  it('inserts a new job and returns a handle with duplicate: false', async () => {
    const db = makeMockDb();
    const params = makeParams({ idempotencyKey: 'idem-key-001' });

    const result = await submitAssetJob({ db, params });

    expect(result.jobId).toBe('job-uuid-001');
    expect(result.status).toBe('pending');
    expect(result.duplicate).toBe(false);
    expect(db.insert).toHaveBeenCalled();
  });

  it('returns duplicate: true when idempotency key already exists', async () => {
    const existingJob = makeJobRow({ id: 'job-existing', status: 'active' });

    // insert throws a unique constraint error
    const uniqueError = new Error('duplicate key value violates unique constraint');
    (uniqueError as NodeJS.ErrnoException & { code: string }).code = '23505';

    const insertBuilder = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockRejectedValue(uniqueError),
    };

    const selectBuilder = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([existingJob]),
    };

    const db = {
      insert: vi.fn().mockReturnValue(insertBuilder),
      select: vi.fn().mockReturnValue(selectBuilder),
      update: vi.fn(),
    } as unknown as Parameters<typeof submitAssetJob>[0]['db'];

    const params = makeParams({ idempotencyKey: 'idem-key-existing' });
    const result = await submitAssetJob({ db, params });

    expect(result.jobId).toBe('job-existing');
    expect(result.status).toBe('active');
    expect(result.duplicate).toBe(true);
    expect(db.select).toHaveBeenCalled();
  });

  it('rethrows non-unique-constraint errors', async () => {
    const networkError = new Error('connection refused');

    const insertBuilder = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockRejectedValue(networkError),
    };

    const db = {
      insert: vi.fn().mockReturnValue(insertBuilder),
      select: vi.fn(),
      update: vi.fn(),
    } as unknown as Parameters<typeof submitAssetJob>[0]['db'];

    await expect(submitAssetJob({ db, params: makeParams() })).rejects.toThrow('connection refused');
  });
});

describe('claimJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transitions status from pending to claimed and increments version', async () => {
    const claimedRow = makeJobRow({ status: 'claimed', version: 2, claimedAt: new Date() });

    const updateBuilder = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([claimedRow]),
    };

    const db = {
      update: vi.fn().mockReturnValue(updateBuilder),
    } as unknown as Parameters<typeof claimJob>[0];

    const result = await claimJob(db, 'job-uuid-001', 1);

    expect(result.status).toBe('claimed');
    expect(result.version).toBe(2);
    expect(result.claimedAt).toBeInstanceOf(Date);
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'claimed',
        version: 2,
        claimedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      })
    );
  });

  it('throws AssetJobError when version mismatch (optimistic concurrency)', async () => {
    const updateBuilder = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]), // 0 rows = conflict
    };

    const db = {
      update: vi.fn().mockReturnValue(updateBuilder),
    } as unknown as Parameters<typeof claimJob>[0];

    await expect(claimJob(db, 'job-uuid-001', 99)).rejects.toThrow(AssetJobError);
  });
});

describe('updateJobStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transitions status and increments version', async () => {
    const activeRow = makeJobRow({ status: 'active', version: 3 });

    const updateBuilder = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([activeRow]),
    };

    const db = {
      update: vi.fn().mockReturnValue(updateBuilder),
    } as unknown as Parameters<typeof updateJobStatus>[0];

    const result = await updateJobStatus(db, 'job-uuid-001', 'active', 2);

    expect(result.status).toBe('active');
    expect(result.version).toBe(3);
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        version: 3,
        updatedAt: expect.any(Date),
      })
    );
  });

  it('throws AssetJobError when version mismatch (optimistic concurrency)', async () => {
    const updateBuilder = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]), // 0 rows = conflict
    };

    const db = {
      update: vi.fn().mockReturnValue(updateBuilder),
    } as unknown as Parameters<typeof updateJobStatus>[0];

    await expect(updateJobStatus(db, 'job-uuid-001', 'active', 999)).rejects.toThrow(AssetJobError);
  });
});

describe('completeJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets status to completed with artifactPath and outputMetadata', async () => {
    const completedRow = makeJobRow({
      status: 'completed',
      version: 3,
      completedAt: new Date(),
      artifactPath: '/artifacts/image.png',
      outputMetadata: {
        imageFilename: 'image.png',
        comfyuiPromptId: 'prompt-123',
        width: 1024,
        height: 768,
        model: 'flux2',
        generatedAt: new Date().toISOString(),
      },
    });

    const updateBuilder = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([completedRow]),
    };

    const db = {
      update: vi.fn().mockReturnValue(updateBuilder),
    } as unknown as Parameters<typeof completeJob>[0];

    const outputMetadata = {
      imageFilename: 'image.png',
      comfyuiPromptId: 'prompt-123',
      width: 1024,
      height: 768,
      model: 'flux2',
      generatedAt: new Date().toISOString(),
    };

    const result = await completeJob(db, 'job-uuid-001', 2, {
      artifactPath: '/artifacts/image.png',
      outputMetadata,
    });

    expect(result.status).toBe('completed');
    expect(result.artifactPath).toBe('/artifacts/image.png');
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        completedAt: expect.any(Date),
        artifactPath: '/artifacts/image.png',
        outputMetadata,
      })
    );
  });
});

describe('failJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets status to failed with failureReason and completedAt', async () => {
    const failedRow = makeJobRow({
      status: 'failed',
      version: 3,
      completedAt: new Date(),
      failureReason: 'ComfyUI server unavailable',
    });

    const updateBuilder = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([failedRow]),
    };

    const db = {
      update: vi.fn().mockReturnValue(updateBuilder),
    } as unknown as Parameters<typeof failJob>[0];

    const result = await failJob(db, 'job-uuid-001', 2, 'ComfyUI server unavailable');

    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe('ComfyUI server unavailable');
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureReason: 'ComfyUI server unavailable',
        completedAt: expect.any(Date),
      })
    );
  });
});

describe('cancelJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets status to canceled', async () => {
    const canceledRow = makeJobRow({ status: 'canceled', version: 2 });

    const updateBuilder = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([canceledRow]),
    };

    const db = {
      update: vi.fn().mockReturnValue(updateBuilder),
    } as unknown as Parameters<typeof cancelJob>[0];

    const result = await cancelJob(db, 'job-uuid-001');

    expect(result.status).toBe('canceled');
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'canceled',
        updatedAt: expect.any(Date),
      })
    );
  });
});

describe('getAssetJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the job row when found', async () => {
    const jobRow = makeJobRow();
    const selectBuilder = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([jobRow]),
    };

    const db = {
      select: vi.fn().mockReturnValue(selectBuilder),
    } as unknown as Parameters<typeof getAssetJob>[0];

    const result = await getAssetJob(db, 'job-uuid-001');

    expect(result).toEqual(jobRow);
    expect(db.select).toHaveBeenCalled();
  });

  it('returns null when job not found', async () => {
    const selectBuilder = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };

    const db = {
      select: vi.fn().mockReturnValue(selectBuilder),
    } as unknown as Parameters<typeof getAssetJob>[0];

    const result = await getAssetJob(db, 'nonexistent-job');

    expect(result).toBeNull();
  });
});

describe('appendAssetEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppendEvent.mockResolvedValue({ id: 'evt-002' });
  });

  it('calls appendEvent with correct event type and payload', async () => {
    const db = makeMockDb();

    await appendAssetEvent(db as unknown as Parameters<typeof appendAssetEvent>[0], {
      projectId: 'proj-uuid-001',
      jobId: 'job-uuid-001',
      type: 'asset_job_submitted',
    });

    expect(mockAppendEvent).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        projectId: 'proj-uuid-001',
        type: 'asset_job_submitted',
        payload: expect.objectContaining({ jobId: 'job-uuid-001' }),
      })
    );
  });

  it('includes extra payload fields when provided', async () => {
    const db = makeMockDb();

    await appendAssetEvent(db as unknown as Parameters<typeof appendAssetEvent>[0], {
      projectId: 'proj-uuid-001',
      jobId: 'job-uuid-001',
      type: 'asset_job_completed',
      extra: { artifactPath: '/artifacts/img.png' },
    });

    expect(mockAppendEvent).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        type: 'asset_job_completed',
        payload: expect.objectContaining({
          jobId: 'job-uuid-001',
          artifactPath: '/artifacts/img.png',
        }),
      })
    );
  });
});

describe('listAssetJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeJobWithProject(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      job: makeJobRow(overrides),
      projectName: 'Test Project',
    };
  }

  function makeListMockDb(results: unknown[] = [makeJobWithProject()]) {
    const queryBuilder = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue(results),
      where: vi.fn().mockReturnThis(),
    };

    return {
      select: vi.fn().mockReturnValue(queryBuilder),
      _queryBuilder: queryBuilder,
    } as unknown as Parameters<typeof listAssetJobs>[0];
  }

  it('returns paginated results with default limit=50 and offset=0', async () => {
    const rows = [makeJobWithProject(), makeJobWithProject({ id: 'job-uuid-002' })];
    const db = makeListMockDb(rows);
    const result = await listAssetJobs(db);

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('job');
    expect(result[0]).toHaveProperty('projectName', 'Test Project');
    expect((db as any).select).toHaveBeenCalled();
    const qb = (db as any)._queryBuilder;
    expect(qb.limit).toHaveBeenCalledWith(50);
    expect(qb.offset).toHaveBeenCalledWith(0);
  });

  it('applies status filter when provided', async () => {
    const completedRows = [makeJobWithProject({ status: 'completed' })];
    const db = makeListMockDb(completedRows);
    const result = await listAssetJobs(db, { status: 'completed' });

    const qb = (db as any)._queryBuilder;
    expect(qb.where).toHaveBeenCalled();
    expect(result[0]!.job.status).toBe('completed');
  });

  it('forwards limit and offset options correctly', async () => {
    const db = makeListMockDb([]);
    await listAssetJobs(db, { limit: 10, offset: 5 });

    const qb = (db as any)._queryBuilder;
    expect(qb.limit).toHaveBeenCalledWith(10);
    expect(qb.offset).toHaveBeenCalledWith(5);
  });

  it('does NOT apply where clause when no status filter provided', async () => {
    const db = makeListMockDb([]);
    await listAssetJobs(db, {});

    const qb = (db as any)._queryBuilder;
    expect(qb.where).not.toHaveBeenCalled();
  });

  it('includes innerJoin for project name and orders results', async () => {
    const db = makeListMockDb([]);
    await listAssetJobs(db);

    const qb = (db as any)._queryBuilder;
    expect(qb.innerJoin).toHaveBeenCalled();
    expect(qb.orderBy).toHaveBeenCalled();
  });
});
