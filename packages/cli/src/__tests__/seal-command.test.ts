import { describe, it, expect, vi, beforeEach } from 'vitest';

// seal.ts now uses tRPC client exclusively — no @get-cauldron/engine or @get-cauldron/shared imports
describe('sealCommand', () => {
  let sealCommand: typeof import('../commands/seal.js').sealCommand;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../commands/seal.js');
    sealCommand = mod.sealCommand;
  });

  function makeClient(overrides?: {
    holdoutsResult?: unknown;
    approveResult?: unknown;
    sealResult?: unknown;
  }) {
    return {
      interview: {
        getHoldouts: {
          query: vi.fn().mockResolvedValue(
            overrides?.holdoutsResult ?? {
              scenarios: [
                { id: 'h-1', description: 'Test file renaming', status: 'pending_review' },
                { id: 'h-2', description: 'Test error handling', status: 'pending_review' },
              ],
            }
          ),
        },
        approveHoldout: {
          mutate: vi.fn().mockResolvedValue(overrides?.approveResult ?? { holdoutId: 'h-1', status: 'approved' }),
        },
        sealHoldouts: {
          mutate: vi.fn().mockResolvedValue(overrides?.sealResult ?? { seedId: 'seed-1', sealedCount: 2 }),
        },
      },
    } as unknown as Parameters<typeof sealCommand>[0];
  }

  it('Test 1: exits when --seed-id not provided', async () => {
    const client = makeClient();
    const errspy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exitspy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as () => never);

    await expect(
      sealCommand(client, [], { json: false })
    ).rejects.toThrow('process.exit called');

    errspy.mockRestore();
    exitspy.mockRestore();
  });

  it('Test 2: calls getHoldouts with seedId', async () => {
    const holdoutsFn = vi.fn().mockResolvedValue({ scenarios: [] });
    const client = {
      interview: {
        getHoldouts: { query: holdoutsFn },
        approveHoldout: { mutate: vi.fn() },
        sealHoldouts: { mutate: vi.fn() },
      },
    } as unknown as Parameters<typeof sealCommand>[0];
    const logspy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await sealCommand(client, ['--seed-id', 'seed-xyz'], { json: false });

    expect(holdoutsFn).toHaveBeenCalledWith({ seedId: 'seed-xyz' });

    logspy.mockRestore();
  });

  it('Test 3: calls approveHoldout and sealHoldouts when --approve-all is set', async () => {
    const approveFn = vi.fn().mockResolvedValue({ holdoutId: 'h-1', status: 'approved' });
    const sealFn = vi.fn().mockResolvedValue({ seedId: 'seed-1', sealedCount: 2 });
    const client = {
      interview: {
        getHoldouts: { query: vi.fn().mockResolvedValue({ scenarios: [
          { id: 'h-1', description: 'Test 1', status: 'pending_review' },
          { id: 'h-2', description: 'Test 2', status: 'pending_review' },
        ] }) },
        approveHoldout: { mutate: approveFn },
        sealHoldouts: { mutate: sealFn },
      },
    } as unknown as Parameters<typeof sealCommand>[0];
    const logspy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await sealCommand(client, ['--seed-id', 'seed-1', '--approve-all'], { json: false });

    expect(approveFn).toHaveBeenCalledTimes(2);
    expect(sealFn).toHaveBeenCalledWith({ seedId: 'seed-1' });

    logspy.mockRestore();
  });

  it('Test 4: outputs JSON when json flag is set', async () => {
    const sealResult = { seedId: 'seed-1', sealedCount: 1 };
    const client = makeClient({ sealResult });
    const logspy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await sealCommand(client, ['--seed-id', 'seed-1', '--approve-all'], { json: true });

    // JSON output should include the seal result
    const outputs = logspy.mock.calls.flat().map(String);
    const jsonOutput = outputs.find(o => {
      try { JSON.parse(o); return true; } catch { return false; }
    });
    expect(jsonOutput).toBeDefined();

    logspy.mockRestore();
  });
});
