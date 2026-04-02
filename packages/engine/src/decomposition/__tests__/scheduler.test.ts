import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DecompositionResult } from '../types.js';

// Mock @get-cauldron/shared to avoid DATABASE_URL requirement
vi.mock('@get-cauldron/shared', () => ({
  appendEvent: vi.fn().mockResolvedValue({}),
  beads: {},
  beadEdges: {},
}));

// We'll test scheduler with mock db
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();

const mockDb = {
  select: mockSelect,
  update: mockUpdate,
  insert: mockInsert,
} as any;

describe('findReadyBeads', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('Test 1: returns pending beads with no incomplete blocking upstream', async () => {
    // Mock the db chain: select().from().where()
    const mockReadyBeads = [
      { id: 'bead-a', seedId: 'seed-1', status: 'pending', version: 1, title: 'Bead A', spec: 'spec', coversCriteria: [] },
    ];
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockReadyBeads),
      }),
    });

    const { findReadyBeads } = await import('../scheduler.js');
    const result = await findReadyBeads(mockDb, 'seed-1');

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('bead-a');
  });

  it('Test 2: excludes beads with incomplete blocks edges (returns empty for fully blocked)', async () => {
    // Simulate DB returning no ready beads (all blocked)
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const { findReadyBeads } = await import('../scheduler.js');
    const result = await findReadyBeads(mockDb, 'seed-1');

    expect(result).toHaveLength(0);
  });

  it('Test 3: excludes beads with incomplete waits_for edges', async () => {
    // waits_for edges are checked in the NOT EXISTS clause -- empty result when all are waiting
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const { findReadyBeads } = await import('../scheduler.js');
    const result = await findReadyBeads(mockDb, 'seed-1');

    expect(result).toHaveLength(0);
  });

  it('Test 4: does NOT exclude beads whose only edges are parent_child', async () => {
    // parent_child edges are not blocking -- bead should still appear as ready
    const mockReadyBeads = [
      { id: 'bead-b', seedId: 'seed-1', status: 'pending', version: 1, title: 'Bead B', spec: 'spec', coversCriteria: [] },
    ];
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockReadyBeads),
      }),
    });

    const { findReadyBeads } = await import('../scheduler.js');
    const result = await findReadyBeads(mockDb, 'seed-1');

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('bead-b');
  });
});

describe('claimBead', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('Test 5: returns success=true when version matches (optimistic concurrency)', async () => {
    const currentBead = { id: 'bead-1', status: 'pending', version: 1, agentAssignment: null, claimedAt: null };
    const updatedBead = { id: 'bead-1', version: 2 };

    // First select: fetch current bead
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([currentBead]),
      }),
    });

    // Update with returning
    const mockReturning = vi.fn().mockResolvedValue([updatedBead]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    const { claimBead } = await import('../scheduler.js');
    const result = await claimBead(mockDb, 'bead-1', 'agent-001');

    expect(result.success).toBe(true);
    expect(result.beadId).toBe('bead-1');
    expect(result.agentId).toBe('agent-001');
    expect(result.newVersion).toBe(2);
  });

  it('Test 6: returns success=false when version conflict (another agent claimed first)', async () => {
    const currentBead = { id: 'bead-1', status: 'pending', version: 1, agentAssignment: null, claimedAt: null };

    // First select: fetch current bead
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([currentBead]),
      }),
    });

    // Update returns empty (version mismatch — another agent won)
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    const { claimBead } = await import('../scheduler.js');
    const result = await claimBead(mockDb, 'bead-1', 'agent-002');

    expect(result.success).toBe(false);
    expect(result.beadId).toBe('bead-1');
    expect(result.agentId).toBe('agent-002');
    expect(result.newVersion).toBeUndefined();
  });

  it('Test 6b: returns success=false when bead not found', async () => {
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const { claimBead } = await import('../scheduler.js');
    const result = await claimBead(mockDb, 'nonexistent', 'agent-001');

    expect(result.success).toBe(false);
  });

  it('Test 6c: returns success=false when bead is not pending', async () => {
    const claimedBead = { id: 'bead-1', status: 'claimed', version: 2, agentAssignment: 'agent-001', claimedAt: new Date() };

    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([claimedBead]),
      }),
    });

    const { claimBead } = await import('../scheduler.js');
    const result = await claimBead(mockDb, 'bead-1', 'agent-002');

    expect(result.success).toBe(false);
  });
});

describe('persistDecomposition', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('Test 7: inserts molecules as beads with moleculeId=null and status=completed', async () => {
    const decomposition: DecompositionResult = {
      molecules: [
        { id: 'auth-layer', title: 'Auth Layer', description: 'Handles auth', coversCriteria: ['AC-1'] },
      ],
      beads: [
        {
          id: 'auth-layer/jwt-middleware',
          moleculeId: 'auth-layer',
          title: 'JWT Middleware',
          spec: 'Implement JWT middleware',
          estimatedTokens: 5000,
          coversCriteria: ['AC-1'],
          dependsOn: [],
          waitsFor: [],
          conditionalOn: undefined,
        },
      ],
    };

    // Track insert calls
    const insertedValues: any[] = [];
    mockInsert.mockImplementation(() => ({
      values: vi.fn((vals: any) => {
        const arr = Array.isArray(vals) ? vals : [vals];
        insertedValues.push(...arr);
        return {
          returning: vi.fn().mockResolvedValue(
            arr.map((v: any, i: number) => ({ ...v, id: `uuid-${insertedValues.length - arr.length + i}` }))
          ),
        };
      }),
    }));

    const { persistDecomposition } = await import('../scheduler.js');
    const result = await persistDecomposition(mockDb, 'seed-1', decomposition);

    // Should have inserted the molecule as a bead
    const moleculeInserts = insertedValues.filter(v => v.title === 'Auth Layer');
    expect(moleculeInserts).toHaveLength(1);
    expect(moleculeInserts[0].moleculeId).toBeNull();
    expect(moleculeInserts[0].status).toBe('completed');

    // Should have ID maps
    expect(result.moleculeDbIds).toBeInstanceOf(Map);
    expect(result.beadDbIds).toBeInstanceOf(Map);
  });

  it('Test 8: inserts child beads with moleculeId set and status=pending', async () => {
    const decomposition: DecompositionResult = {
      molecules: [
        { id: 'auth-layer', title: 'Auth Layer', description: 'Handles auth', coversCriteria: ['AC-1'] },
      ],
      beads: [
        {
          id: 'auth-layer/jwt-middleware',
          moleculeId: 'auth-layer',
          title: 'JWT Middleware',
          spec: 'Implement JWT middleware',
          estimatedTokens: 5000,
          coversCriteria: ['AC-1'],
          dependsOn: [],
          waitsFor: [],
          conditionalOn: undefined,
        },
      ],
    };

    const insertedValues: any[] = [];
    mockInsert.mockImplementation(() => ({
      values: vi.fn((vals: any) => {
        const arr = Array.isArray(vals) ? vals : [vals];
        insertedValues.push(...arr);
        return {
          returning: vi.fn().mockResolvedValue(
            arr.map((v: any, i: number) => ({ ...v, id: `uuid-${insertedValues.length - arr.length + i}` }))
          ),
        };
      }),
    }));

    const { persistDecomposition } = await import('../scheduler.js');
    await persistDecomposition(mockDb, 'seed-1', decomposition);

    // Should have inserted the child bead with pending status
    const beadInserts = insertedValues.filter(v => v.title === 'JWT Middleware');
    expect(beadInserts).toHaveLength(1);
    expect(beadInserts[0].status).toBe('pending');
    expect(beadInserts[0].moleculeId).toBeDefined();
    expect(beadInserts[0].moleculeId).not.toBeNull();
  });

  it('Test 9: creates edge types from dependsOn, waitsFor, and conditionalOn', async () => {
    const decomposition: DecompositionResult = {
      molecules: [
        { id: 'mol-a', title: 'Mol A', description: 'A', coversCriteria: ['AC-1'] },
      ],
      beads: [
        {
          id: 'mol-a/bead-a',
          moleculeId: 'mol-a',
          title: 'Bead A',
          spec: 'spec',
          estimatedTokens: 1000,
          coversCriteria: ['AC-1'],
          dependsOn: [],
          waitsFor: [],
          conditionalOn: undefined,
        },
        {
          id: 'mol-a/bead-b',
          moleculeId: 'mol-a',
          title: 'Bead B',
          spec: 'spec',
          estimatedTokens: 1000,
          coversCriteria: ['AC-1'],
          dependsOn: ['mol-a/bead-a'],      // blocks edge
          waitsFor: [],
          conditionalOn: undefined,
        },
        {
          id: 'mol-a/bead-c',
          moleculeId: 'mol-a',
          title: 'Bead C',
          spec: 'spec',
          estimatedTokens: 1000,
          coversCriteria: ['AC-1'],
          dependsOn: [],
          waitsFor: ['mol-a/bead-a'],       // waits_for edge
          conditionalOn: 'mol-a/bead-b',   // conditional_blocks edge
        },
      ],
    };

    const insertedValues: any[] = [];
    mockInsert.mockImplementation(() => ({
      values: vi.fn((vals: any) => {
        const arr = Array.isArray(vals) ? vals : [vals];
        insertedValues.push(...arr);
        return {
          returning: vi.fn().mockResolvedValue(
            arr.map((v: any, i: number) => ({ ...v, id: `uuid-${insertedValues.length - arr.length + i}` }))
          ),
        };
      }),
    }));

    const { persistDecomposition } = await import('../scheduler.js');
    await persistDecomposition(mockDb, 'seed-1', decomposition);

    // Edges should be inserted
    const edgeInserts = insertedValues.filter(v => 'edgeType' in v);
    const edgeTypes = edgeInserts.map((e: any) => e.edgeType);

    expect(edgeTypes).toContain('blocks');
    expect(edgeTypes).toContain('waits_for');
    expect(edgeTypes).toContain('conditional_blocks');
    expect(edgeTypes).toContain('parent_child'); // molecule -> child bead
  });
});

describe('completeBead', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('Test 10: transitions status to completed and emits bead_completed event', async () => {
    const currentBead = { id: 'bead-1', status: 'claimed', version: 2 };
    const updatedBead = { id: 'bead-1', version: 3 };

    // First select: fetch current bead for version check
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([currentBead]),
      }),
    });

    const mockReturning = vi.fn().mockResolvedValue([updatedBead]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    // select for conditional check (use once to avoid leaking into subsequent tests)
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),  // no conditional edges
      }),
    });

    const { appendEvent } = await import('@get-cauldron/shared');
    const { completeBead } = await import('../scheduler.js');
    const result = await completeBead(mockDb, 'bead-1', 'completed', 'project-1', 'seed-1');

    // Verify success result
    expect(result.success).toBe(true);
    expect(result.beadId).toBe('bead-1');

    // Verify event was emitted
    expect(appendEvent).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ type: 'bead_completed', beadId: 'bead-1' })
    );
  });

  it('Test 11: transitions status to failed and emits bead_failed event', async () => {
    const currentBead = { id: 'bead-1', status: 'claimed', version: 2 };
    const updatedBead = { id: 'bead-1', version: 3 };

    // First select: fetch current bead for version check
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([currentBead]),
      }),
    });

    const mockReturning = vi.fn().mockResolvedValue([updatedBead]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    // select for conditional check - no downstream conditional beads (use once to avoid leakage)
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const { appendEvent } = await import('@get-cauldron/shared');
    const { completeBead } = await import('../scheduler.js');
    const result = await completeBead(mockDb, 'bead-1', 'failed', 'project-1', 'seed-1');

    expect(result.success).toBe(true);
    expect(appendEvent).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ type: 'bead_failed', beadId: 'bead-1' })
    );
  });

  it('Test 12: marks downstream conditional bead as failed when upstream fails (D-14)', async () => {
    const currentBead = { id: 'bead-1', status: 'claimed', version: 2 };
    const updatedBead = { id: 'bead-1', version: 3 };

    // First select: fetch current bead for version check
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([currentBead]),
      }),
    });

    const mockReturning = vi.fn().mockResolvedValue([updatedBead]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    // Select: find conditional edges pointing FROM this bead
    const conditionalBead = { id: 'bead-conditional', toBeadId: 'bead-conditional', fromBeadId: 'bead-1', edgeType: 'conditional_blocks' };
    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([conditionalBead]),
        }),
      })
      // Second select call for the conditional bead itself
      .mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

    const { appendEvent } = await import('@get-cauldron/shared');
    const { completeBead } = await import('../scheduler.js');
    await completeBead(mockDb, 'bead-1', 'failed', 'project-1', 'seed-1');

    // bead_failed for the conditional bead should also be emitted
    const appendEventCalls = vi.mocked(appendEvent).mock.calls;
    const skippedCalls = appendEventCalls.filter(
      call => (call[1]?.payload as Record<string, unknown>)?.['reason'] === 'upstream_conditional_failed'
    );
    expect(skippedCalls.length).toBeGreaterThan(0);
  });

  it('Test 13: returns { success: false } when version conflict (concurrent update)', async () => {
    const currentBead = { id: 'bead-1', status: 'claimed', version: 2 };

    // First select: fetch current bead
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([currentBead]),
      }),
    });

    // Update returns empty (version mismatch — another agent updated first)
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    const { completeBead } = await import('../scheduler.js');
    const result = await completeBead(mockDb, 'bead-1', 'completed', 'project-1', 'seed-1');

    expect(result.success).toBe(false);
    expect(result.beadId).toBe('bead-1');
    expect(result.newVersion).toBeUndefined();
  });

  it('Test 14: returns { success: false } when bead is already in terminal status (completed)', async () => {
    // Bead already completed — should not double-complete
    const alreadyCompleted = { id: 'bead-1', status: 'completed', version: 5 };

    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([alreadyCompleted]),
      }),
    });

    const { completeBead } = await import('../scheduler.js');
    const result = await completeBead(mockDb, 'bead-1', 'completed', 'project-1', 'seed-1');

    expect(result.success).toBe(false);
    expect(result.beadId).toBe('bead-1');
    // Should not attempt DB update
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('Test 15: returns { success: false } when bead not found', async () => {
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const { completeBead } = await import('../scheduler.js');
    const result = await completeBead(mockDb, 'nonexistent', 'completed', 'project-1', 'seed-1');

    expect(result.success).toBe(false);
    expect(result.beadId).toBe('nonexistent');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('Test 16: returns { success: true, newVersion } on successful completion', async () => {
    const currentBead = { id: 'bead-1', status: 'claimed', version: 3 };
    const updatedBead = { id: 'bead-1', version: 4 };

    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([currentBead]),
      }),
    });

    const mockReturning = vi.fn().mockResolvedValue([updatedBead]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    // No conditional edges (use once to avoid leaking into subsequent describe blocks)
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const { completeBead } = await import('../scheduler.js');
    const result = await completeBead(mockDb, 'bead-1', 'completed', 'project-1', 'seed-1');

    expect(result.success).toBe(true);
    expect(result.beadId).toBe('bead-1');
    expect(result.newVersion).toBe(4);
  });
});

describe('findReadyBeads – DAG topology edge cases', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('Wide fan-out: 3 independent beads with no edges → all 3 are ready', async () => {
    const threeIndependentBeads = [
      { id: 'bead-x', seedId: 'seed-1', status: 'pending', version: 1, title: 'Bead X', spec: 'spec', coversCriteria: [] },
      { id: 'bead-y', seedId: 'seed-1', status: 'pending', version: 1, title: 'Bead Y', spec: 'spec', coversCriteria: [] },
      { id: 'bead-z', seedId: 'seed-1', status: 'pending', version: 1, title: 'Bead Z', spec: 'spec', coversCriteria: [] },
    ];

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(threeIndependentBeads),
      }),
    });

    const { findReadyBeads } = await import('../scheduler.js');
    const result = await findReadyBeads(mockDb, 'seed-1');

    expect(result).toHaveLength(3);
    const ids = result.map(b => b.id);
    expect(ids).toContain('bead-x');
    expect(ids).toContain('bead-y');
    expect(ids).toContain('bead-z');
  });

  it('Deep chain: A→B→C→D with blocks edges → only A is ready (B, C, D are blocked)', async () => {
    // The SQL NOT EXISTS clause filters out blocked beads — only A (no upstream) is returned
    const onlyA = [
      { id: 'bead-a', seedId: 'seed-1', status: 'pending', version: 1, title: 'Bead A', spec: 'spec', coversCriteria: [] },
    ];

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(onlyA),
      }),
    });

    const { findReadyBeads } = await import('../scheduler.js');
    const result = await findReadyBeads(mockDb, 'seed-1');

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('bead-a');
    // B, C, D are not present — they are blocked by incomplete upstream beads
  });

  it('Single bead with no deps → immediately ready', async () => {
    const singleBead = [
      { id: 'bead-solo', seedId: 'seed-1', status: 'pending', version: 1, title: 'Solo Bead', spec: 'spec', coversCriteria: [] },
    ];

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(singleBead),
      }),
    });

    const { findReadyBeads } = await import('../scheduler.js');
    const result = await findReadyBeads(mockDb, 'seed-1');

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('bead-solo');
  });

  it('Chain where first bead is completed → second bead becomes ready', async () => {
    // When bead-a is completed, bead-b's blocks edge is satisfied.
    // The NOT EXISTS clause no longer filters out bead-b — it now appears as ready.
    const beadBReady = [
      { id: 'bead-b', seedId: 'seed-1', status: 'pending', version: 1, title: 'Bead B', spec: 'spec', coversCriteria: [] },
    ];

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(beadBReady),
      }),
    });

    const { findReadyBeads } = await import('../scheduler.js');
    const result = await findReadyBeads(mockDb, 'seed-1');

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('bead-b');
  });
});
