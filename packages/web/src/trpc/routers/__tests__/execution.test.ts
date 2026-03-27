import { describe, it, expect, vi, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// Mocks — must be hoisted before any imports that transitively touch them
// ────────────────────────────────────────────────────────────────────────────

const mockFindReadyBeads = vi.fn();
const mockInngestSend = vi.fn();

vi.mock('@get-cauldron/engine', () => ({
  findReadyBeads: (...args: unknown[]) => mockFindReadyBeads(...args),
  inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
  runDecomposition: vi.fn(),
  // Keep InterviewFSM stub so that interview.ts can still import it
  InterviewFSM: vi.fn(function (this: unknown) {
    Object.assign(this as object, { submitAnswer: vi.fn() });
  }),
}));

vi.mock('@get-cauldron/shared', () => ({
  db: {},
  appendEvent: vi.fn().mockResolvedValue(undefined),
  beads: {},
  beadEdges: {},
  events: {},
  seeds: {},
  interviews: {},
  holdoutVault: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => `eq(${String(_col)}, ${String(_val)})`),
  desc: vi.fn((col: unknown) => `desc(${String(col)})`),
  inArray: vi.fn((_col: unknown, _vals: unknown) => `inArray(${String(_col)})`),
}));

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const VALID_PROJECT_UUID = '11111111-1111-4111-8111-111111111111';
const VALID_SEED_UUID = '22222222-2222-4222-8222-222222222222';

/**
 * Build a minimal fake tRPC context for the execution router.
 * db.select() uses a fluent builder pattern that ultimately resolves to an array.
 */
function makeCtx() {
  const chainable = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };

  const db = {
    select: vi.fn().mockReturnValue(chainable),
  };

  const getEngineDeps = vi.fn().mockResolvedValue({
    gateway: {},
    config: {},
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });

  return { db, authenticated: true, getEngineDeps };
}

// ────────────────────────────────────────────────────────────────────────────
// Import router AFTER mocks are registered
// ────────────────────────────────────────────────────────────────────────────

const { executionRouter } = await import('../execution.js');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callMutation(name: string, input: unknown, ctx: unknown) {
  const caller = executionRouter.createCaller(ctx as Parameters<typeof executionRouter.createCaller>[0]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (caller as any)[name](input);
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe('triggerExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls findReadyBeads with seedId and dispatches one event per bead', async () => {
    mockFindReadyBeads.mockResolvedValue([
      { id: 'bead-1', moleculeId: 'mol-1' },
      { id: 'bead-2', moleculeId: 'mol-2' },
    ]);
    mockInngestSend.mockResolvedValue(undefined);

    const ctx = makeCtx();
    const result = await callMutation('triggerExecution', {
      projectId: VALID_PROJECT_UUID,
      seedId: VALID_SEED_UUID,
    }, ctx);

    // findReadyBeads should be called with (db, seedId)
    expect(mockFindReadyBeads).toHaveBeenCalledWith(ctx.db, VALID_SEED_UUID);

    // send should be called once per bead
    expect(mockInngestSend).toHaveBeenCalledTimes(2);

    // First bead dispatch
    expect(mockInngestSend).toHaveBeenNthCalledWith(1, {
      name: 'bead.dispatch_requested',
      data: {
        beadId: 'bead-1',
        seedId: VALID_SEED_UUID,
        projectId: VALID_PROJECT_UUID,
        moleculeId: 'mol-1',
      },
    });

    // Second bead dispatch
    expect(mockInngestSend).toHaveBeenNthCalledWith(2, {
      name: 'bead.dispatch_requested',
      data: {
        beadId: 'bead-2',
        seedId: VALID_SEED_UUID,
        projectId: VALID_PROJECT_UUID,
        moleculeId: 'mol-2',
      },
    });

    expect(result).toMatchObject({ success: true });
  });

  it('dispatches nothing when findReadyBeads returns empty array', async () => {
    mockFindReadyBeads.mockResolvedValue([]);

    const ctx = makeCtx();
    const result = await callMutation('triggerExecution', {
      projectId: VALID_PROJECT_UUID,
      seedId: VALID_SEED_UUID,
    }, ctx);

    // send should NOT be called when no ready beads
    expect(mockInngestSend).not.toHaveBeenCalled();

    // Result message should indicate 0 beads dispatched
    expect(result.message).toContain('0 beads dispatched');
    expect(result.success).toBe(true);
  });

  it('includes moleculeId in dispatch payload (including null)', async () => {
    mockFindReadyBeads.mockResolvedValue([
      { id: 'bead-3', moleculeId: null },
    ]);
    mockInngestSend.mockResolvedValue(undefined);

    const ctx = makeCtx();
    await callMutation('triggerExecution', {
      projectId: VALID_PROJECT_UUID,
      seedId: VALID_SEED_UUID,
    }, ctx);

    expect(mockInngestSend).toHaveBeenCalledOnce();
    const sendCall = mockInngestSend.mock.calls[0]![0] as { name: string; data: Record<string, unknown> };
    expect(sendCall.data.moleculeId).toBe(null);
    expect('moleculeId' in sendCall.data).toBe(true);
  });
});
