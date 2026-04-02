import { z } from 'zod';
import type {
  PerspectiveName,
  AmbiguityScores,
  PerspectiveCandidate,
  InterviewTurn,
  ContrarianFraming,
} from './types.js';
import type { LLMGateway } from '../gateway/gateway.js';

// ─── Perspective System Prompts (D-09) ───────────────────────────────────────

export const PERSPECTIVE_PROMPTS: Record<PerspectiveName, string> = {
  researcher:
    "You are the Researcher on a collaborative interview panel helping a user build software. Your tone is warm and curious — you're a partner, not an interrogator. Ask questions that help the user think through aspects they might not have considered yet: implicit assumptions, target users, scale expectations, or alternative approaches. Never challenge or argue with the user's stated goals. Accept what they want to build and help them clarify the details.",
  simplifier:
    'You are the Simplifier on a collaborative interview panel helping a user build software. Your tone is friendly and pragmatic. Help the user find the simplest path to their goal by asking "what if we started with just..." questions. Never suggest the user is overcomplicating things — instead, help them identify which parts are essential for a first version vs. what can come later.',
  architect:
    'You are the Architect on a collaborative interview panel helping a user build software. Your tone is thoughtful and constructive. Ask about the structural aspects that will help the team build it well: data models, component boundaries, integration points, and key technical decisions. Frame questions as "how would you like..." not "have you considered...".',
  'breadth-keeper':
    'You are the Breadth-Keeper on a collaborative interview panel helping a user build software. Your tone is supportive and thorough. Gently surface dimensions the user might want to think about: error handling, edge cases, deployment, or accessibility. Frame these as "one thing worth thinking about is..." rather than pointing out gaps.',
  'seed-closer':
    'You are the Seed-Closer on a collaborative interview panel helping a user build software. Your tone is encouraging and action-oriented. Help convert the user\'s vision into concrete, testable acceptance criteria. Ask "how will we know when this is working?" and "what does success look like for...?" to move toward a buildable specification.',
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

/**
 * Builds the prompt for a perspective panel member.
 *
 * When contrarianFramings are provided (from Cousin Eddie analysis), they are
 * injected as context BEFORE the instruction to ask a question. This allows the
 * perspective to organically weave contrarian insights into their question
 * without ever surfacing the framings directly to the user.
 */
export function buildPerspectivePrompt(
  transcript: InterviewTurn[],
  contrarianFramings?: ContrarianFraming[],
): string {
  const hasFramings = contrarianFramings && contrarianFramings.length > 0;

  if (transcript.length === 0) {
    const base =
      'The user has just started describing their project. Ask one friendly, clarifying question from your perspective to help them flesh out their idea. Include a brief rationale for why this question matters. Remember: you are helping them build what THEY want — accept their vision and help clarify the details.';
    if (!hasFramings) return base;

    const contrarianSection = buildContrarianSection(contrarianFramings!);
    return `${contrarianSection}\n\n${base}`;
  }

  const turns = transcript
    .map(
      (t, i) =>
        `Turn ${i + 1} (${t.perspective}):\n  Q: ${t.question}\n  A: ${t.userAnswer}${t.freeformText ? `\n  Additional: ${t.freeformText}` : ''}`,
    )
    .join('\n\n');

  const transcriptBlock = `Interview transcript so far:\n${turns}`;
  const questionInstruction =
    'Based on the conversation, ask one helpful clarifying question from your perspective. Accept the user\'s goals as stated — help them refine the details, don\'t question their direction. Include a brief rationale for why this question matters.';

  if (!hasFramings) {
    return `${transcriptBlock}\n\n${questionInstruction}`;
  }

  const contrarianSection = buildContrarianSection(contrarianFramings!);
  return `${transcriptBlock}\n\n${contrarianSection}\n\n${questionInstruction}`;
}

function buildContrarianSection(framings: ContrarianFraming[]): string {
  const framingLines = framings
    .map(
      (f) =>
        `- Hypothesis: "${f.hypothesis}" -> Alternative: "${f.alternative}" (Reasoning: ${f.reasoning})`,
    )
    .join('\n');

  return `Alternative framings to consider (from a contrarian analysis of the user's statements):\n${framingLines}\n\nConsider these alternative framings when crafting your question. If any of them reveal an unexamined assumption, weave that insight into your question naturally. Do not mention these framings directly to the user — integrate the insight organically.`;
}

// ─── Parallel Perspective Execution (D-09, D-21) ─────────────────────────────

/**
 * Runs the selected perspectives in parallel via Promise.all, generating
 * a question candidate from each perspective's system prompt.
 *
 * When contrarianFramings are provided (from Cousin Eddie analysis), they are
 * injected into the perspective prompt as context — so each perspective can
 * organically weave contrarian insights into their question.
 */
export async function runActivePerspectives(
  gateway: LLMGateway,
  transcript: InterviewTurn[],
  previousScores: AmbiguityScores | null,
  projectId: string,
  turnCount: number,
  config: { perspectiveModels?: Partial<Record<string, string>> },
  contrarianFramings?: ContrarianFraming[],
): Promise<PerspectiveCandidate[]> {
  const active = selectActivePerspectives(previousScores, turnCount);

  const calls = active.map(async (name) => {
    const result = await gateway.generateObject({
      projectId,
      stage: 'interview',
      system: PERSPECTIVE_PROMPTS[name],
      prompt: buildPerspectivePrompt(transcript, contrarianFramings),
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
