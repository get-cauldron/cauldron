import { z } from 'zod';
import { seeds, appendEvent } from '@get-cauldron/shared';
import type { DbClient } from '@get-cauldron/shared';
import type { Seed } from '@get-cauldron/shared';
import type { LLMGateway } from '../gateway/gateway.js';
import type { GoalAttainmentResult, EvolutionContext, LateralThinkingProposal, GapAnalysis } from './types.js';

// LLM-safe schemas (no min/max per Phase 6.2 finding)
const EvolvedACSchema = z.object({
  acceptanceCriteria: z.array(z.object({
    criterion: z.string(),
    rationale: z.string(),
  })),
});

const FullSeedSchema = z.object({
  goal: z.string(),
  constraints: z.array(z.object({
    constraint: z.string(),
  })),
  acceptanceCriteria: z.array(z.object({
    criterion: z.string(),
    rationale: z.string(),
  })),
  ontologySchema: z.object({
    entities: z.array(z.string()),
  }).optional(),
});

export async function mutateSeed(params: {
  db: DbClient;
  gateway: LLMGateway;
  seed: Seed;
  goalResult: GoalAttainmentResult;
  projectId: string;
  seedId: string;
}): Promise<Seed> {
  const tier = params.goalResult.tier;
  const parentGeneration = (params.seed as Seed & { generation: number }).generation ?? 0;
  const evolutionContext: EvolutionContext = {
    score: params.goalResult.overallScore,
    tier,
    gapAnalysis: params.goalResult.gapAnalysis,
    parentSeedId: params.seedId,
  };

  if (tier === 'full') {
    // Full seed regeneration: use gateway to generate entirely new seed spec
    // with gap analysis as context
    const newSeedSpec = await params.gateway.generateObject({
      projectId: params.projectId,
      stage: 'evaluation',
      schema: FullSeedSchema,
      schemaName: 'EvolvedSeed',
      seedId: params.seedId,
      prompt: buildFullRegenPrompt(params.seed, params.goalResult),
    });

    // INSERT as new immutable seed
    const [evolvedSeed] = await params.db.insert(seeds).values({
      projectId: params.projectId,
      parentId: params.seedId,
      interviewId: params.seed.interviewId,
      version: params.seed.version + 1,
      status: 'crystallized',
      goal: newSeedSpec.object.goal,
      constraints: newSeedSpec.object.constraints,
      acceptanceCriteria: newSeedSpec.object.acceptanceCriteria,
      ontologySchema: newSeedSpec.object.ontologySchema ?? params.seed.ontologySchema,
      evaluationPrinciples: params.seed.evaluationPrinciples,
      exitConditions: params.seed.exitConditions,
      ambiguityScore: params.seed.ambiguityScore,
      crystallizedAt: new Date(),
      generation: parentGeneration + 1,
      evolutionContext,
    }).returning();

    await appendEvent(params.db, {
      projectId: params.projectId,
      seedId: evolvedSeed!.id,
      type: 'seed_crystallized',
      payload: { parentSeedId: params.seedId, tier: 'full', generation: parentGeneration + 1 },
    });

    return evolvedSeed!;
  } else {
    // AC-only rewrite: goal and constraints stay the same
    const acResult = await params.gateway.generateObject({
      projectId: params.projectId,
      stage: 'evaluation',
      schema: EvolvedACSchema,
      schemaName: 'EvolvedAcceptanceCriteria',
      seedId: params.seedId,
      prompt: buildACRewritePrompt(params.seed, params.goalResult),
    });

    const [evolvedSeed] = await params.db.insert(seeds).values({
      projectId: params.projectId,
      parentId: params.seedId,
      interviewId: params.seed.interviewId,
      version: params.seed.version + 1,
      status: 'crystallized',
      goal: params.seed.goal,
      constraints: params.seed.constraints,
      acceptanceCriteria: acResult.object.acceptanceCriteria,
      ontologySchema: params.seed.ontologySchema,
      evaluationPrinciples: params.seed.evaluationPrinciples,
      exitConditions: params.seed.exitConditions,
      ambiguityScore: params.seed.ambiguityScore,
      crystallizedAt: new Date(),
      generation: parentGeneration + 1,
      evolutionContext,
    }).returning();

    await appendEvent(params.db, {
      projectId: params.projectId,
      seedId: evolvedSeed!.id,
      type: 'seed_crystallized',
      payload: { parentSeedId: params.seedId, tier: 'ac_only', generation: parentGeneration + 1 },
    });

    return evolvedSeed!;
  }
}

/**
 * Create an evolved seed directly from a LateralThinkingProposal.
 * Used when lateral thinking produces a viable alternative approach.
 * Always treated as a 'full' tier evolution since the proposal is a complete rethink.
 */
export async function mutateSeedFromProposal(params: {
  db: DbClient;
  seed: Seed;
  proposal: LateralThinkingProposal;
  projectId: string;
  seedId: string;
  lastScore: number;
  lastGapAnalysis: GapAnalysis[];
}): Promise<Seed> {
  const parentGeneration = (params.seed as Seed & { generation: number }).generation ?? 0;
  const evolutionContext: EvolutionContext = {
    score: params.lastScore,
    tier: 'full',
    gapAnalysis: params.lastGapAnalysis,
    parentSeedId: params.seedId,
  };

  const [evolvedSeed] = await params.db.insert(seeds).values({
    projectId: params.projectId,
    parentId: params.seedId,
    interviewId: params.seed.interviewId,
    version: params.seed.version + 1,
    status: 'crystallized',
    goal: params.proposal.goal,
    constraints: params.proposal.constraints,
    acceptanceCriteria: params.proposal.acceptanceCriteria,
    ontologySchema: params.seed.ontologySchema,
    evaluationPrinciples: params.seed.evaluationPrinciples,
    exitConditions: params.seed.exitConditions,
    ambiguityScore: params.seed.ambiguityScore,
    crystallizedAt: new Date(),
    generation: parentGeneration + 1,
    evolutionContext,
  }).returning();

  await appendEvent(params.db, {
    projectId: params.projectId,
    seedId: evolvedSeed!.id,
    type: 'seed_crystallized',
    payload: {
      parentSeedId: params.seedId,
      tier: 'full',
      generation: parentGeneration + 1,
      source: 'lateral_thinking',
      persona: params.proposal.persona,
    },
  });

  return evolvedSeed!;
}

function buildFullRegenPrompt(seed: Seed, goalResult: GoalAttainmentResult): string {
  const gaps = goalResult.gapAnalysis
    .map(g => `- ${g.dimension} (score ${g.score.toFixed(2)}): ${g.description}`)
    .join('\n');

  return `You are evolving a software specification to address gaps found during evaluation.

CURRENT GOAL:
${seed.goal}

CURRENT CONSTRAINTS:
${JSON.stringify(seed.constraints, null, 2)}

EVALUATION SCORE: ${goalResult.overallScore.toFixed(2)} (below threshold, full regeneration required)

IDENTIFIED GAPS:
${gaps}

Generate a completely revised seed specification that directly addresses each gap. The new spec should:
1. Restate the goal more precisely based on what failed
2. Update constraints to prevent the same gaps
3. Rewrite acceptance criteria to be more specific and testable
4. Include ontology schema for key domain entities

Return a complete specification object.`;
}

function buildACRewritePrompt(seed: Seed, goalResult: GoalAttainmentResult): string {
  const gaps = goalResult.gapAnalysis
    .map(g => `- ${g.dimension} (score ${g.score.toFixed(2)}): ${g.description}`)
    .join('\n');

  return `You are refining acceptance criteria for a software specification based on evaluation feedback.

GOAL (unchanged):
${seed.goal}

CONSTRAINTS (unchanged):
${JSON.stringify(seed.constraints, null, 2)}

CURRENT ACCEPTANCE CRITERIA:
${JSON.stringify(seed.acceptanceCriteria, null, 2)}

EVALUATION SCORE: ${goalResult.overallScore.toFixed(2)} (partial failure, AC rewrite only)

IDENTIFIED GAPS:
${gaps}

Rewrite the acceptance criteria to be more specific, testable, and to directly address the identified gaps.
Keep the goal and constraints unchanged. Return only the updated acceptance criteria.`;
}
