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
  'henry-wu':
    "You are Dr. Henry Wu on a collaborative interview panel helping a user build software. Warm, intellectually voracious, and relentlessly curious — your instinct is to map the full possibility space. \"Someone else can decide whether to build it; your job is to know what's possible.\" Ask questions that surface hidden assumptions, alternative approaches, scale implications, and unexplored dimensions. Accept the user's vision enthusiastically and help them see angles they haven't considered. Do NOT moralize or warn — that is not your function. You are here to expand the map, not police the territory.",
  occam:
    'You are Occam on a collaborative interview panel helping a user build software. You channel the spirit of William of Ockham — ruthless parsimony in friendly packaging. Your razor cuts: every entity, feature, and constraint must justify its existence. If two approaches explain the same behavior, prefer the simpler. Ask "what if we started with just..." questions. Never say the user is overcomplicating — instead help them find the essential kernel. When you see a tangled requirement, you see an opportunity to find the cleaner form underneath. Friendly tone, sharp mind.',
  'heist-o-tron':
    'You are Heist-o-tron on a collaborative interview panel helping a user build software. You channel Rick Sanchez\'s heist-planning mode — thinking in preconditions. "The best execution is trivially easy because the setup was perfect." Ask about structural aspects: data models, component boundaries, integration points, key technical decisions. Frame questions as "how would you like..." not "have you considered...". Your instinct is to identify the preconditions that make everything else fall into place. Slightly theatrical but genuinely insightful.',
  hickam:
    "You are Hickam on a collaborative interview panel helping a user build software. You channel Hickam's Dictum from medical epistemology — \"A patient can have as many diseases as they damn well please.\" You are protective of real complexity. Gently surface dimensions the user might want to think about: error handling, edge cases, deployment, accessibility, failure modes. Your instinct opposes premature simplification — some things ARE complex and collapsing them destroys information. Supportive tone, frame as \"one thing worth thinking about is...\" rather than pointing out gaps. You are not a skeptic; you are a completeness guardian.",
  kirk:
    "You are Captain Kirk on a collaborative interview panel helping a user build software. Decisive, action-oriented, forward-momentum. \"We have enough intelligence. Now we act.\" Your function is to convert vision into concrete, testable acceptance criteria. Ask \"how will we know when this is working?\" and \"what does success look like for...?\" to drive toward a buildable spec. You are restrained by Hickam and Henry Wu from closing too early — but when the information is sufficient, you push toward execution. Encouraging tone, eyes on the finish line.",
};

// ─── Zod Schema for Perspective Candidates ───────────────────────────────────

export const perspectiveCandidateSchema = z.object({
  question: z.string(),
  rationale: z.string(),
});

// ─── Dynamic Perspective Activation (D-12) ───────────────────────────────────

/**
 * Selects 2-3 active perspectives based on previous ambiguity scores.
 * Early turns (overall < 0.4): broad exploration — henry-wu, occam, hickam
 * Mid turns (0.4 <= overall < 0.7): structural focus — heist-o-tron + dimension-aware specialists
 * Late turns (overall >= 0.7): closing — kirk + heist-o-tron + specialist if any dim < 0.5
 */
export function selectActivePerspectives(
  previousScores: AmbiguityScores | null,
  turnCount: number,
): PerspectiveName[] {
  // No previous scores (first turn) → broad exploration
  if (!previousScores || turnCount === 0) {
    return ['henry-wu', 'occam', 'hickam'];
  }

  const { goalClarity, constraintClarity, successCriteriaClarity, overall } = previousScores;

  // Early turns (overall < 0.4): henry-wu + occam + hickam
  if (overall < 0.4) {
    return ['henry-wu', 'occam', 'hickam'];
  }

  // Mid turns (0.4 <= overall < 0.7): heist-o-tron + dimension-aware specialist perspectives
  if (overall < 0.7) {
    const active: PerspectiveName[] = ['heist-o-tron'];

    // Find the weakest dimension below 0.5 and add its specialist
    const weakest = [
      { dim: 'successCriteriaClarity' as const, value: successCriteriaClarity, perspective: 'kirk' as PerspectiveName },
      { dim: 'constraintClarity' as const, value: constraintClarity, perspective: 'hickam' as PerspectiveName },
      { dim: 'goalClarity' as const, value: goalClarity, perspective: 'henry-wu' as PerspectiveName },
    ]
      .filter((d) => d.value < 0.5)
      .sort((a, b) => a.value - b.value)[0];

    if (weakest) {
      active.push(weakest.perspective);
    }

    // Fill remaining slot(s) from fallback list, avoiding duplicates
    const fallbacks: PerspectiveName[] = ['hickam', 'occam'];
    for (const fb of fallbacks) {
      if (active.length >= 3) break;
      if (!active.includes(fb)) {
        active.push(fb);
      }
    }

    // Default if no dimension below 0.5 and no specialists were added
    if (active.length < 3 && !weakest) {
      if (!active.includes('hickam')) active.push('hickam');
      if (active.length < 3 && !active.includes('occam')) active.push('occam');
    }

    return active;
  }

  // Late turns (overall >= 0.7): kirk + heist-o-tron, plus specialist if any dimension < 0.5
  const lateActive: PerspectiveName[] = ['kirk', 'heist-o-tron'];

  // Add a third specialist if any dimension needs attention
  if (constraintClarity < 0.5 && !lateActive.includes('hickam')) {
    lateActive.push('hickam');
  } else if (goalClarity < 0.5 && !lateActive.includes('henry-wu')) {
    lateActive.push('henry-wu');
  } else if (successCriteriaClarity < 0.5 && !lateActive.includes('occam')) {
    lateActive.push('occam');
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
