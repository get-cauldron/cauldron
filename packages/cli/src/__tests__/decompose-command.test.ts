import { describe, it, expect, vi, beforeEach } from 'vitest';

// decompose.ts now uses tRPC client exclusively — triggers via execution.triggerDecomposition
describe('decomposeCommand', () => {
  let decomposeCommand: typeof import('../commands/decompose.js').decomposeCommand;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../commands/decompose.js');
    decomposeCommand = mod.decomposeCommand;
  });

  function makeClient(overrides?: {
    dagResult?: unknown;
    triggerResult?: unknown;
  }) {
    return {
      execution: {
        getProjectDAG: {
          query: vi.fn().mockResolvedValue(
            overrides?.dagResult ?? { beads: [], edges: [], seedId: 'seed-from-dag' }
          ),
        },
        triggerDecomposition: {
          mutate: vi.fn().mockResolvedValue(
            overrides?.triggerResult ?? { success: true, message: 'Decomposition triggered' }
          ),
        },
      },
    } as unknown as Parameters<typeof decomposeCommand>[0];
  }

  it('Test 1: calls triggerDecomposition with projectId and seedId from DAG', async () => {
    const mutateFn = vi.fn().mockResolvedValue({ success: true, message: 'Decomposition triggered' });
    const client = {
      execution: {
        getProjectDAG: { query: vi.fn().mockResolvedValue({ beads: [], edges: [], seedId: 'seed-xyz' }) },
        triggerDecomposition: { mutate: mutateFn },
      },
    } as unknown as Parameters<typeof decomposeCommand>[0];
    const logspy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await decomposeCommand(client, [], { json: false, projectId: 'project-123' });

    expect(mutateFn).toHaveBeenCalledWith({ projectId: 'project-123', seedId: 'seed-xyz' });

    logspy.mockRestore();
  });

  it('Test 2: uses --seed-id arg when provided (skips DAG query)', async () => {
    const dagQuery = vi.fn();
    const mutateFn = vi.fn().mockResolvedValue({ success: true, message: 'Decomposition triggered' });
    const client = {
      execution: {
        getProjectDAG: { query: dagQuery },
        triggerDecomposition: { mutate: mutateFn },
      },
    } as unknown as Parameters<typeof decomposeCommand>[0];
    const logspy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await decomposeCommand(client, ['--seed-id', 'explicit-seed'], { json: false, projectId: 'project-123' });

    expect(dagQuery).not.toHaveBeenCalled();
    expect(mutateFn).toHaveBeenCalledWith({ projectId: 'project-123', seedId: 'explicit-seed' });

    logspy.mockRestore();
  });

  it('Test 3: outputs JSON when json flag is set', async () => {
    const result = { success: true, message: 'Decomposition triggered' };
    const client = makeClient({ triggerResult: result });
    const logspy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await decomposeCommand(client, ['--seed-id', 'seed-1'], { json: true, projectId: 'project-123' });

    const output = logspy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as typeof result;
    expect(parsed.success).toBe(true);

    logspy.mockRestore();
  });
});
