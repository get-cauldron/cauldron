import { z } from 'zod';
import type { AmbiguityScores, InterviewMode, InterviewTurn } from './types.js';
import type { LLMGateway } from '../gateway/gateway.js';

// ─── Zod Schemas (D-15) ───────────────────────────────────────────────────────

export const greenfieldScoresSchema = z.object({
  goalClarity: z.number().min(0).max(1),
  constraintClarity: z.number().min(0).max(1),
  successCriteriaClarity: z.number().min(0).max(1),
  reasoning: z.string(),
});

export const brownfieldScoresSchema = greenfieldScoresSchema.extend({
  contextClarity: z.number().min(0).max(1),
});

export type GreenfieldScores = z.infer<typeof greenfieldScoresSchema>;
export type BrownfieldScores = z.infer<typeof brownfieldScoresSchema>;

// ─── Score Validation (D-20) ──────────────────────────────────────────────────

export interface ScoreValidationResult {
  valid: boolean;
  anomalies: string[];
}

/**
 * Validates score dimensions for range [0,1] and detects regression drops > 0.3
 * from previous turn. Fires retry on anomaly per D-20.
 */
export function validateScoreRules(
  current: {
    goalClarity: number;
    constraintClarity: number;
    successCriteriaClarity: number;
    contextClarity?: number;
  },
  previous: AmbiguityScores | null,
): ScoreValidationResult {
  const anomalies: string[] = [];

  // Check [0, 1] range for each dimension
  const dims = ['goalClarity', 'constraintClarity', 'successCriteriaClarity', 'contextClarity'] as const;
  for (const dim of dims) {
    const value = current[dim as keyof typeof current];
    if (typeof value === 'number' && (value < 0 || value > 1)) {
      anomalies.push(`${dim} out of range: ${value}`);
    }
  }

  // Check no dimension drops >0.3 from previous (D-20)
  if (previous) {
    for (const dim of dims) {
      const prev = previous[dim];
      const curr = current[dim as keyof typeof current];
      if (prev !== undefined && curr !== undefined && typeof curr === 'number') {
        const drop = prev - curr;
        if (drop > 0.3) {
          anomalies.push(`${dim} dropped by ${drop.toFixed(2)} (>0.3 threshold)`);
        }
      }
    }
  }

  return { valid: anomalies.length === 0, anomalies };
}

// ─── Weighted Score Computation (D-16) ───────────────────────────────────────

/**
 * Computes the weighted overall ambiguity score.
 * Greenfield: goal 40%, constraints 30%, success criteria 30%
 * Brownfield: goal 35%, constraints 25%, success criteria 25%, context 15%
 */
export function computeWeightedScore(
  scores: {
    goalClarity: number;
    constraintClarity: number;
    successCriteriaClarity: number;
    contextClarity?: number;
  },
  mode: InterviewMode,
): number {
  if (mode === 'greenfield') {
    return (
      scores.goalClarity * 0.4 +
      scores.constraintClarity * 0.3 +
      scores.successCriteriaClarity * 0.3
    );
  }
  return (
    scores.goalClarity * 0.35 +
    scores.constraintClarity * 0.25 +
    scores.successCriteriaClarity * 0.25 +
    (scores.contextClarity ?? 0) * 0.15
  );
}

// ─── System Prompt & Prompt Builder ──────────────────────────────────────────

export const SCORER_SYSTEM_PROMPT =
  'Evaluate the interview transcript for clarity across dimensions. Score each dimension from 0 (completely unclear) to 1 (perfectly clear). ' +
  'Goal clarity: how well-defined is the project\'s objective? ' +
  'Constraint clarity: how well-defined are technical/business constraints? ' +
  'Success criteria clarity: how testable and measurable are the success conditions? ' +
  'Context clarity (brownfield only): how well-understood is the existing codebase and its constraints? ' +
  'Provide concise reasoning for your scores.';

export function buildScorerPrompt(transcript: InterviewTurn[], mode: InterviewMode): string {
  const modeLabel = mode === 'greenfield' ? 'Greenfield (new project)' : 'Brownfield (existing codebase)';
  if (transcript.length === 0) {
    return `Mode: ${modeLabel}\n\nNo interview turns yet. Score all dimensions at 0 with reasoning "Interview not started."`;
  }

  const turns = transcript
    .map(
      (t, i) =>
        `Turn ${i + 1} (${t.perspective}):\n  Q: ${t.question}\n  A: ${t.userAnswer}${t.freeformText ? `\n  Additional: ${t.freeformText}` : ''}`,
    )
    .join('\n\n');

  return `Mode: ${modeLabel}\n\nInterview transcript:\n${turns}\n\nScore each clarity dimension based on the full transcript above.`;
}

// ─── Main Scoring Function (D-15, D-18, D-19, D-20) ─────────────────────────

/**
 * Invokes the LLM gateway to score the full interview transcript.
 * Uses temperature=0 for deterministic results (D-15).
 * Retries once on rule validation anomaly (D-20).
 */
export async function scoreTranscript(
  gateway: LLMGateway,
  transcript: InterviewTurn[],
  mode: InterviewMode,
  projectId: string,
  previousScores: AmbiguityScores | null,
  config: { scoringModel?: string },
): Promise<AmbiguityScores> {
  const schema = mode === 'greenfield' ? greenfieldScoresSchema : brownfieldScoresSchema;
  const scorerPrompt = buildScorerPrompt(transcript, mode);

  const result = await gateway.generateObject({
    projectId,
    stage: 'interview',
    schema,
    schemaName: 'AmbiguityScores',
    schemaDescription: 'Clarity scores per dimension from analyzing the full interview transcript',
    temperature: 0, // D-15: deterministic scoring
    system: SCORER_SYSTEM_PROMPT,
    prompt: scorerPrompt,
  });

  const rawScores = result.object as GreenfieldScores | BrownfieldScores;
  const validation = validateScoreRules(rawScores, previousScores);

  if (!validation.valid) {
    // D-20: one retry on anomaly detection
    const retry = await gateway.generateObject({
      projectId,
      stage: 'interview',
      schema,
      schemaName: 'AmbiguityScores',
      schemaDescription: 'Clarity scores per dimension from analyzing the full interview transcript',
      temperature: 0,
      system: SCORER_SYSTEM_PROMPT,
      prompt:
        scorerPrompt +
        '\n\nNOTE: Previous scoring attempt had anomalies. Please re-evaluate carefully.',
    });

    const retryScores = retry.object as GreenfieldScores | BrownfieldScores;
    // Accept retry result regardless (D-20: never block on >1 retry)
    const overall = computeWeightedScore(retryScores, mode);
    return { ...retryScores, overall } as AmbiguityScores;
  }

  const overall = computeWeightedScore(rawScores, mode);
  return { ...rawScores, overall } as AmbiguityScores;
}
