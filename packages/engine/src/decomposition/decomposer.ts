import { z } from 'zod';
import type { LLMGateway } from '../gateway/gateway.js';
import type { Seed } from '@cauldron/shared';
import type { DecompositionResult, DAGValidationError } from './types.js';
import { validateDAG } from './validator.js';

/**
 * Zod schema for Pass 1 output: molecule hierarchy decomposition.
 * Each molecule groups a logical subset of acceptance criteria.
 */
const MoleculeOutputSchema = z.object({
  molecules: z.array(
    z.object({
      id: z.string().describe('Unique slug for this molecule (e.g., "auth-layer")'),
      title: z.string(),
      description: z.string(),
      coversCriteria: z
        .array(z.string())
        .describe('Acceptance criterion IDs this molecule addresses'),
    })
  ),
});

/**
 * Zod schema for Pass 2 output: atomic bead decomposition with dependency edges.
 */
const DecompositionOutputSchema = z.object({
  beads: z.array(
    z.object({
      id: z
        .string()
        .describe('Unique slug (e.g., "auth-layer/jwt-middleware")'),
      moleculeId: z.string().describe('Parent molecule slug'),
      title: z.string(),
      spec: z.string().describe('Precise implementation specification'),
      estimatedTokens: z
        .number()
        .int()
        .describe(
          'Estimated total context: spec + seed excerpt + code + deps + tests. Budget generously.'
        ),
      coversCriteria: z
        .array(z.string())
        .min(1)
        .describe('Acceptance criterion IDs this bead implements'),
      dependsOn: z
        .array(z.string())
        .describe('Bead IDs that must complete first (blocks edges)'),
      waitsFor: z
        .array(z.string())
        .describe('Bead IDs whose output is needed (waits_for edges)'),
      conditionalOn: z
        .string()
        .optional()
        .describe('Bead ID — only run if that bead succeeded'),
    })
  ),
});

/**
 * Builds the retry instruction suffix based on the validation error type.
 * Per D-07, oversized bead errors explicitly instruct the LLM to split beads.
 */
function buildRetryInstruction(error: DAGValidationError, tokenBudget: number): string {
  switch (error.type) {
    case 'oversized_bead':
      return (
        `Previous attempt was invalid: ${error.message}. ` +
        `The following beads exceed the ${tokenBudget} token budget: ${JSON.stringify(error.details.oversizedBeads)}. ` +
        `Split each oversized bead into 2-3 smaller sub-beads. ` +
        `Each sub-bead must have its moleculeId set to the same parent molecule. ` +
        `Add 'blocks' dependency edges between sub-beads where ordering matters. ` +
        `Redistribute the original bead's coversCriteria across the sub-beads so no criteria are lost.`
      );
    case 'cycle':
      return (
        `Previous attempt was invalid: ${error.message}. ` +
        `A dependency cycle was detected involving beads: ${error.details.cycleParticipants?.join(', ')}. ` +
        `Remove or reverse dependency edges to eliminate the cycle while preserving correct execution ordering.`
      );
    case 'coverage_gap':
      return (
        `Previous attempt was invalid: ${error.message}. ` +
        `The following acceptance criteria are not covered by any bead: ${error.details.uncoveredCriteria?.join(', ')}. ` +
        `Add beads or update existing beads' coversCriteria to ensure every criterion is mapped to at least one bead.`
      );
  }
}

/**
 * Two-pass LLM decomposition: takes a crystallized seed and produces a valid, sized bead DAG.
 *
 * Pass 1: Molecule decomposition — groups acceptance criteria into logical groupings.
 * Pass 2 (with retry loop): Bead decomposition — produces atomic implementation tasks
 *         with dependency edges. Auto-retries up to maxRetries on validation failure,
 *         sending error-type-specific context on each retry per D-04 and D-07.
 *
 * @param options.gateway - LLMGateway instance
 * @param options.seed - Crystallized seed with goal, constraints, AC, ontology
 * @param options.projectId - Project ID for gateway budget tracking
 * @param options.maxRetries - Max pass-2 retry attempts (default 3)
 * @param options.tokenBudget - Max tokens per bead (default 200_000)
 */
export async function decomposeSeed(options: {
  gateway: LLMGateway;
  seed: Seed;
  projectId: string;
  maxRetries?: number;
  tokenBudget?: number;
}): Promise<DecompositionResult> {
  const { gateway, seed, projectId } = options;
  const maxRetries = options.maxRetries ?? 3;
  const tokenBudget = options.tokenBudget ?? 200_000;

  const acceptanceCriteria = seed.acceptanceCriteria as unknown as string[];
  const constraints = seed.constraints as unknown as string[];
  const ontologySchema = seed.ontologySchema;

  // ── Pass 1: Molecule decomposition ──────────────────────────────────────
  const pass1Prompt = [
    `## Project Goal`,
    `${seed.goal}`,
    ``,
    `## Acceptance Criteria`,
    `${JSON.stringify(acceptanceCriteria)}`,
    ``,
    `## Constraints`,
    `${JSON.stringify(constraints)}`,
    ``,
    `## Ontology Schema`,
    `${JSON.stringify(ontologySchema)}`,
    ``,
    `## Instructions`,
    `Decompose this project into logical molecule groupings. Each molecule should cover a coherent`,
    `subset of the acceptance criteria above. Molecules must be non-overlapping and collectively`,
    `cover all acceptance criteria. Use short, descriptive slugs as molecule IDs (e.g., "auth-layer").`,
  ].join('\n');

  const pass1Result = await gateway.generateObject({
    projectId,
    stage: 'decomposition',
    schema: MoleculeOutputSchema,
    schemaName: 'MoleculeDecomposition',
    prompt: pass1Prompt,
  });

  const molecules = pass1Result.object.molecules;

  // ── Pass 2: Bead decomposition with retry loop ───────────────────────────
  let lastError: DAGValidationError | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Build retry suffix if we have a previous validation error
    const retrySuffix =
      lastError !== null
        ? `\n\n## Retry Instructions\n${buildRetryInstruction(lastError, tokenBudget)}`
        : '';

    const pass2Prompt = [
      `## Project Goal`,
      `${seed.goal}`,
      ``,
      `## Acceptance Criteria`,
      `${JSON.stringify(acceptanceCriteria)}`,
      ``,
      `## Constraints`,
      `${JSON.stringify(constraints)}`,
      ``,
      `## Ontology Schema`,
      `${JSON.stringify(ontologySchema)}`,
      ``,
      `## Molecules (from Pass 1)`,
      `${JSON.stringify(molecules, null, 2)}`,
      ``,
      `## Token Budget`,
      `Each bead must estimate its total context window usage (spec + seed excerpt + code + deps + tests)`,
      `at or below ${tokenBudget} tokens. Budget generously to avoid underestimation.`,
      ``,
      `## Instructions`,
      `Decompose each molecule into atomic implementation beads. Each bead must:`,
      `- Be independently implementable in a single LLM context window`,
      `- Specify precise dependency edges (dependsOn, waitsFor, conditionalOn)`,
      `- Cover at least one acceptance criterion (coversCriteria must be non-empty)`,
      `- Have an estimatedTokens value that fits within the ${tokenBudget} token budget`,
      `- Use slug format for IDs: "molecule-slug/bead-slug"`,
    ].join('\n') + retrySuffix;

    const pass2Result = await gateway.generateObject({
      projectId,
      stage: 'decomposition',
      schema: DecompositionOutputSchema,
      schemaName: 'BeadDecomposition',
      prompt: pass2Prompt,
    });

    const result: DecompositionResult = {
      molecules,
      beads: pass2Result.object.beads,
    };

    const validationError = validateDAG(result, acceptanceCriteria, tokenBudget);

    if (validationError === null) {
      return result;
    }

    lastError = validationError;
  }

  // All retry attempts exhausted
  throw new Error(
    `Decomposition failed after ${maxRetries} attempts: ${lastError!.message}`
  );
}
