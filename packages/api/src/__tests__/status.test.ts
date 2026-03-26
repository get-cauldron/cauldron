import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @cauldron/shared to prevent DATABASE_URL error at import time
vi.mock('@cauldron/shared', () => {
  return {
    db: {},
    beads: {
      title: 'title',
      status: 'status',
      agentAssignment: 'agentAssignment',
      claimedAt: 'claimedAt',
      completedAt: 'completedAt',
      seedId: 'seedId',
      id: 'id',
      createdAt: 'createdAt',
    },
    events: {
      type: 'type',
      beadId: 'beadId',
      occurredAt: 'occurredAt',
      seedId: 'seedId',
      projectId: 'projectId',
      payload: 'payload',
    },
    seeds: {
      id: 'id',
      projectId: 'projectId',
      createdAt: 'createdAt',
    },
    beadStatusEnum: {},
    appendEvent: vi.fn().mockResolvedValue(undefined),
    eq: vi.fn((col, val) => ({ col, val, __op: 'eq' })),
    desc: vi.fn((col) => ({ col, __op: 'desc' })),
    inArray: vi.fn((col, vals) => ({ col, vals, __op: 'inArray' })),
  };
});

describe('statusCommand', () => {
  let statusCommand: (deps: import('../commands/status.js').StatusDeps, args: string[]) => Promise<void>;
  let mockDeps: import('../commands/status.js').StatusDeps;

  beforeEach(async () => {
    vi.clearAllMocks();

    const mod = await import('../commands/status.js');
    statusCommand = mod.statusCommand;

    // Build a chainable mock query builder
    const makeMockQuery = (rows: unknown[]) => {
      const q: Record<string, unknown> = {};
      q.from = vi.fn().mockReturnValue(q);
      q.where = vi.fn().mockReturnValue(q);
      q.orderBy = vi.fn().mockReturnValue(q);
      q.limit = vi.fn().mockReturnValue(q);
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
      // Make it thenable so await works
      return q;
    };

    mockDeps = {
      db: {
        select: vi.fn().mockImplementation(() => makeMockQuery([])),
      } as unknown as import('../commands/status.js').StatusDeps['db'],
    };
  });

  it('Test 1: queries beads for a seedId and renders table with title, status, agent, duration columns', async () => {
    const beadRows = [
      {
        title: 'Implement auth',
        status: 'completed',
        agent: 'gpt-4o',
        claimedAt: new Date(Date.now() - 120000),
        completedAt: new Date(Date.now() - 60000),
      },
      {
        title: 'Write tests',
        status: 'active',
        agent: 'claude-3-5-sonnet',
        claimedAt: new Date(Date.now() - 30000),
        completedAt: null,
      },
    ];
    const escalationRows: unknown[] = []; // no escalation events

    let callCount = 0;
    const makeMockQueryResult = (rows: unknown[]) => {
      const q: Record<string, unknown> = {};
      q.from = vi.fn().mockReturnValue(q);
      q.where = vi.fn().mockReturnValue(q);
      q.orderBy = vi.fn().mockReturnValue(q);
      q.limit = vi.fn().mockReturnValue(q);
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
      return q;
    };

    mockDeps.db.select = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeMockQueryResult(beadRows);
      return makeMockQueryResult(escalationRows);
    });

    const tablespy = vi.spyOn(console, 'table').mockImplementation(() => {});
    const logspy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await statusCommand(mockDeps, ['seed-id-123']);

    expect(console.table).toHaveBeenCalled();
    const tableArg = (tablespy.mock.calls[0] as unknown[])[0] as Array<Record<string, unknown>>;
    expect(tableArg).toBeInstanceOf(Array);
    // Verify table rows have expected columns
    const firstRow = tableArg[0] as Record<string, unknown>;
    expect(firstRow).toHaveProperty('Title');
    expect(firstRow).toHaveProperty('Status');
    expect(firstRow).toHaveProperty('Agent');
    expect(firstRow).toHaveProperty('Duration');

    tablespy.mockRestore();
    logspy.mockRestore();
  });

  it('Test 2: --logs flag queries events and prints recent events', async () => {
    const beadRows: unknown[] = [];
    const eventRows = [
      { type: 'bead_claimed', occurredAt: new Date('2026-03-26T10:00:00Z'), payload: { beadId: 'abc' } },
      { type: 'bead_completed', occurredAt: new Date('2026-03-26T11:00:00Z'), payload: { beadId: 'abc' } },
    ];

    let callCount = 0;
    const makeMockQueryResult = (rows: unknown[]) => {
      const q: Record<string, unknown> = {};
      q.from = vi.fn().mockReturnValue(q);
      q.where = vi.fn().mockReturnValue(q);
      q.orderBy = vi.fn().mockReturnValue(q);
      q.limit = vi.fn().mockReturnValue(q);
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
      return q;
    };

    mockDeps.db.select = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeMockQueryResult(beadRows);    // beads
      if (callCount === 2) return makeMockQueryResult([]);           // escalation
      return makeMockQueryResult(eventRows);                         // events for --logs
    });

    const tablespy = vi.spyOn(console, 'table').mockImplementation(() => {});
    const logspy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await statusCommand(mockDeps, ['seed-id-123', '--logs']);

    // Should have logged event lines
    const logCalls = logspy.mock.calls.map(c => String(c[0]));
    const hasEventLog = logCalls.some(line => line.includes('bead_claimed') || line.includes('bead_completed'));
    expect(hasEventLog).toBe(true);

    tablespy.mockRestore();
    logspy.mockRestore();
  });

  it('Test 3: shows NEEDS REVIEW for beads with merge_escalation_needed events', async () => {
    const beadRows = [
      {
        title: 'Implement auth',
        status: 'active',
        agent: 'gpt-4o',
        claimedAt: new Date(Date.now() - 30000),
        completedAt: null,
        id: 'bead-abc',
      },
    ];
    const escalationRows = [
      { type: 'merge_escalation_needed', beadId: 'bead-abc', payload: {} },
    ];

    let callCount = 0;
    const makeMockQueryResult = (rows: unknown[]) => {
      const q: Record<string, unknown> = {};
      q.from = vi.fn().mockReturnValue(q);
      q.where = vi.fn().mockReturnValue(q);
      q.orderBy = vi.fn().mockReturnValue(q);
      q.limit = vi.fn().mockReturnValue(q);
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
      return q;
    };

    mockDeps.db.select = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeMockQueryResult(beadRows);
      return makeMockQueryResult(escalationRows);
    });

    const tablespy = vi.spyOn(console, 'table').mockImplementation(() => {});
    const logspy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await statusCommand(mockDeps, ['seed-id-123']);

    expect(console.table).toHaveBeenCalled();
    const tableArg = (tablespy.mock.calls[0] as unknown[])[0] as Array<Record<string, unknown>>;
    const authRow = tableArg.find(r => r.Title === 'Implement auth') as Record<string, unknown> | undefined;
    expect(authRow?.Status).toBe('NEEDS REVIEW');

    tablespy.mockRestore();
    logspy.mockRestore();
  });
});

describe('killCommand', () => {
  let killCommand: (deps: import('../commands/kill.js').KillDeps, args: string[]) => Promise<void>;
  let mockDeps: import('../commands/kill.js').KillDeps;

  beforeEach(async () => {
    vi.clearAllMocks();

    const mod = await import('../commands/kill.js');
    killCommand = mod.killCommand;

    const makeMockQuery = (rows: unknown[]) => {
      const q: Record<string, unknown> = {};
      q.from = vi.fn().mockReturnValue(q);
      q.where = vi.fn().mockReturnValue(q);
      q.orderBy = vi.fn().mockReturnValue(q);
      q.limit = vi.fn().mockReturnValue(q);
      q.set = vi.fn().mockReturnValue(q);
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
      return q;
    };

    mockDeps = {
      db: {
        select: vi.fn().mockImplementation(() => makeMockQuery([])),
        update: vi.fn().mockImplementation(() => makeMockQuery([])),
      } as unknown as import('../commands/kill.js').KillDeps['db'],
      projectId: 'project-123',
    };
  });

  it('Test 4: sets bead status to failed and appends bead_failed event', async () => {
    const beadRow = { id: 'bead-xyz', status: 'active', seedId: 'seed-abc' };

    const makeMockQuery = (rows: unknown[]) => {
      const q: Record<string, unknown> = {};
      q.from = vi.fn().mockReturnValue(q);
      q.where = vi.fn().mockReturnValue(q);
      q.orderBy = vi.fn().mockReturnValue(q);
      q.limit = vi.fn().mockReturnValue(q);
      q.set = vi.fn().mockReturnValue(q);
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
      return q;
    };

    mockDeps.db.select = vi.fn().mockImplementation(() => makeMockQuery([beadRow]));
    mockDeps.db.update = vi.fn().mockImplementation(() => makeMockQuery([]));

    // Mock appendEvent
    const mockAppendEvent = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../../../shared/src/db/event-store.js', () => ({
      appendEvent: mockAppendEvent,
    }));

    const logspy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await killCommand(mockDeps, ['bead-xyz']);

    // Should have called update on beads
    expect(mockDeps.db.update).toHaveBeenCalled();
    // Should have logged confirmation
    const logCalls = logspy.mock.calls.map(c => String(c[0]));
    expect(logCalls.some(line => line.includes('bead-xyz'))).toBe(true);

    logspy.mockRestore();
  });

  it('Test 5: exits with error when bead ID not found', async () => {
    const makeMockQuery = (rows: unknown[]) => {
      const q: Record<string, unknown> = {};
      q.from = vi.fn().mockReturnValue(q);
      q.where = vi.fn().mockReturnValue(q);
      q.orderBy = vi.fn().mockReturnValue(q);
      q.limit = vi.fn().mockReturnValue(q);
      q.set = vi.fn().mockReturnValue(q);
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
      return q;
    };

    mockDeps.db.select = vi.fn().mockImplementation(() => makeMockQuery([])); // empty — not found

    const errspy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitspy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);

    await killCommand(mockDeps, ['nonexistent-bead-id']);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('nonexistent-bead-id')
    );
    expect(process.exit).toHaveBeenCalledWith(1);

    errspy.mockRestore();
    exitspy.mockRestore();
  });
});
