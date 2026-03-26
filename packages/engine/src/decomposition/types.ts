/** Molecule: non-atomic parent grouping of beads */
export interface MoleculeSpec {
  id: string;           // Unique slug (e.g., "auth-layer")
  title: string;
  description: string;
  coversCriteria: string[];  // Acceptance criterion IDs this molecule addresses
}

/** BeadSpec: atomic leaf task produced by decomposition */
export interface BeadSpec {
  id: string;           // Unique slug (e.g., "auth-layer/jwt-middleware")
  moleculeId: string;   // Parent molecule slug
  title: string;
  spec: string;         // Precise implementation specification
  estimatedTokens: number; // Total context window usage estimate (D-05)
  coversCriteria: string[];  // AC IDs this bead directly implements (D-09)
  dependsOn: string[];       // Bead IDs that block this (blocks edges)
  waitsFor: string[];        // Bead IDs whose output is needed (waits_for edges)
  conditionalOn?: string;    // Bead ID this runs only if that succeeded (conditional_blocks)
}

/** Result of the two-pass decomposition (D-01) */
export interface DecompositionResult {
  molecules: MoleculeSpec[];
  beads: BeadSpec[];
}

/** Options for running decomposition */
export interface DecompositionOptions {
  seedId: string;
  projectId: string;
  maxRetries?: number;    // Default 3 per D-04
  tokenBudget?: number;   // Default 200_000 per D-02
}

/** Validation error from cycle detection or size check */
export interface DAGValidationError {
  type: 'cycle' | 'oversized_bead' | 'coverage_gap';
  message: string;
  details: {
    cycleParticipants?: string[];     // Bead IDs in the cycle
    oversizedBeads?: Array<{ beadId: string; estimatedTokens: number }>;
    uncoveredCriteria?: string[];     // AC IDs with no bead coverage
  };
}

/** Claim result for atomic bead claiming (D-16) */
export interface ClaimResult {
  success: boolean;
  beadId: string;
  agentId: string;
  newVersion?: number;
}

/** Event payload shapes for Inngest events */
export interface BeadDispatchPayload {
  beadId: string;
  seedId: string;
  projectId: string;
  moleculeId: string | null;
}

export interface BeadCompletedPayload {
  beadId: string;
  seedId: string;
  projectId: string;
  status: 'completed' | 'failed' | 'skipped';
}
