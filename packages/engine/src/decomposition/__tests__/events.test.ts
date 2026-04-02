import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @get-cauldron/shared to avoid DATABASE_URL requirement
vi.mock('@get-cauldron/shared', () => ({
  appendEvent: vi.fn().mockResolvedValue({}),
  beads: {},
  beadEdges: {},
}));

// Mock the scheduler functions
vi.mock('../scheduler.js', () => ({
  findReadyBeads: vi.fn(),
  claimBead: vi.fn(),
  completeBead: vi.fn(),
  persistDecomposition: vi.fn(),
}));

// Mock holdout events module (provides the inngest client)
vi.mock('../../holdout/events.js', () => ({
  inngest: {
    createFunction: vi.fn().mockReturnValue({ id: 'mock-function' }),
  },
}));

const mockDb = { select: vi.fn(), update: vi.fn(), insert: vi.fn() } as any;

const BEAD_ID = '00000000-0000-0000-0000-000000000001';
const SEED_ID = '00000000-0000-0000-0000-000000000002';
const PROJECT_ID = '00000000-0000-0000-0000-000000000003';
const UPSTREAM_BEAD_ID = '00000000-0000-0000-0000-000000000004';

/**
 * Creates a fake step object for testing Inngest handlers.
 * step.run() executes callbacks immediately (synchronously simulating Inngest behavior).
 * step.waitForEvent() returns a resolved mock result by default.
 * step.sendEvent() records calls but does nothing.
 */
function makeFakeStep(overrides: Partial<{
  waitForEventResult: any;
}> = {}) {
  return {
    run: vi.fn(async (_name: string, callback: () => unknown) => {
      return await callback();
    }),
    waitForEvent: vi.fn().mockResolvedValue(
      overrides.waitForEventResult !== undefined
        ? overrides.waitForEventResult
        : { name: 'bead.completed', data: { beadId: UPSTREAM_BEAD_ID } }
    ),
    sendEvent: vi.fn().mockResolvedValue(undefined),
  };
}

describe('beadDispatchHandler', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('Test 1: claims and dispatches bead when no waits_for edges exist', async () => {
    const schedulerModule = await import('../scheduler.js');
    const { appendEvent } = await import('@get-cauldron/shared');

    // No waits_for edges, no conditional edges
    vi.mocked(schedulerModule.claimBead).mockResolvedValue({
      success: true,
      beadId: BEAD_ID,
      agentId: 'inngest-worker',
      newVersion: 2,
    });

    // Mock DB select: first call for waits_for edges (empty), second for conditional (empty)
    const mockSelect = vi.fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // no waits_for edges
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // no conditional edges
        }),
      });
    const db = { ...mockDb, select: mockSelect } as any;

    const { configureSchedulerDeps, beadDispatchHandler } = await import('../events.js');
    configureSchedulerDeps({ db });

    const fakeStep = makeFakeStep();
    const result = await beadDispatchHandler({
      event: { data: { beadId: BEAD_ID, seedId: SEED_ID, projectId: PROJECT_ID, moleculeId: null } },
      step: fakeStep as any,
    });

    expect(result.status).toBe('dispatched');
    expect(result.beadId).toBe(BEAD_ID);
    expect(schedulerModule.claimBead).toHaveBeenCalledWith(db, BEAD_ID, 'inngest-worker');
    expect(appendEvent).toHaveBeenCalledWith(db, expect.objectContaining({ type: 'bead_dispatched' }));
  });

  it('Test 2: calls step.waitForEvent for each waits_for upstream edge', async () => {
    const schedulerModule = await import('../scheduler.js');

    vi.mocked(schedulerModule.claimBead).mockResolvedValue({
      success: true,
      beadId: BEAD_ID,
      agentId: 'inngest-worker',
      newVersion: 2,
    });

    const waitsForEdges = [
      { id: 'edge-1', fromBeadId: UPSTREAM_BEAD_ID, toBeadId: BEAD_ID, edgeType: 'waits_for', createdAt: new Date() },
      { id: 'edge-2', fromBeadId: '00000000-0000-0000-0000-000000000005', toBeadId: BEAD_ID, edgeType: 'waits_for', createdAt: new Date() },
    ];

    const mockSelect = vi.fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(waitsForEdges), // 2 waits_for edges
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // no conditional edges
        }),
      });
    const db = { ...mockDb, select: mockSelect } as any;

    const { configureSchedulerDeps, beadDispatchHandler } = await import('../events.js');
    configureSchedulerDeps({ db });

    const fakeStep = makeFakeStep();
    await beadDispatchHandler({
      event: { data: { beadId: BEAD_ID, seedId: SEED_ID, projectId: PROJECT_ID, moleculeId: null } },
      step: fakeStep as any,
    });

    // step.waitForEvent should be called once per waits_for upstream
    expect(fakeStep.waitForEvent).toHaveBeenCalledTimes(2);
    expect(fakeStep.waitForEvent).toHaveBeenCalledWith(
      `wait-for-bead-${UPSTREAM_BEAD_ID}`,
      expect.objectContaining({ event: 'bead.completed' })
    );
  });

  it('Test 3: skips bead when conditional upstream has failed (D-14)', async () => {
    const schedulerModule = await import('../scheduler.js');
    const { appendEvent } = await import('@get-cauldron/shared');

    vi.mocked(schedulerModule.completeBead).mockResolvedValue({ success: true, beadId: BEAD_ID, newVersion: 2 });

    const conditionalEdge = [
      { id: 'edge-cond', fromBeadId: UPSTREAM_BEAD_ID, toBeadId: BEAD_ID, edgeType: 'conditional_blocks', createdAt: new Date() },
    ];
    const failedUpstream = { id: UPSTREAM_BEAD_ID, status: 'failed', version: 2 };

    const mockSelect = vi.fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // no waits_for edges
        }),
      })
      // For check-conditional step: first query for edges, then query for the upstream bead
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(conditionalEdge), // conditional edge exists
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([failedUpstream]), // upstream is failed
        }),
      });
    const db = { ...mockDb, select: mockSelect } as any;

    const { configureSchedulerDeps, beadDispatchHandler } = await import('../events.js');
    configureSchedulerDeps({ db });

    const fakeStep = makeFakeStep();
    const result = await beadDispatchHandler({
      event: { data: { beadId: BEAD_ID, seedId: SEED_ID, projectId: PROJECT_ID, moleculeId: null } },
      step: fakeStep as any,
    });

    expect(result.status).toBe('skipped');
    expect(schedulerModule.completeBead).toHaveBeenCalledWith(db, BEAD_ID, 'failed', PROJECT_ID, SEED_ID);
    expect(appendEvent).toHaveBeenCalledWith(db, expect.objectContaining({ type: 'bead_skipped' }));
  });

  it('Test 9: After successful claim, bead_claimed event is emitted with beadId and agentId', async () => {
    const schedulerModule = await import('../scheduler.js');
    const { appendEvent } = await import('@get-cauldron/shared');

    vi.mocked(schedulerModule.claimBead).mockResolvedValue({
      success: true,
      beadId: BEAD_ID,
      agentId: 'inngest-worker',
      newVersion: 2,
    });

    const mockSelect = vi.fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // no waits_for edges
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // no conditional edges
        }),
      });
    const db = { ...mockDb, select: mockSelect } as any;

    const { configureSchedulerDeps, beadDispatchHandler } = await import('../events.js');
    configureSchedulerDeps({ db });

    const fakeStep = makeFakeStep();
    await beadDispatchHandler({
      event: { data: { beadId: BEAD_ID, seedId: SEED_ID, projectId: PROJECT_ID, moleculeId: null } },
      step: fakeStep as any,
    });

    const calls = vi.mocked(appendEvent).mock.calls;
    const claimedCall = calls.find(c => c[1]?.type === 'bead_claimed');
    expect(claimedCall).toBeDefined();
    expect(claimedCall![1].payload).toMatchObject({ beadId: BEAD_ID, agentId: 'inngest-worker' });
  });

  it('Test 10: When claim fails, bead_claimed event is NOT emitted', async () => {
    const schedulerModule = await import('../scheduler.js');
    const { appendEvent } = await import('@get-cauldron/shared');

    vi.mocked(schedulerModule.claimBead).mockResolvedValue({
      success: false,
      beadId: BEAD_ID,
      agentId: 'inngest-worker',
    });

    const mockSelect = vi.fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // no waits_for edges
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // no conditional edges
        }),
      });
    const db = { ...mockDb, select: mockSelect } as any;

    const { configureSchedulerDeps, beadDispatchHandler } = await import('../events.js');
    configureSchedulerDeps({ db });

    const fakeStep = makeFakeStep();
    await beadDispatchHandler({
      event: { data: { beadId: BEAD_ID, seedId: SEED_ID, projectId: PROJECT_ID, moleculeId: null } },
      step: fakeStep as any,
    });

    const calls = vi.mocked(appendEvent).mock.calls;
    const claimedCall = calls.find(c => c[1]?.type === 'bead_claimed');
    expect(claimedCall).toBeUndefined();
  });

  it('Test 4: returns already-claimed when claim fails (another worker got it first)', async () => {
    const schedulerModule = await import('../scheduler.js');

    vi.mocked(schedulerModule.claimBead).mockResolvedValue({
      success: false,
      beadId: BEAD_ID,
      agentId: 'inngest-worker',
    });

    const mockSelect = vi.fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // no waits_for edges
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // no conditional edges
        }),
      });
    const db = { ...mockDb, select: mockSelect } as any;

    const { configureSchedulerDeps, beadDispatchHandler } = await import('../events.js');
    configureSchedulerDeps({ db });

    const fakeStep = makeFakeStep();
    const result = await beadDispatchHandler({
      event: { data: { beadId: BEAD_ID, seedId: SEED_ID, projectId: PROJECT_ID, moleculeId: null } },
      step: fakeStep as any,
    });

    expect(result.status).toBe('already-claimed');
  });
});

describe('beadCompletionHandler', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('Test 5: finds ready beads and dispatches them via step.sendEvent', async () => {
    const schedulerModule = await import('../scheduler.js');

    const readyBeads = [
      { id: 'bead-ready-1', seedId: SEED_ID, moleculeId: null, status: 'pending', version: 1, title: 'B1', spec: 's', coversCriteria: [] },
      { id: 'bead-ready-2', seedId: SEED_ID, moleculeId: 'mol-1', status: 'pending', version: 1, title: 'B2', spec: 's', coversCriteria: [] },
    ];
    vi.mocked(schedulerModule.findReadyBeads).mockResolvedValue(readyBeads as any);

    const mockSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });
    const db = { ...mockDb, select: mockSelect } as any;

    const { configureSchedulerDeps, beadCompletionHandler } = await import('../events.js');
    configureSchedulerDeps({ db });

    const fakeStep = makeFakeStep();
    const result = await beadCompletionHandler({
      event: { data: { beadId: BEAD_ID, seedId: SEED_ID, projectId: PROJECT_ID, status: 'completed' } },
      step: fakeStep as any,
    });

    expect(result.dispatched).toHaveLength(2);
    expect(result.dispatched).toContain('bead-ready-1');
    expect(result.dispatched).toContain('bead-ready-2');
    expect(fakeStep.sendEvent).toHaveBeenCalledTimes(2);
    expect(fakeStep.sendEvent).toHaveBeenCalledWith(
      expect.stringContaining('dispatch-bead-'),
      expect.objectContaining({ name: 'bead.dispatch_requested' })
    );
  });

  it('Test 6: dispatches nothing when no beads are ready', async () => {
    const schedulerModule = await import('../scheduler.js');

    vi.mocked(schedulerModule.findReadyBeads).mockResolvedValue([]);

    const mockSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });
    const db = { ...mockDb, select: mockSelect } as any;

    const { configureSchedulerDeps, beadCompletionHandler } = await import('../events.js');
    configureSchedulerDeps({ db });

    const fakeStep = makeFakeStep();
    const result = await beadCompletionHandler({
      event: { data: { beadId: BEAD_ID, seedId: SEED_ID, projectId: PROJECT_ID, status: 'completed' } },
      step: fakeStep as any,
    });

    expect(result.dispatched).toHaveLength(0);
    expect(fakeStep.sendEvent).not.toHaveBeenCalled();
  });

  it('Test 7: handleBeadDispatchRequested and handleBeadCompleted are exported Inngest functions', async () => {
    const { handleBeadDispatchRequested, handleBeadCompleted } = await import('../events.js');
    expect(handleBeadDispatchRequested).toBeDefined();
    expect(handleBeadCompleted).toBeDefined();
  });

  it('Test 8: configureSchedulerDeps is exported', async () => {
    const { configureSchedulerDeps } = await import('../events.js');
    expect(typeof configureSchedulerDeps).toBe('function');
  });
});
