import type { BeadSpec, DecompositionResult, DAGValidationError } from './types.js';

/**
 * Detects cycles in a bead dependency graph using Kahn's topological sort algorithm.
 *
 * Only considers scheduling-relevant edge types: blocks, waits_for, conditional_blocks.
 * Excludes parent_child edges — they track hierarchy, not execution order,
 * and cannot create real scheduling cycles (Research Pitfall 2).
 *
 * @param beadIds - All bead IDs in the graph
 * @param edges - All edges with their types
 * @returns Array of bead IDs involved in a cycle, or null if no cycle
 */
export function detectCycle(
  beadIds: string[],
  edges: Array<{ fromBeadId: string; toBeadId: string; edgeType: string }>
): string[] | null {
  // Filter to only scheduling edges (exclude parent_child)
  const schedulingEdges = edges.filter(
    (e) => e.edgeType !== 'parent_child'
  );

  // Build adjacency list and in-degree map using Kahn's algorithm
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize all beads with in-degree 0
  for (const beadId of beadIds) {
    inDegree.set(beadId, 0);
    adjacency.set(beadId, []);
  }

  // Build graph from scheduling edges
  for (const { fromBeadId, toBeadId } of schedulingEdges) {
    // Only consider edges where both nodes are in the bead set
    if (!inDegree.has(fromBeadId) || !inDegree.has(toBeadId)) continue;

    adjacency.get(fromBeadId)!.push(toBeadId);
    inDegree.set(toBeadId, (inDegree.get(toBeadId) ?? 0) + 1);
  }

  // BFS queue: start with all zero-in-degree nodes
  const queue: string[] = [];
  for (const [beadId, degree] of inDegree) {
    if (degree === 0) queue.push(beadId);
  }

  let processed = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    processed++;

    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // If processed < total beads, remaining nodes with in-degree > 0 are in a cycle
  if (processed < beadIds.length) {
    const cycleParticipants: string[] = [];
    for (const [beadId, degree] of inDegree) {
      if (degree > 0) cycleParticipants.push(beadId);
    }
    return cycleParticipants;
  }

  return null;
}

/**
 * Validates that all beads fit within the context window budget.
 *
 * @param beads - Bead specs to check
 * @param tokenBudget - Maximum allowed token count per bead (default 200_000)
 * @returns Array of oversized beads with their token counts; empty means all fit
 */
export function validateBeadSizes(
  beads: BeadSpec[],
  tokenBudget = 200_000
): Array<{ beadId: string; estimatedTokens: number }> {
  return beads
    .filter((bead) => bead.estimatedTokens > tokenBudget)
    .map((bead) => ({ beadId: bead.id, estimatedTokens: bead.estimatedTokens }));
}

/**
 * Validates that every acceptance criterion is covered by at least one bead.
 *
 * @param beads - Bead specs with their coversCriteria arrays
 * @param acceptanceCriteria - All acceptance criterion IDs that must be covered
 * @returns Array of uncovered criterion IDs; empty means full coverage
 */
export function validateCoverage(
  beads: BeadSpec[],
  acceptanceCriteria: string[]
): string[] {
  const covered = new Set<string>();
  for (const bead of beads) {
    for (const criterion of bead.coversCriteria) {
      covered.add(criterion);
    }
  }

  return acceptanceCriteria.filter((criterion) => !covered.has(criterion));
}

/**
 * Runs all three DAG validations in priority order:
 * 1. Cycle detection (highest priority — structurally invalid)
 * 2. Oversized beads (context window violation)
 * 3. Coverage gaps (spec completeness)
 *
 * @param result - Decomposition result with molecules and beads
 * @param acceptanceCriteria - All acceptance criterion IDs from the seed
 * @param tokenBudget - Optional custom token budget (default 200_000)
 * @returns First validation error found, or null if all pass
 */
export function validateDAG(
  result: DecompositionResult,
  acceptanceCriteria: string[],
  tokenBudget?: number
): DAGValidationError | null {
  const { beads } = result;
  const budget = tokenBudget ?? 200_000;

  // Build edge array from bead dependency fields
  const edges: Array<{ fromBeadId: string; toBeadId: string; edgeType: string }> = [];
  for (const bead of beads) {
    for (const dep of bead.dependsOn) {
      edges.push({ fromBeadId: dep, toBeadId: bead.id, edgeType: 'blocks' });
    }
    for (const dep of bead.waitsFor) {
      edges.push({ fromBeadId: dep, toBeadId: bead.id, edgeType: 'waits_for' });
    }
    if (bead.conditionalOn) {
      edges.push({ fromBeadId: bead.conditionalOn, toBeadId: bead.id, edgeType: 'conditional_blocks' });
    }
  }

  const beadIds = beads.map((b) => b.id);

  // Priority 1: Cycle detection
  const cycleParticipants = detectCycle(beadIds, edges);
  if (cycleParticipants !== null) {
    return {
      type: 'cycle',
      message: `Cycle detected involving beads: ${cycleParticipants.join(', ')}`,
      details: { cycleParticipants },
    };
  }

  // Priority 2: Oversized bead check
  const oversizedBeads = validateBeadSizes(beads, budget);
  if (oversizedBeads.length > 0) {
    const ids = oversizedBeads.map((b) => b.beadId);
    return {
      type: 'oversized_bead',
      message: `${oversizedBeads.length} bead(s) exceed ${budget} token limit: ${ids.join(', ')}`,
      details: { oversizedBeads },
    };
  }

  // Priority 3: Coverage gap check
  const uncoveredCriteria = validateCoverage(beads, acceptanceCriteria);
  if (uncoveredCriteria.length > 0) {
    return {
      type: 'coverage_gap',
      message: `Acceptance criteria not covered: ${uncoveredCriteria.join(', ')}`,
      details: { uncoveredCriteria },
    };
  }

  return null;
}
