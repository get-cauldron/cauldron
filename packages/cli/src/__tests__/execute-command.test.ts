import { describe, it, expect, vi, beforeEach } from 'vitest';

// execute.ts now uses tRPC client exclusively — triggers via execution.triggerExecution
describe('executeCommand', () => {
  let executeCommand: typeof import('../commands/execute.js').executeCommand;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../commands/execute.js');
    executeCommand = mod.executeCommand;
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
        triggerExecution: {
          mutate: vi.fn().mockResolvedValue(
            overrides?.triggerResult ?? { success: true, message: 'Execution triggered' }
          ),
        },
      },
    } as unknown as Parameters<typeof executeCommand>[0];
  }

  it('Test 1: calls triggerExecution with projectId and seedId from DAG', async () => {
    const mutateFn = vi.fn().mockResolvedValue({ success: true, message: 'Execution triggered' });
    const client = {
      execution: {
        getProjectDAG: { query: vi.fn().mockResolvedValue({ beads: [], edges: [], seedId: 'seed-xyz' }) },
        triggerExecution: { mutate: mutateFn },
      },
    } as unknown as Parameters<typeof executeCommand>[0];
    const logspy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await executeCommand(client, [], { json: false, projectId: 'project-123' });

    expect(mutateFn).toHaveBeenCalledWith({ projectId: 'project-123', seedId: 'seed-xyz' });

    logspy.mockRestore();
  });

  it('Test 2: uses --seed-id arg when provided (skips DAG query)', async () => {
    const dagQuery = vi.fn();
    const mutateFn = vi.fn().mockResolvedValue({ success: true, message: 'Execution triggered' });
    const client = {
      execution: {
        getProjectDAG: { query: dagQuery },
        triggerExecution: { mutate: mutateFn },
      },
    } as unknown as Parameters<typeof executeCommand>[0];
    const logspy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await executeCommand(client, ['--seed-id', 'explicit-seed'], { json: false, projectId: 'project-123' });

    expect(dagQuery).not.toHaveBeenCalled();
    expect(mutateFn).toHaveBeenCalledWith({ projectId: 'project-123', seedId: 'explicit-seed' });

    logspy.mockRestore();
  });

  it('Test 3: outputs JSON when json flag is set', async () => {
    const result = { success: true, message: 'Execution triggered' };
    const client = makeClient({ triggerResult: result });
    const logspy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await executeCommand(client, ['--seed-id', 'seed-1'], { json: true, projectId: 'project-123' });

    const output = logspy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as typeof result;
    expect(parsed.success).toBe(true);

    logspy.mockRestore();
  });

  it('Test 4: exits with error when no seedId found in DAG', async () => {
    const client = makeClient({ dagResult: { beads: [], edges: [], seedId: null } });
    const errspy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exitspy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as () => never);

    await expect(
      executeCommand(client, [], { json: false, projectId: 'project-123' })
    ).rejects.toThrow('process.exit called');

    errspy.mockRestore();
    exitspy.mockRestore();
  });
});
