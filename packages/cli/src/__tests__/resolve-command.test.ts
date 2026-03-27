import { describe, it, expect, vi, beforeEach } from 'vitest';

// resolve.ts now uses tRPC client exclusively — no @get-cauldron/shared imports
describe('resolveCommand', () => {
  let resolveCommand: typeof import('../commands/resolve.js').resolveCommand;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../commands/resolve.js');
    resolveCommand = mod.resolveCommand;
  });

  function makeClient(mutateResult?: unknown) {
    return {
      execution: {
        respondToEscalation: {
          mutate: vi.fn().mockResolvedValue(mutateResult ?? { success: true }),
        },
      },
    } as unknown as Parameters<typeof resolveCommand>[0];
  }

  it('Test 1: calls respondToEscalation with retry action by default', async () => {
    const mutateFn = vi.fn().mockResolvedValue({ success: true });
    const client = {
      execution: { respondToEscalation: { mutate: mutateFn } },
    } as unknown as Parameters<typeof resolveCommand>[0];
    const logspy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await resolveCommand(client, ['bead-123'], { json: false, projectId: 'project-123' });

    expect(mutateFn).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-123',
      beadId: 'bead-123',
      action: 'retry',
    }));

    logspy.mockRestore();
  });

  it('Test 2: passes guidance when --guidance flag is provided', async () => {
    const mutateFn = vi.fn().mockResolvedValue({ success: true });
    const client = {
      execution: { respondToEscalation: { mutate: mutateFn } },
    } as unknown as Parameters<typeof resolveCommand>[0];
    const logspy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await resolveCommand(
      client,
      ['bead-abc', '--action', 'guidance', '--guidance', 'Use async approach'],
      { json: false, projectId: 'proj-1' }
    );

    expect(mutateFn).toHaveBeenCalledWith(expect.objectContaining({
      action: 'guidance',
      guidance: 'Use async approach',
    }));

    logspy.mockRestore();
  });

  it('Test 3: exits when beadId not provided', async () => {
    const client = makeClient();
    const errspy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exitspy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as () => never);

    await expect(
      resolveCommand(client, [], { json: false, projectId: 'proj-1' })
    ).rejects.toThrow('process.exit called');

    errspy.mockRestore();
    exitspy.mockRestore();
  });

  it('Test 4: exits when projectId not provided', async () => {
    const client = makeClient();
    const errspy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exitspy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as () => never);

    await expect(
      resolveCommand(client, ['bead-123'], { json: false })
    ).rejects.toThrow('process.exit called');

    errspy.mockRestore();
    exitspy.mockRestore();
  });
});
