import { z } from 'zod';
import type {
  PerspectiveName,
  AmbiguityScores,
  PerspectiveCandidate,
  InterviewTurn,
} from './types.js';
import type { LLMGateway } from '../gateway/gateway.js';

// ─── Perspective System Prompts (D-09) ───────────────────────────────────────

export const PERSPECTIVE_PROMPTS: Record<PerspectiveName, string> = {
  researcher:
    "You are the Researcher perspective in a Socratic interview panel. Your role is to uncover hidden assumptions, identify knowledge gaps, and ask questions that explore the problem space deeply. Focus on: what the user hasn't said, implicit assumptions about users/scale/environment, and unexplored alternatives.",
  simplifier:
    'You are the Simplifier perspective in a Socratic interview panel. Your role is to reduce complexity and find the essence of what the user needs. Focus on: cutting through jargon, identifying the minimum viable scope, and asking "what if we just..." questions.',
  architect:
    'You are the Architect perspective in a Socratic interview panel. Your role is to understand the structural requirements of the system. Focus on: data models, component boundaries, integration points, scalability constraints, and technical tradeoffs.',
  'breadth-keeper':
    'You are the Breadth-Keeper perspective in a Socratic interview panel. Your role is to ensure no important dimension is overlooked. Focus on: edge cases, error handling, security, accessibility, deployment, monitoring, and any dimension not yet discussed.',
  'seed-closer':
    'You are the Seed-Closer perspective in a Socratic interview panel. Your role is to drive toward actionable, testable specifications. Focus on: converting vague desires into measurable acceptance criteria, identifying exit conditions, and asking "how will we know when this is done?"',
};

// ─── Zod Schema for Perspective Candidates ───────────────────────────────────

export const perspectiveCandidateSchema = z.object({
  question: z.string(),
  rationale: z.string(),
});

// ─── Dynamic Perspective Activation (D-12) ───────────────────────────────────

/**
 * Selects 2-3 active perspectives based on previous ambiguity scores.
 * Early turns (overall < 0.4): broad exploration — researcher, simplifier, breadth-keeper
 * Mid turns (0.4 <= overall < 0.7): structural focus — architect + dimension-aware specialists
 * Late turns (overall >= 0.7): closing — seed-closer + architect + specialist if any dim < 0.5
 */
export function selectActivePerspectives(
  previousScores: AmbiguityScores | null,
  turnCount: number,
): PerspectiveName[] {
  // No previous scores (first turn) → broad exploration
  if (!previousScores || turnCount === 0) {
    return ['researcher', 'simplifier', 'breadth-keeper'];
  }

  const { goalClarity, constraintClarity, successCriteriaClarity, overall } = previousScores;

  // Early turns (overall < 0.4): researcher + simplifier + breadth-keeper
  if (overall < 0.4) {
    return ['researcher', 'simplifier', 'breadth-keeper'];
  }

  // Mid turns (0.4 <= overall < 0.7): architect + dimension-aware specialist perspectives
  if (overall < 0.7) {
    const active: PerspectiveName[] = ['architect'];

    // Find the weakest dimension below 0.5 and add its specialist
    const weakest = [
      { dim: 'successCriteriaClarity' as const, value: successCriteriaClarity, perspective: 'seed-closer' as PerspectiveName },
      { dim: 'constraintClarity' as const, value: constraintClarity, perspective: 'breadth-keeper' as PerspectiveName },
      { dim: 'goalClarity' as const, value: goalClarity, perspective: 'researcher' as PerspectiveName },
    ]
      .filter((d) => d.value < 0.5)
      .sort((a, b) => a.value - b.value)[0];

    if (weakest) {
      active.push(weakest.perspective);
    }

    // Fill remaining slot(s) from fallback list, avoiding duplicates
    const fallbacks: PerspectiveName[] = ['breadth-keeper', 'simplifier'];
    for (const fb of fallbacks) {
      if (active.length >= 3) break;
      if (!active.includes(fb)) {
        active.push(fb);
      }
    }

    // Default if no dimension below 0.5 and no specialists were added
    if (active.length < 3 && !weakest) {
      if (!active.includes('breadth-keeper')) active.push('breadth-keeper');
      if (active.length < 3 && !active.includes('simplifier')) active.push('simplifier');
    }

    return active;
  }

  // Late turns (overall >= 0.7): seed-closer + architect, plus specialist if any dimension < 0.5
  const lateActive: PerspectiveName[] = ['seed-closer', 'architect'];

  // Add a third specialist if any dimension needs attention
  if (constraintClarity < 0.5 && !lateActive.includes('breadth-keeper')) {
    lateActive.push('breadth-keeper');
  } else if (goalClarity < 0.5 && !lateActive.includes('researcher')) {
    lateActive.push('researcher');
  } else if (successCriteriaClarity < 0.5 && !lateActive.includes('simplifier')) {
    lateActive.push('simplifier');
  }

  return lateActive;
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

export function buildPerspectivePrompt(transcript: InterviewTurn[]): string {
  if (transcript.length === 0) {
    return 'No interview turns yet. The user has just described their project. Generate one clarifying question from your perspective. Include a brief rationale for why this question matters.';
  }

  const turns = transcript
    .map(
      (t, i) =>
        `Turn ${i + 1} (${t.perspective}):\n  Q: ${t.question}\n  A: ${t.userAnswer}${t.freeformText ? `\n  Additional: ${t.freeformText}` : ''}`,
    )
    .join('\n\n');

  return `Interview transcript so far:\n${turns}\n\nBased on the interview so far, generate one clarifying question from your perspective. Include a brief rationale for why this question matters.`;
}

// ─── Parallel Perspective Execution (D-09, D-21) ─────────────────────────────

/**
 * Runs the selected perspectives in parallel via Promise.all, generating
 * a question candidate from each perspective's system prompt.
 */
export async function runActivePerspectives(
  gateway: LLMGateway,
  transcript: InterviewTurn[],
  previousScores: AmbiguityScores | null,
  projectId: string,
  turnCount: number,
  config: { perspectiveModels?: Partial<Record<string, string>> },
): Promise<PerspectiveCandidate[]> {
  const active = selectActivePerspectives(previousScores, turnCount);

  const calls = active.map(async (name) => {
    const result = await gateway.generateObject({
      projectId,
      stage: 'interview',
      system: PERSPECTIVE_PROMPTS[name],
      prompt: buildPerspectivePrompt(transcript),
      schema: perspectiveCandidateSchema,
      schemaName: `${name}Candidate`,
      schemaDescription: `Question candidate from the ${name} perspective`,
    });

    const modelId = config.perspectiveModels?.[name] ?? 'default';
    return {
      perspective: name,
      question: result.object.question,
      rationale: result.object.rationale,
      model: modelId,
    } satisfies PerspectiveCandidate;
  });

  return Promise.all(calls);
}
