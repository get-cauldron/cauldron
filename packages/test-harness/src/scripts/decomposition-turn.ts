import type { MockGatewayCall } from '../gateway.js';

export interface DecompositionScriptOptions {
  /** Number of molecules to return in pass 1. Default 2. */
  moleculeCount?: number;
  /** Number of beads per molecule in pass 2. Default 2. */
  beadsPerMolecule?: number;
}

/**
 * Builds a 2-call gateway script for one decomposition run:
 *   1. Pass 1: molecule hierarchy (generateObject with stage 'decomposition')
 *   2. Pass 2: atomic bead breakdown (generateObject with stage 'decomposition')
 *
 * Matches the call sequence in decomposeSeed().
 */
export function decompositionScript(options?: DecompositionScriptOptions): MockGatewayCall[] {
  const moleculeCount = options?.moleculeCount ?? 2;
  const beadsPerMolecule = options?.beadsPerMolecule ?? 2;

  const molecules = Array.from({ length: moleculeCount }, (_, i) => ({
    id: `mol-${i + 1}`,
    title: `Module ${i + 1}`,
    description: `Module ${i + 1} handles a subset of functionality`,
    acceptanceCriteria: [`ac-${i + 1}`],
  }));

  const beads = molecules.flatMap((mol, mi) =>
    Array.from({ length: beadsPerMolecule }, (_, bi) => ({
      id: `bead-${mi + 1}-${bi + 1}`,
      moleculeId: mol.id,
      title: `${mol.title} - Task ${bi + 1}`,
      spec: `Implement task ${bi + 1} for ${mol.title}`,
      estimatedTokens: 5000,
      dependsOn: bi > 0 ? [`bead-${mi + 1}-${bi}`] : [],
      waitsFor: [],
      conditionalOn: [],
      coversCriteria: [`ac-${mi + 1}`],
    }))
  );

  return [
    {
      stage: 'decomposition',
      returns: { molecules },
    },
    {
      stage: 'decomposition',
      returns: { beads },
    },
  ];
}
