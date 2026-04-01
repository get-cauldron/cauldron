import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGenerateImage } from '../tools/generate-image.js';
import type { GenerateImageDeps } from '../tools/generate-image.js';

// ---- Mock @get-cauldron/engine ----
const {
  mockCheckAssetMode,
  mockCheckAssetConcurrency,
  mockSubmitAssetJob,
} = vi.hoisted(() => ({
  mockCheckAssetMode: vi.fn(),
  mockCheckAssetConcurrency: vi.fn(),
  mockSubmitAssetJob: vi.fn(),
}));

vi.mock('@get-cauldron/engine', () => ({
  checkAssetMode: mockCheckAssetMode,
  checkAssetConcurrency: mockCheckAssetConcurrency,
  submitAssetJob: mockSubmitAssetJob,
}));

// ---- Helpers ----

function makeDeps(overrides?: Partial<GenerateImageDeps>): GenerateImageDeps {
  return {
    db: {} as GenerateImageDeps['db'],
    inngest: { send: vi.fn().mockResolvedValue(undefined) },
    projectId: 'proj-enforcement-001',
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as GenerateImageDeps['logger'],
    ...overrides,
  };
}

function makeJobHandle(overrides: Partial<{ jobId: string; status: string; duplicate: boolean }> = {}) {
  return {
    jobId: 'job-enforcement-001',
    status: 'pending',
    duplicate: false,
    ...overrides,
  };
}

// ---- Tests ----

describe('handleGenerateImage - enforcement wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckAssetConcurrency.mockResolvedValue(undefined);
  });

  it('active mode: calls submitAssetJob AND inngest.send', async () => {
    mockCheckAssetMode.mockResolvedValue('active');
    mockSubmitAssetJob.mockResolvedValue(makeJobHandle());
    const deps = makeDeps();

    await handleGenerateImage({ prompt: 'a cat' }, deps);

    expect(mockSubmitAssetJob).toHaveBeenCalledOnce();
    expect(deps.inngest.send).toHaveBeenCalledOnce();
    expect(deps.inngest.send).toHaveBeenCalledWith({
      name: 'asset/generate.requested',
      data: { jobId: 'job-enforcement-001', projectId: 'proj-enforcement-001' },
    });
  });

  it('paused mode: calls submitAssetJob but NOT inngest.send, logs paused message', async () => {
    mockCheckAssetMode.mockResolvedValue('paused');
    mockSubmitAssetJob.mockResolvedValue(makeJobHandle());
    const deps = makeDeps();

    await handleGenerateImage({ prompt: 'a cat' }, deps);

    expect(mockSubmitAssetJob).toHaveBeenCalledOnce();
    expect(deps.inngest.send).not.toHaveBeenCalled();
    // Logger should be called with paused mode info
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'paused' }),
      expect.stringContaining('paused'),
    );
  });

  it('disabled mode: throws before submitAssetJob is called when checkAssetMode rejects', async () => {
    // When mode is disabled, checkAssetMode throws AssetModeDisabledError.
    // We simulate this by having the mock reject — the specific error type is tested
    // in the engine unit tests (settings-enforcement.test.ts). Here we verify the
    // MCP tool propagates the error and never reaches submitAssetJob.
    const disabledError = new Error("Asset generation is disabled for project 'proj-enforcement-001'");
    disabledError.name = 'AssetModeDisabledError';
    mockCheckAssetMode.mockRejectedValue(disabledError);

    const deps = makeDeps();

    await expect(handleGenerateImage({ prompt: 'a cat' }, deps)).rejects.toThrow('disabled');

    expect(mockSubmitAssetJob).not.toHaveBeenCalled();
    expect(deps.inngest.send).not.toHaveBeenCalled();
  });
});
