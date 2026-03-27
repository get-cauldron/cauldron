import { z } from 'zod';
import type { LLMGateway } from '../gateway/gateway.js';
import type { Seed } from '@cauldron/shared';
import type { RubricDimension, DimensionScore, GoalAttainmentResult, GapAnalysis } from './types.js';
import { FULL_REGEN_THRESHOLD } from './types.js';
import { hashGapId } from './embeddings.js';

// LLM-safe schema (no min/max per Phase 6.2 finding)
const GoalScoreSchema = z.object({
  dimensions: z.array(z.object({
    name: z.string(),
    score: z.number(),
    reasoning: z.string(),
    gapStatement: z.string(),
  })),
});

export function buildRubric(evaluationPrinciples: unknown[]): RubricDimension[] {
  const DEFAULT_RUBRIC: RubricDimension[] = [
    { name: 'goal_alignment', weight: 0.4, description: 'Does the implementation achieve the stated goal?' },
    { name: 'completeness', weight: 0.3, description: 'Are all acceptance criteria addressed?' },
    { name: 'quality', weight: 0.3, description: 'Is the implementation production-quality?' },
  ];

  if (!Array.isArray(evaluationPrinciples) || evaluationPrinciples.length === 0) {
    return DEFAULT_RUBRIC;
  }

  // Validate and normalize weights to sum to 1.0
  const parsed = evaluationPrinciples as Array<{ name?: string; weight?: number; description?: string }>;
  const totalWeight = parsed.reduce((sum, p) => sum + (p.weight ?? 0), 0);
  return parsed.map(p => ({
    name: p.name ?? 'unnamed',
    weight: totalWeight > 0 ? (p.weight ?? 0) / totalWeight : 1 / parsed.length,
    description: p.description ?? '',
  }));
}

export async function evaluateGoalAttainment(params: {
  gateway: LLMGateway;
  seed: Seed;
  codeSummary: string;
  projectId: string;
  evolutionCycle: number;
  seedId: string;
}): Promise<GoalAttainmentResult> {
  const rubric = buildRubric(params.seed.evaluationPrinciples as unknown[]);

  const result = await params.gateway.generateObject({
    projectId: params.projectId,
    stage: 'evaluation',
    schema: GoalScoreSchema,
    schemaName: 'GoalAttainmentScore',
    seedId: params.seedId,
    evolutionCycle: params.evolutionCycle,
    prompt: buildEvalPrompt(params.seed, params.codeSummary, rubric),
  });

  return computeWeightedScore(result.object, rubric);
}

function buildEvalPrompt(seed: Seed, codeSummary: string, rubric: RubricDimension[]): string {
  const dimensions = rubric
    .map(d => `- ${d.name} (weight ${d.weight.toFixed(2)}): ${d.description}`)
    .join('\n');

  const criteria = Array.isArray(seed.acceptanceCriteria)
    ? (seed.acceptanceCriteria as unknown[]).map((ac, i) => `  ${i + 1}. ${JSON.stringify(ac)}`).join('\n')
    : '  (none)';

  return `You are evaluating whether a software implementation meets its stated goal.

GOAL:
${seed.goal}

ACCEPTANCE CRITERIA:
${criteria}

CODE SUMMARY:
${codeSummary}

EVALUATION RUBRIC:
${dimensions}

For each dimension in the rubric, provide:
- name: the dimension name (must match exactly)
- score: 0.0 (complete failure) to 1.0 (fully achieved)
- reasoning: brief explanation of your assessment
- gapStatement: what specifically is missing or needs improvement (empty string if score is 1.0)

Be critical and specific. Score based on actual evidence in the code summary.`;
}

function computeWeightedScore(
  llmResponse: { dimensions: Array<{ name: string; score: number; reasoning: string; gapStatement: string }> },
  rubric: RubricDimension[]
): GoalAttainmentResult {
  const dimensionMap = new Map(rubric.map(d => [d.name, d]));

  const dimensions: DimensionScore[] = llmResponse.dimensions.map(d => {
    const rubricEntry = dimensionMap.get(d.name);
    return {
      name: d.name,
      score: d.score,
      weight: rubricEntry?.weight ?? (1 / rubric.length),
      reasoning: d.reasoning,
      gapStatement: d.gapStatement,
    };
  });

  // Compute weighted sum
  let overallScore = 0;
  for (const d of dimensions) {
    overallScore += d.score * d.weight;
  }

  // Build gap analysis (one entry per dimension where score < 1.0)
  const gapAnalysis: GapAnalysis[] = dimensions
    .filter(d => d.score < 1.0)
    .map(d => ({
      dimension: d.name,
      score: d.score,
      description: d.gapStatement,
      gapId: hashGapId(d.name, d.gapStatement),
    }));

  const tier = overallScore < FULL_REGEN_THRESHOLD ? 'full' : 'ac_only';

  return {
    overallScore,
    dimensions,
    gapAnalysis,
    tier,
  };
}
