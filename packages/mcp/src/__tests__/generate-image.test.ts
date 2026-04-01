import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGenerateImage } from '../tools/generate-image.js';
import type { GenerateImageDeps } from '../tools/generate-image.js';

// Mock @get-cauldron/engine — include enforcement functions added in plan 20-01
vi.mock('@get-cauldron/engine', () => ({
  submitAssetJob: vi.fn(),
  checkAssetMode: vi.fn().mockResolvedValue('active'),
  checkAssetConcurrency: vi.fn().mockResolvedValue(undefined),
}));

import { submitAssetJob } from '@get-cauldron/engine';

const mockSubmitAssetJob = vi.mocked(submitAssetJob);

function makeDeps(overrides?: Partial<GenerateImageDeps>): GenerateImageDeps {
  return {
    db: {} as GenerateImageDeps['db'],
    inngest: { send: vi.fn().mockResolvedValue(undefined) },
    projectId: 'proj-123',
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as GenerateImageDeps['logger'],
    ...overrides,
  };
}

describe('handleGenerateImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls submitAssetJob with icon defaults (512x512, 30 steps) when intendedUse is icon', async () => {
    mockSubmitAssetJob.mockResolvedValueOnce({ jobId: 'job-1', status: 'pending', duplicate: false });
    const deps = makeDeps();

    await handleGenerateImage({ prompt: 'a cat', intendedUse: 'icon' }, deps);

    expect(mockSubmitAssetJob).toHaveBeenCalledOnce();
    const call = mockSubmitAssetJob.mock.calls[0]![0];
    expect(call.params.width).toBe(512);
    expect(call.params.height).toBe(512);
    expect(call.params.steps).toBe(30);
  });

  it('composes prompt with styleGuidance as prefix', async () => {
    mockSubmitAssetJob.mockResolvedValueOnce({ jobId: 'job-2', status: 'pending', duplicate: false });
    const deps = makeDeps();

    await handleGenerateImage({ prompt: 'a cat', styleGuidance: 'watercolor' }, deps);

    const call = mockSubmitAssetJob.mock.calls[0]![0];
    expect(call.params.prompt).toBe('watercolor. a cat');
  });

  it('stores destination in extras.destination', async () => {
    mockSubmitAssetJob.mockResolvedValueOnce({ jobId: 'job-3', status: 'pending', duplicate: false });
    const deps = makeDeps();

    await handleGenerateImage({ prompt: 'a cat', destination: '/tmp/out.png' }, deps);

    const call = mockSubmitAssetJob.mock.calls[0]![0];
    expect(call.params.extras?.destination).toBe('/tmp/out.png');
  });

  it('stores originalPrompt separately in extras', async () => {
    mockSubmitAssetJob.mockResolvedValueOnce({ jobId: 'job-4', status: 'pending', duplicate: false });
    const deps = makeDeps();

    await handleGenerateImage({ prompt: 'a cat', styleGuidance: 'watercolor' }, deps);

    const call = mockSubmitAssetJob.mock.calls[0]![0];
    expect(call.params.extras?.originalPrompt).toBe('a cat');
    expect(call.params.extras?.styleGuidance).toBe('watercolor');
  });

  it('calls inngest.send with asset/generate.requested containing jobId and projectId', async () => {
    mockSubmitAssetJob.mockResolvedValueOnce({ jobId: 'job-5', status: 'pending', duplicate: false });
    const deps = makeDeps();

    await handleGenerateImage({ prompt: 'a cat' }, deps);

    expect(deps.inngest.send).toHaveBeenCalledWith({
      name: 'asset/generate.requested',
      data: { jobId: 'job-5', projectId: 'proj-123' },
    });
  });

  it('returns duplicate flag true when submitAssetJob returns duplicate job', async () => {
    mockSubmitAssetJob.mockResolvedValueOnce({ jobId: 'job-6', status: 'pending', duplicate: true });
    const deps = makeDeps();

    const result = await handleGenerateImage({ prompt: 'a cat', idempotencyKey: 'key-1' }, deps);

    const parsed = JSON.parse(result.content[0]!.text) as { duplicate: boolean; message: string };
    expect(parsed.duplicate).toBe(true);
    expect(parsed.message).toContain('Duplicate');
  });

  it('returns generation started message for new jobs', async () => {
    mockSubmitAssetJob.mockResolvedValueOnce({ jobId: 'job-7', status: 'pending', duplicate: false });
    const deps = makeDeps();

    const result = await handleGenerateImage({ prompt: 'a cat' }, deps);

    const parsed = JSON.parse(result.content[0]!.text) as { message: string; jobId: string };
    expect(parsed.jobId).toBe('job-7');
    expect(parsed.message).toContain('Generation started');
  });

  it('uses override dimensions when provided, ignoring intendedUse defaults', async () => {
    mockSubmitAssetJob.mockResolvedValueOnce({ jobId: 'job-8', status: 'pending', duplicate: false });
    const deps = makeDeps();

    await handleGenerateImage({ prompt: 'a cat', intendedUse: 'icon', width: 800, height: 600 }, deps);

    const call = mockSubmitAssetJob.mock.calls[0]![0];
    expect(call.params.width).toBe(800);
    expect(call.params.height).toBe(600);
    // steps still from icon default since not overridden
    expect(call.params.steps).toBe(30);
  });
});
