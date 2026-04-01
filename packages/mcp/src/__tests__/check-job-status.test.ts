import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCheckJobStatus } from '../tools/check-job-status.js';
import type { CheckJobStatusDeps } from '../tools/check-job-status.js';

// Mock @get-cauldron/engine
vi.mock('@get-cauldron/engine', () => ({
  getAssetJob: vi.fn(),
}));

import { getAssetJob } from '@get-cauldron/engine';

const mockGetAssetJob = vi.mocked(getAssetJob);

function makeDeps(): CheckJobStatusDeps {
  return {
    db: {} as CheckJobStatusDeps['db'],
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as CheckJobStatusDeps['logger'],
  };
}

function makeJob(overrides?: Partial<ReturnType<typeof getAssetJob> extends Promise<infer T> ? NonNullable<T> : never>) {
  const now = new Date();
  return {
    id: 'job-1',
    status: 'pending' as const,
    createdAt: now,
    updatedAt: now,
    claimedAt: null,
    completedAt: null,
    artifactPath: null,
    failureReason: null,
    projectId: 'proj-1',
    prompt: 'a cat',
    negativePrompt: null,
    width: 512,
    height: 512,
    steps: 20,
    seed: null,
    guidanceScale: null,
    idempotencyKey: null,
    extras: {},
    outputMetadata: null,
    version: 1,
    ...overrides,
  };
}

describe('handleCheckJobStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error content when job is not found', async () => {
    mockGetAssetJob.mockResolvedValueOnce(null);
    const deps = makeDeps();

    const result = await handleCheckJobStatus({ jobId: 'missing-job' }, deps);
    const parsed = JSON.parse(result.content[0]!.text) as { error: string; jobId: string };

    expect(parsed.error).toBe('Job not found');
    expect(parsed.jobId).toBe('missing-job');
  });

  it('returns estimatedProgress: 100 for completed job', async () => {
    const completedJob = makeJob({ status: 'completed', completedAt: new Date() });
    mockGetAssetJob.mockResolvedValueOnce(completedJob);
    const deps = makeDeps();

    const result = await handleCheckJobStatus({ jobId: 'job-1' }, deps);
    const parsed = JSON.parse(result.content[0]!.text) as { estimatedProgress: number; status: string };

    expect(parsed.status).toBe('completed');
    expect(parsed.estimatedProgress).toBe(100);
  });

  it('returns estimatedProgress: null for failed job', async () => {
    const failedJob = makeJob({ status: 'failed', failureReason: 'ComfyUI error' });
    mockGetAssetJob.mockResolvedValueOnce(failedJob);
    const deps = makeDeps();

    const result = await handleCheckJobStatus({ jobId: 'job-1' }, deps);
    const parsed = JSON.parse(result.content[0]!.text) as { estimatedProgress: null; status: string };

    expect(parsed.status).toBe('failed');
    expect(parsed.estimatedProgress).toBeNull();
  });

  it('returns estimatedProgress: null for canceled job', async () => {
    const canceledJob = makeJob({ status: 'canceled' });
    mockGetAssetJob.mockResolvedValueOnce(canceledJob);
    const deps = makeDeps();

    const result = await handleCheckJobStatus({ jobId: 'job-1' }, deps);
    const parsed = JSON.parse(result.content[0]!.text) as { estimatedProgress: null; status: string };

    expect(parsed.status).toBe('canceled');
    expect(parsed.estimatedProgress).toBeNull();
  });

  it('returns estimatedProgress between 0 and 95 for active job', async () => {
    // Job created 30 seconds ago
    const thirtySecondsAgo = new Date(Date.now() - 30_000);
    const activeJob = makeJob({ status: 'active', createdAt: thirtySecondsAgo });
    mockGetAssetJob.mockResolvedValueOnce(activeJob);
    const deps = makeDeps();

    const result = await handleCheckJobStatus({ jobId: 'job-1' }, deps);
    const parsed = JSON.parse(result.content[0]!.text) as { estimatedProgress: number; status: string };

    expect(parsed.status).toBe('active');
    // 30s / 120s * 100 = 25
    expect(parsed.estimatedProgress).toBeGreaterThanOrEqual(0);
    expect(parsed.estimatedProgress).toBeLessThanOrEqual(95);
    expect(parsed.estimatedProgress).toBeCloseTo(25, 0);
  });

  it('caps estimatedProgress at 95 even if job takes longer than expected', async () => {
    // Job created 300 seconds ago (way over the 120s typical time)
    const longAgo = new Date(Date.now() - 300_000);
    const pendingJob = makeJob({ status: 'pending', createdAt: longAgo });
    mockGetAssetJob.mockResolvedValueOnce(pendingJob);
    const deps = makeDeps();

    const result = await handleCheckJobStatus({ jobId: 'job-1' }, deps);
    const parsed = JSON.parse(result.content[0]!.text) as { estimatedProgress: number };

    expect(parsed.estimatedProgress).toBe(95);
  });

  it('returns job id, timestamps, and artifactPath in response', async () => {
    const job = makeJob({
      id: 'job-abc',
      status: 'completed',
      artifactPath: '/tmp/artifacts/job-abc',
      completedAt: new Date(),
    });
    mockGetAssetJob.mockResolvedValueOnce(job);
    const deps = makeDeps();

    const result = await handleCheckJobStatus({ jobId: 'job-abc' }, deps);
    const parsed = JSON.parse(result.content[0]!.text) as {
      jobId: string;
      artifactPath: string;
      createdAt: string;
    };

    expect(parsed.jobId).toBe('job-abc');
    expect(parsed.artifactPath).toBe('/tmp/artifacts/job-abc');
    expect(parsed.createdAt).toBeDefined();
  });
});
