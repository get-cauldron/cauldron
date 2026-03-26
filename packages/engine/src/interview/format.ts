import type { AmbiguityScores, InterviewMode } from './types.js';

export interface ScoreBreakdown {
  formatted: string;
  weakestDimension: { dimension: string; score: number };
  dimensions: Array<{ dimension: string; label: string; score: number }>;
}

/**
 * D-17: Format ambiguity score dimensions for user visibility.
 * Returns a structured breakdown with formatted string and weakest dimension.
 */
export function formatScoreBreakdown(
  scores: AmbiguityScores,
  mode: InterviewMode,
): ScoreBreakdown {
  const dimensions: Array<{ dimension: string; label: string; score: number }> = [
    { dimension: 'goalClarity', label: 'Goal', score: scores.goalClarity },
    { dimension: 'constraintClarity', label: 'Constraints', score: scores.constraintClarity },
    { dimension: 'successCriteriaClarity', label: 'Success criteria', score: scores.successCriteriaClarity },
  ];

  if (mode === 'brownfield' && scores.contextClarity !== undefined) {
    dimensions.push({ dimension: 'contextClarity', label: 'Context', score: scores.contextClarity });
  }

  const weakest = [...dimensions].sort((a, b) => a.score - b.score)[0]!;

  const parts = dimensions.map((d) => `${d.label}: ${Math.round(d.score * 100)}%`);
  const formatted = `${parts.join(', ')} -- Overall: ${Math.round(scores.overall * 100)}%`;

  return { formatted, weakestDimension: { dimension: weakest.dimension, score: weakest.score }, dimensions };
}
