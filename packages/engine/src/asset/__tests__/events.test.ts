import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NonRetriableError } from 'inngest';

// Mock @get-cauldron/shared to avoid DATABASE_URL requirement
vi.mock('@get-cauldron/shared', () => ({
  appendEvent: vi.fn().mockResolvedValue({}),
  assetJobs: {},
}));

// Mock all job-store functions
vi.mock('../job-store.js', () => ({
  getAssetJob: vi.fn(),
  claimJob: vi.fn(),
  updateJobStatus: vi.fn(),
  completeJob: vi.fn(),
  failJob: vi.fn(),
  appendAssetEvent: vi.fn(),
  submitAssetJob: vi.fn(),
  cancelJob: vi.fn(),
  getAssetJobByIdempotencyKey: vi.fn(),
}));

// Mock artifact-writer
vi.mock('../artifact-writer.js', () => ({
  writeArtifact: vi.fn(),
}));

// Mock holdout/events to avoid second Inngest client creation issues
vi.mock('../../holdout/events.js', async () => {
  const { Inngest } = await import('inngest');
  const inngest = new Inngest({ id: 'cauldron-engine', isDev: true });
  return {
    inngest,
    configureVaultDeps: vi.fn(),
    handleEvolutionConverged: {} as any,
    convergenceHandler: vi.fn(),
  };
});

const JOB_ID = 'job-uuid-1';
const PROJECT_ID = 'project-uuid-1';
const COMFYUI_PROMPT_ID = 'comfyui-prompt-uuid-1';
const ARTIFACT_PATH = '/tmp/artifacts/job-uuid-1';
const IMAGE_FILENAME = 'output_00001.png';

const mockJob = {
  id: JOB_ID,
  projectId: PROJECT_ID,
  prompt: 'a beautiful landscape',
  negativePrompt: null,
  width: 1024,
  height: 1024,
  seed: 42,
  steps: 20,
  guidanceScale: 3.5,
  status: 'pending' as const,
  version: 0,
  priority: 0,
  idempotencyKey: null,
  extras: {},
  claimedAt: null,
  completedAt: null,
  failureReason: null,
  artifactPath: null,
  outputMetadata: null,
  executorAdapter: 'comfyui',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockClaimedJob = { ...mockJob, status: 'claimed' as const, version: 1 };
const mockActiveJob = { ...mockJob, status: 'active' as const, version: 2 };
const mockCompletedJob = { ...mockJob, status: 'completed' as const, version: 3 };

const mockDb = {};

const mockExecutor = {
  submitJob: vi.fn(),
  checkStatus: vi.fn(),
  getArtifact: vi.fn(),
};

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

function makeFakeStep() {
  return {
    run: vi.fn(async (_name: string, callback: () => unknown) => {
      return await callback();
    }),
  };
}

function makeEvent(overrides?: Partial<{ jobId: string; projectId: string }>) {
  return {
    data: {
      jobId: JOB_ID,
      projectId: PROJECT_ID,
      ...overrides,
    },
  };
}

describe('asset events module', () => {
  it('exports handleAssetGenerate, configureAssetDeps, and generateAssetHandler', async () => {
    const mod = await import('../events.js');
    expect(mod.handleAssetGenerate).toBeDefined();
    expect(typeof mod.configureAssetDeps).toBe('function');
    expect(typeof mod.generateAssetHandler).toBe('function');
  });
});

describe('generateAssetHandler', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function setupAndRun(opts?: {
    checkStatusResult?: { done: boolean; outputs?: { images: Array<{ filename: string; subfolder: string; type: string }> } };
    getArtifactResult?: Buffer;
    writeArtifactResult?: string;
    getAssetJobResult?: typeof mockJob;
    claimJobResult?: typeof mockClaimedJob;
    updateJobStatusResult?: typeof mockActiveJob;
    completeJobResult?: typeof mockCompletedJob;
    failJobResult?: typeof mockJob;
    simulateExecutorError?: boolean;
    simulateTimeout?: boolean;
  }) {
    const jobStoreModule = await import('../job-store.js');
    const artifactWriterModule = await import('../artifact-writer.js');

    vi.mocked(jobStoreModule.getAssetJob).mockResolvedValue(opts?.getAssetJobResult ?? mockJob);
    vi.mocked(jobStoreModule.claimJob).mockResolvedValue(opts?.claimJobResult ?? mockClaimedJob);
    vi.mocked(jobStoreModule.updateJobStatus).mockResolvedValue(opts?.updateJobStatusResult ?? mockActiveJob);
    vi.mocked(jobStoreModule.completeJob).mockResolvedValue(opts?.completeJobResult ?? mockCompletedJob);
    vi.mocked(jobStoreModule.failJob).mockResolvedValue(mockJob);
    vi.mocked(jobStoreModule.appendAssetEvent).mockResolvedValue(undefined);

    if (opts?.simulateExecutorError) {
      mockExecutor.submitJob.mockRejectedValue(new Error('ComfyUI connection refused'));
    } else {
      mockExecutor.submitJob.mockResolvedValue(COMFYUI_PROMPT_ID);
    }

    if (opts?.simulateTimeout) {
      // checkStatus never returns done — polling loop should eventually time out
      mockExecutor.checkStatus.mockResolvedValue({ done: false });
    } else {
      mockExecutor.checkStatus.mockResolvedValue(
        opts?.checkStatusResult ?? {
          done: true,
          outputs: { images: [{ filename: IMAGE_FILENAME, subfolder: '', type: 'output' }] },
        }
      );
    }

    mockExecutor.getArtifact.mockResolvedValue(
      opts?.getArtifactResult ?? Buffer.from('fake-image-bytes')
    );
    vi.mocked(artifactWriterModule.writeArtifact).mockResolvedValue(
      opts?.writeArtifactResult ?? ARTIFACT_PATH
    );

    const eventsModule = await import('../events.js');
    eventsModule.configureAssetDeps({
      db: mockDb as any,
      logger: mockLogger as any,
      executor: mockExecutor as any,
      artifactsRoot: '/tmp/artifacts',
    });

    const fakeStep = makeFakeStep();
    return { eventsModule, fakeStep, jobStoreModule, artifactWriterModule };
  }

  it('Test 1: Step 1 calls getAssetJob to fetch current job state', async () => {
    const { eventsModule, fakeStep, jobStoreModule } = await setupAndRun();
    await eventsModule.generateAssetHandler({ event: makeEvent(), step: fakeStep as any });
    expect(jobStoreModule.getAssetJob).toHaveBeenCalledWith(mockDb, JOB_ID);
  });

  it('Test 2: Step 1 calls claimJob to transition pending -> claimed (D-01)', async () => {
    const { eventsModule, fakeStep, jobStoreModule } = await setupAndRun();
    await eventsModule.generateAssetHandler({ event: makeEvent(), step: fakeStep as any });
    expect(jobStoreModule.claimJob).toHaveBeenCalledWith(mockDb, JOB_ID, mockJob.version);
  });

  it('Test 3: Step 1 calls updateJobStatus with "active" after claiming', async () => {
    const { eventsModule, fakeStep, jobStoreModule } = await setupAndRun();
    await eventsModule.generateAssetHandler({ event: makeEvent(), step: fakeStep as any });
    expect(jobStoreModule.updateJobStatus).toHaveBeenCalledWith(
      mockDb,
      JOB_ID,
      'active',
      mockClaimedJob.version
    );
  });

  it('Test 4: Step 1 calls executor.submitJob with jobId and job params', async () => {
    const { eventsModule, fakeStep } = await setupAndRun();
    await eventsModule.generateAssetHandler({ event: makeEvent(), step: fakeStep as any });
    expect(mockExecutor.submitJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: JOB_ID, prompt: mockJob.prompt })
    );
  });

  it('Test 5: Step 1 appends asset_job_active event after submission', async () => {
    const { eventsModule, fakeStep, jobStoreModule } = await setupAndRun();
    await eventsModule.generateAssetHandler({ event: makeEvent(), step: fakeStep as any });
    expect(jobStoreModule.appendAssetEvent).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ type: 'asset_job_active', jobId: JOB_ID, projectId: PROJECT_ID })
    );
  });

  it('Test 6: Step 2 calls executor.checkStatus and returns when done: true', async () => {
    const { eventsModule, fakeStep } = await setupAndRun();
    await eventsModule.generateAssetHandler({ event: makeEvent(), step: fakeStep as any });
    expect(mockExecutor.checkStatus).toHaveBeenCalledWith(COMFYUI_PROMPT_ID);
  });

  it('Test 7: Step 3 calls executor.getArtifact with the first image filename', async () => {
    const { eventsModule, fakeStep } = await setupAndRun();
    await eventsModule.generateAssetHandler({ event: makeEvent(), step: fakeStep as any });
    expect(mockExecutor.getArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ images: [{ filename: IMAGE_FILENAME, subfolder: '', type: 'output' }] }),
      IMAGE_FILENAME
    );
  });

  it('Test 8: Step 3 calls writeArtifact with correct parameters', async () => {
    const { eventsModule, fakeStep, artifactWriterModule } = await setupAndRun();
    await eventsModule.generateAssetHandler({ event: makeEvent(), step: fakeStep as any });
    expect(artifactWriterModule.writeArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: JOB_ID,
        projectId: PROJECT_ID,
        imageFilename: IMAGE_FILENAME,
        artifactsRoot: '/tmp/artifacts',
      })
    );
  });

  it('Test 9: Step 3 calls completeJob with artifact path and output metadata', async () => {
    const { eventsModule, fakeStep, jobStoreModule } = await setupAndRun();
    await eventsModule.generateAssetHandler({ event: makeEvent(), step: fakeStep as any });
    expect(jobStoreModule.completeJob).toHaveBeenCalledWith(
      mockDb,
      JOB_ID,
      expect.any(Number),
      expect.objectContaining({
        artifactPath: ARTIFACT_PATH,
        outputMetadata: expect.objectContaining({ imageFilename: IMAGE_FILENAME }),
      })
    );
  });

  it('Test 10: Step 3 appends asset_job_completed event', async () => {
    const { eventsModule, fakeStep, jobStoreModule } = await setupAndRun();
    await eventsModule.generateAssetHandler({ event: makeEvent(), step: fakeStep as any });
    expect(jobStoreModule.appendAssetEvent).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ type: 'asset_job_completed', jobId: JOB_ID })
    );
  });

  it('Test 11: Returns { jobId, status: "completed" } on success', async () => {
    const { eventsModule, fakeStep } = await setupAndRun();
    const result = await eventsModule.generateAssetHandler({ event: makeEvent(), step: fakeStep as any });
    expect(result).toMatchObject({ jobId: JOB_ID, status: 'completed' });
  });

  it('Test 12: On executor.submitJob error, failJob is called with the error message', async () => {
    const { eventsModule, fakeStep, jobStoreModule } = await setupAndRun({ simulateExecutorError: true });
    await expect(
      eventsModule.generateAssetHandler({ event: makeEvent(), step: fakeStep as any })
    ).rejects.toThrow('ComfyUI connection refused');
    expect(jobStoreModule.failJob).toHaveBeenCalledWith(
      mockDb,
      JOB_ID,
      expect.any(Number),
      expect.stringContaining('ComfyUI connection refused')
    );
  });

  it('Test 13: On executor.submitJob error, asset_job_failed event is appended', async () => {
    const { eventsModule, fakeStep, jobStoreModule } = await setupAndRun({ simulateExecutorError: true });
    await expect(
      eventsModule.generateAssetHandler({ event: makeEvent(), step: fakeStep as any })
    ).rejects.toThrow();
    expect(jobStoreModule.appendAssetEvent).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ type: 'asset_job_failed', jobId: JOB_ID })
    );
  });

  it('Test 14: Step 2 throws NonRetriableError when polling exceeds timeout', async () => {
    // We test this by overriding the timeout to 0ms so any poll attempt exceeds it
    // The test verifies that NonRetriableError is thrown (not a generic Error)
    const { eventsModule, fakeStep } = await setupAndRun({ simulateTimeout: true });

    // Override setTimeout to resolve immediately so the poll loop iterates quickly
    // The key check is that NonRetriableError is thrown when done never becomes true
    // We verify the type via the NonRetriableError import
    try {
      await eventsModule.generateAssetHandler(
        { event: makeEvent(), step: fakeStep as any },
        0, // pass 0 as override timeout for tests
        0  // pass 0 as poll interval too
      );
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(NonRetriableError);
    }
  });

  it('Test 15: 3 Inngest steps are run in sequence (submit, poll, collect)', async () => {
    const { eventsModule, fakeStep } = await setupAndRun();
    await eventsModule.generateAssetHandler({ event: makeEvent(), step: fakeStep as any });
    const stepNames = fakeStep.run.mock.calls.map((c: [string, ...unknown[]]) => c[0]);
    expect(stepNames[0]).toBe('submit-to-comfyui');
    expect(stepNames[1]).toBe('poll-completion');
    expect(stepNames[2]).toBe('collect-artifacts');
    expect(fakeStep.run).toHaveBeenCalledTimes(3);
  });
});
