import { describe, it, expect, vi, beforeEach } from 'vitest';

// status.ts now uses tRPC client exclusively — no @get-cauldron/shared DB imports
describe('statusCommand', () => {
  let statusCommand: typeof import('../commands/status.js').statusCommand;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../commands/status.js');
    statusCommand = mod.statusCommand;
  });

  function makeClient(dagResult?: {
    beads: unknown[];
    edges: unknown[];
    seedId: string | null;
  }) {
    return {
      execution: {
        getProjectDAG: {
          query: vi.fn().mockResolvedValue(dagResult ?? { beads: [], edges: [], seedId: null }),
        },
        getBeadDetail: {
          query: vi.fn().mockResolvedValue({ bead: {}, events: [] }),
        },
        getPipelineStatus: {
          query: vi.fn().mockResolvedValue({ queued: false, activePipelineId: null }),
        },
      },
    } as unknown as Parameters<typeof statusCommand>[0];
  }

  it('Test 1: calls getProjectDAG and renders table with title, status, agent, duration columns', async () => {
    const beads = [
      {
        id: 'bead-1',
        title: 'Implement auth',
        status: 'completed',
        agentAssignment: 'gpt-4o',
        claimedAt: new Date(Date.now() - 120000),
        completedAt: new Date(Date.now() - 60000),
      },
      {
        id: 'bead-2',
        title: 'Write tests',
        status: 'active',
        agentAssignment: 'claude-3-5-sonnet',
        claimedAt: new Date(Date.now() - 30000),
        completedAt: null,
      },
    ];
    const client = makeClient({ beads, edges: [], seedId: 'seed-1' });
    const logspy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await statusCommand(client, [], { json: false, projectId: 'project-123' });

    // Table output should include bead titles
    const output = logspy.mock.calls.flat().join(' ');
    expect(output).toContain('Implement auth');
    expect(output).toContain('Write tests');

    logspy.mockRestore();
  });

  it('Test 2: outputs JSON when json flag is set', async () => {
    const dagResult = {
      beads: [{ id: 'bead-1', title: 'Auth', status: 'pending', agentAssignment: null, claimedAt: null, completedAt: null }],
      edges: [],
      seedId: 'seed-1',
    };
    const client = makeClient(dagResult);
    const logspy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await statusCommand(client, [], { json: true, projectId: 'project-123' });

    const output = logspy.mock.calls[0]?.[0] as string;
    expect(() => JSON.parse(output)).not.toThrow();

    logspy.mockRestore();
  });

  it('Test 3: shows message when no beads found', async () => {
    const client = makeClient({ beads: [], edges: [], seedId: null });
    const logspy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await statusCommand(client, [], { json: false, projectId: 'project-123' });

    const output = logspy.mock.calls.flat().join(' ');
    expect(output).toContain('No beads found');

    logspy.mockRestore();
  });

  it('Test 4: exits with error when no projectId', async () => {
    const client = makeClient();
    const errspy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exitspy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as () => never);

    await expect(
      statusCommand(client, [], { json: false })
    ).rejects.toThrow('process.exit called');

    expect(console.error).toHaveBeenCalled();
    errspy.mockRestore();
    exitspy.mockRestore();
  });
});

describe('killCommand', () => {
  let killCommand: typeof import('../commands/kill.js').killCommand;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../commands/kill.js');
    killCommand = mod.killCommand;
  });

  function makeClient(mutateResult?: unknown) {
    return {
      execution: {
        respondToEscalation: {
          mutate: vi.fn().mockResolvedValue(mutateResult ?? { success: true }),
        },
      },
    } as unknown as Parameters<typeof killCommand>[0];
  }

  it('Test 5: calls respondToEscalation with action abort', async () => {
    const mutateFn = vi.fn().mockResolvedValue({ success: true });
    const client = {
      execution: { respondToEscalation: { mutate: mutateFn } },
    } as unknown as Parameters<typeof killCommand>[0];
    const logspy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await killCommand(client, [], { json: false, projectId: 'project-123' });

    expect(mutateFn).toHaveBeenCalledWith(expect.objectContaining({ action: 'abort', projectId: 'project-123' }));
    logspy.mockRestore();
  });

  it('Test 6: exits with error when no projectId', async () => {
    const client = makeClient();
    const errspy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exitspy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as () => never);

    await expect(
      killCommand(client, [], { json: false })
    ).rejects.toThrow('process.exit called');

    errspy.mockRestore();
    exitspy.mockRestore();
  });
});
