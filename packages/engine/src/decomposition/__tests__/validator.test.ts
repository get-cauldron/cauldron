import { describe, it, expect } from 'vitest';
import {
  detectCycle,
  validateBeadSizes,
  validateCoverage,
  validateDAG,
} from '../validator.js';
import type { BeadSpec, DecompositionResult } from '../types.js';

// Helper to build a BeadSpec with only required fields
function makeBead(
  id: string,
  overrides: Partial<BeadSpec> = {}
): BeadSpec {
  return {
    id,
    moleculeId: 'mol-1',
    title: `Bead ${id}`,
    spec: `Spec for ${id}`,
    estimatedTokens: 50_000,
    coversCriteria: ['AC-1'],
    dependsOn: [],
    waitsFor: [],
    ...overrides,
  };
}

// Edge builder
function edge(fromBeadId: string, toBeadId: string, edgeType: string) {
  return { fromBeadId, toBeadId, edgeType };
}

describe('detectCycle', () => {
  it('Test 1: returns null for a valid linear DAG (A->B->C)', () => {
    const beadIds = ['A', 'B', 'C'];
    const edges = [edge('A', 'B', 'blocks'), edge('B', 'C', 'blocks')];
    expect(detectCycle(beadIds, edges)).toBeNull();
  });

  it('Test 2: returns null for a diamond DAG (A->B, A->C, B->D, C->D)', () => {
    const beadIds = ['A', 'B', 'C', 'D'];
    const edges = [
      edge('A', 'B', 'blocks'),
      edge('A', 'C', 'blocks'),
      edge('B', 'D', 'blocks'),
      edge('C', 'D', 'blocks'),
    ];
    expect(detectCycle(beadIds, edges)).toBeNull();
  });

  it('Test 3: returns cycle participant IDs for A->B->C->A', () => {
    const beadIds = ['A', 'B', 'C'];
    const edges = [
      edge('A', 'B', 'blocks'),
      edge('B', 'C', 'blocks'),
      edge('C', 'A', 'blocks'),
    ];
    const result = detectCycle(beadIds, edges);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(3);
    expect(result).toEqual(expect.arrayContaining(['A', 'B', 'C']));
  });

  it('Test 4: parent_child edges are excluded from cycle analysis', () => {
    // A->B via parent_child would be a cycle if included, but should be ignored
    const beadIds = ['A', 'B'];
    const edges = [
      edge('A', 'B', 'parent_child'),
      edge('B', 'A', 'parent_child'),
    ];
    // parent_child edges excluded: no ordering edges, no cycle
    expect(detectCycle(beadIds, edges)).toBeNull();
  });

  it('Test 5: includes blocks, waits_for, and conditional_blocks in cycle analysis', () => {
    // waits_for creates A->B->A cycle
    const beadIds = ['A', 'B'];
    const edgesWaitsFor = [
      edge('A', 'B', 'waits_for'),
      edge('B', 'A', 'waits_for'),
    ];
    expect(detectCycle(beadIds, edgesWaitsFor)).not.toBeNull();

    // conditional_blocks creates A->B->A cycle
    const edgesConditional = [
      edge('A', 'B', 'conditional_blocks'),
      edge('B', 'A', 'conditional_blocks'),
    ];
    expect(detectCycle(beadIds, edgesConditional)).not.toBeNull();
  });

  it('Test 6: handles disconnected graph components', () => {
    // A->B (connected component 1), C->D (connected component 2)
    const beadIds = ['A', 'B', 'C', 'D'];
    const edges = [
      edge('A', 'B', 'blocks'),
      edge('C', 'D', 'blocks'),
    ];
    expect(detectCycle(beadIds, edges)).toBeNull();
  });
});

describe('validateBeadSizes', () => {
  it('Test 7: returns empty array when all beads <= 200000 tokens', () => {
    const beads = [
      makeBead('A', { estimatedTokens: 100_000 }),
      makeBead('B', { estimatedTokens: 200_000 }),
      makeBead('C', { estimatedTokens: 50_000 }),
    ];
    expect(validateBeadSizes(beads)).toEqual([]);
  });

  it('Test 8: returns oversized beads when any exceed 200000 tokens', () => {
    const beads = [
      makeBead('A', { estimatedTokens: 100_000 }),
      makeBead('B', { estimatedTokens: 250_000 }),
      makeBead('C', { estimatedTokens: 300_000 }),
    ];
    const result = validateBeadSizes(beads);
    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining([
      { beadId: 'B', estimatedTokens: 250_000 },
      { beadId: 'C', estimatedTokens: 300_000 },
    ]));
  });

  it('Test 9: uses custom tokenBudget if provided', () => {
    const beads = [
      makeBead('A', { estimatedTokens: 150_000 }),
      makeBead('B', { estimatedTokens: 50_000 }),
    ];
    // With budget of 100k, A should be oversized
    const result = validateBeadSizes(beads, 100_000);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ beadId: 'A', estimatedTokens: 150_000 });
  });
});

describe('validateCoverage', () => {
  it('Test 10: returns empty array when all acceptance criteria covered', () => {
    const beads = [
      makeBead('A', { coversCriteria: ['AC-1', 'AC-2'] }),
      makeBead('B', { coversCriteria: ['AC-3'] }),
    ];
    const acceptanceCriteria = ['AC-1', 'AC-2', 'AC-3'];
    expect(validateCoverage(beads, acceptanceCriteria)).toEqual([]);
  });

  it('Test 11: returns uncovered criteria IDs when some are missing', () => {
    const beads = [
      makeBead('A', { coversCriteria: ['AC-1'] }),
    ];
    const acceptanceCriteria = ['AC-1', 'AC-2', 'AC-3'];
    const result = validateCoverage(beads, acceptanceCriteria);
    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining(['AC-2', 'AC-3']));
  });
});

describe('validateDAG', () => {
  const validBeads = [
    makeBead('A', { coversCriteria: ['AC-1'], dependsOn: [], waitsFor: [] }),
    makeBead('B', { coversCriteria: ['AC-2'], dependsOn: ['A'], waitsFor: [] }),
  ];
  const validResult: DecompositionResult = {
    molecules: [{ id: 'mol-1', title: 'Molecule 1', description: 'Desc', coversCriteria: ['AC-1', 'AC-2'] }],
    beads: validBeads,
  };

  it('Test 12: returns null (no error) for a valid decomposition', () => {
    const result = validateDAG(validResult, ['AC-1', 'AC-2']);
    expect(result).toBeNull();
  });

  it('Test 13: returns cycle error first (highest priority)', () => {
    // Cyclic beads AND oversized AND coverage gap
    const cyclicBeads = [
      makeBead('A', { estimatedTokens: 300_000, coversCriteria: [], dependsOn: ['B'], waitsFor: [] }),
      makeBead('B', { estimatedTokens: 300_000, coversCriteria: [], dependsOn: ['A'], waitsFor: [] }),
    ];
    const badResult: DecompositionResult = {
      molecules: [],
      beads: cyclicBeads,
    };
    const err = validateDAG(badResult, ['AC-1', 'AC-2']);
    expect(err).not.toBeNull();
    expect(err!.type).toBe('cycle');
  });

  it('Test 14: returns oversized error if no cycle but oversized beads exist', () => {
    const oversizedBeads = [
      makeBead('A', { estimatedTokens: 300_000, coversCriteria: ['AC-1'], dependsOn: [], waitsFor: [] }),
      makeBead('B', { estimatedTokens: 50_000, coversCriteria: ['AC-2'], dependsOn: [], waitsFor: [] }),
    ];
    const oversizedResult: DecompositionResult = {
      molecules: [],
      beads: oversizedBeads,
    };
    const err = validateDAG(oversizedResult, ['AC-1', 'AC-2']);
    expect(err).not.toBeNull();
    expect(err!.type).toBe('oversized_bead');
    expect(err!.details.oversizedBeads).toHaveLength(1);
    expect(err!.details.oversizedBeads![0]!.beadId).toBe('A');
  });

  it('Test 15: returns coverage gap error if no cycle/size issues but coverage gaps exist', () => {
    const noGapCoverageBeads = [
      makeBead('A', { estimatedTokens: 50_000, coversCriteria: ['AC-1'], dependsOn: [], waitsFor: [] }),
    ];
    const gapResult: DecompositionResult = {
      molecules: [],
      beads: noGapCoverageBeads,
    };
    const err = validateDAG(gapResult, ['AC-1', 'AC-2']);
    expect(err).not.toBeNull();
    expect(err!.type).toBe('coverage_gap');
    expect(err!.details.uncoveredCriteria).toEqual(expect.arrayContaining(['AC-2']));
  });
});
