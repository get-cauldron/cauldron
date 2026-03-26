import { z } from 'zod';
import type { AmbiguityScores, InterviewMode, InterviewTurn } from './types.js';
import type { LLMGateway } from '../gateway/gateway.js';

// ─── Zod Schemas (D-15) ───────────────────────────────────────────────────────
// Note: z.number() without .min()/.max() — Anthropic structured output does not
// support minimum/maximum constraints in JSON Schema for number types. Range
// validation is enforced at runtime in validateScoreRules instead.

export const greenfieldScoresSchema = z.object({
  goalClarity: z.number(),
  constraintClarity: z.number(),
  successCriteriaClarity: z.number(),
  reasoning: z.string(),
});

export const brownfieldScoresSchema = greenfieldScoresSchema.extend({
  contextClarity: z.number(),
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
  'Evaluate the interview transcript for clarity across dimensions. Score each dimension from 0 (completely unclear) to 1 (perfectly clear).\n\n' +
  '## Dimension Definitions\n\n' +
  '- **Goal clarity**: What is being built and for whom? Is the problem and intended outcome well-defined?\n' +
  '- **Constraint clarity**: What technical/business limits apply? (tech stack, timeline, budget, platform, scale)\n' +
  '- **Success criteria clarity**: How will we know it works? Are acceptance criteria testable and measurable?\n' +
  '- **Context clarity** (brownfield only): How well-understood is the existing codebase and its constraints?\n\n' +
  '## Scoring Anchors\n\n' +
  'Score 0.8-1.0: The user has given specific, testable, unambiguous answers for this dimension ' +
  '(e.g., "TypeScript, CLI tool, Unix-only, dry-run mode required, under 5s on 10k files"). ' +
  'Score 0.4-0.7: Partial clarity — the user has expressed intent but key details are vague or missing ' +
  '(e.g., "some kind of file tool, maybe for the web"). ' +
  'Score 0.0-0.3: Little or no information provided for this dimension. The user has not meaningfully addressed it.\n\n' +
  '## Recency Rule\n\n' +
  'Score based on the MOST RECENT state of knowledge. If the user gave a specific answer in turn 8 that resolves ' +
  'a question from turn 2, score the dimension based on turn 8\'s answer, not turn 2\'s ambiguity. ' +
  'Later answers supersede earlier vagueness.\n\n' +
  'Provide concise reasoning for your scores.';

export function buildScorerPrompt(transcript: InterviewTurn[], mode: InterviewMode): string {
  const modeLabel = mode === 'greenfield' ? 'Greenfield (new project)' : 'Brownfield (existing codebase)';
  if (transcript.length === 0) {
    return `Mode: ${modeLabel}\n\nNo interview turns yet. Score all dimensions at 0 with reasoning "Interview not started."`;
  }

  const formatTurn = (t: InterviewTurn, i: number): string =>
    `Turn ${i + 1} (${t.perspective}):\n  Q: ${t.question}\n  A: ${t.userAnswer}${t.freeformText ? `\n  Additional: ${t.freeformText}` : ''}`;

  if (transcript.length >= 3) {
    // Split into earlier context and most recent turns (last 2) for recency weighting
    const earlierTurns = transcript
      .slice(0, transcript.length - 2)
      .map(formatTurn)
      .join('\n\n');
    const recentTurns = transcript
      .slice(transcript.length - 2)
      .map((t, i) => formatTurn(t, transcript.length - 2 + i))
      .join('\n\n');

    return (
      `Mode: ${modeLabel}\n\n` +
      `EARLIER CONTEXT:\n${earlierTurns}\n\n` +
      `MOST RECENT ANSWERS (weight heavily):\n${recentTurns}\n\n` +
      `Score each clarity dimension based on the MOST RECENT state of knowledge above.`
    );
  }

  // Short transcripts (1-2 turns): single section, no splitting
  const turns = transcript.map(formatTurn).join('\n\n');
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
