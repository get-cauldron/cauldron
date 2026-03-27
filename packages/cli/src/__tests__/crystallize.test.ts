import { describe, it, expect, vi, beforeEach } from 'vitest';

// crystallize.ts now uses tRPC client exclusively — no @get-cauldron/engine or @get-cauldron/shared imports
describe('crystallizeCommand', () => {
  let crystallizeCommand: typeof import('../commands/crystallize.js').crystallizeCommand;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../commands/crystallize.js');
    crystallizeCommand = mod.crystallizeCommand;
  });

  function makeClient(overrides?: {
    getSummaryResult?: unknown;
    approveSummaryResult?: unknown;
  }) {
    return {
      interview: {
        getSummary: {
          query: vi.fn().mockResolvedValue(
            overrides?.getSummaryResult ?? {
              phase: 'reviewing',
              summary: 'Build a file renamer CLI',
              interviewId: 'interview-1',
            }
          ),
        },
        approveSummary: {
          mutate: vi.fn().mockResolvedValue(
            overrides?.approveSummaryResult ?? { seedId: 'seed-new', version: 1 }
          ),
        },
      },
    } as unknown as Parameters<typeof crystallizeCommand>[0];
  }

  it('Test 1: calls getSummary then approveSummary when phase is reviewing', async () => {
    const approveFn = vi.fn().mockResolvedValue({ seedId: 'seed-123', version: 1 });
    const client = {
      interview: {
        getSummary: { query: vi.fn().mockResolvedValue({ phase: 'reviewing', summary: 'My seed spec', interviewId: 'iv-1' }) },
        approveSummary: { mutate: approveFn },
      },
    } as unknown as Parameters<typeof crystallizeCommand>[0];
    const logspy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await crystallizeCommand(client, [], { json: false, projectId: 'project-123' });

    expect(approveFn).toHaveBeenCalledWith({ projectId: 'project-123', summary: 'My seed spec' });

    logspy.mockRestore();
  });

  it('Test 2: outputs JSON when json flag is set', async () => {
    const result = { seedId: 'seed-abc', version: 2 };
    const client = makeClient({ approveSummaryResult: result });
    const logspy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await crystallizeCommand(client, [], { json: true, projectId: 'project-123' });

    const output = logspy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as typeof result;
    expect(parsed.seedId).toBe('seed-abc');

    logspy.mockRestore();
  });

  it('Test 3: exits when phase is not reviewing', async () => {
    const client = makeClient({ getSummaryResult: { phase: 'gathering', summary: null } });
    const errspy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exitspy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as () => never);

    await expect(
      crystallizeCommand(client, [], { json: false, projectId: 'project-123' })
    ).rejects.toThrow('process.exit called');

    errspy.mockRestore();
    exitspy.mockRestore();
  });

  it('Test 4: exits when no projectId', async () => {
    const client = makeClient();
    const errspy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exitspy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as () => never);

    await expect(
      crystallizeCommand(client, [], { json: false })
    ).rejects.toThrow('process.exit called');

    errspy.mockRestore();
    exitspy.mockRestore();
  });
});
