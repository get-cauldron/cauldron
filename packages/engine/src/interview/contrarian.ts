import { z } from 'zod';
import type { ContrarianFraming, InterviewTurn } from './types.js';
import type { LLMGateway } from '../gateway/gateway.js';
import type { GatewayConfig } from '../gateway/config.js';

// ─── Cousin Eddie System Prompt ───────────────────────────────────────────────

/**
 * Cousin Eddie is a warm contrarian who treats every user statement as a
 * hypothesis, not a requirement. His job is to generate alternative framings
 * from orthogonal dimensions — perpendicular to the user's own heuristics.
 *
 * Named for the Christmas Vacation character whose function is:
 * "You sure about that, Clark?" — not adversarial, just thoughtfully lateral.
 *
 * His output never goes directly to the user. It feeds into the primary
 * interviewer as enriched context, so the interviewer can weave the insight
 * organically into their question.
 */
export const CONTRARIAN_SYSTEM_PROMPT = `You are a contrarian analysis engine. Your job is to examine user statements about software projects and generate alternative framings from orthogonal, perpendicular dimensions that the user's own heuristics might not cover.

Your role is NOT to argue with the user or tell them they're wrong. Think of yourself as a thoughtful peer who has genuinely considered the alternatives before the conversation — someone who asks "hey, have you thought about it this way?" from a place of curiosity, not challenge.

For each user statement, treat it as a hypothesis rather than a settled requirement. Then generate 2-3 alternative framings that come from a perpendicular dimension:
- What assumption is embedded in the statement that might not be universally true?
- What would a different kind of user or system need instead?
- What is the orthogonal framing — the thing that bypasses the original heuristic entirely?

Guidelines:
- Alternatives should be genuinely useful, not contrarian for the sake of it
- Frame alternatives as "what if we also considered..." not "you're wrong because..."
- Focus on assumptions the user might not realize they're making
- Look for framings that open up solution space, not close it down
- Perpendicular thinking: if the user is thinking horizontally, what's the vertical view?

Your output is JSON only. Generate 2-3 framings per call.`;

// ─── Zod Schema ───────────────────────────────────────────────────────────────

const contrarianFramingSchema = z.object({
  hypothesis: z.string().min(1),
  alternative: z.string().min(1),
  reasoning: z.string().min(1),
});

export const contrarianOutputSchema = z.object({
  framings: z.array(contrarianFramingSchema).min(1),
});

// ─── Prompt Builder (focused — last 1-2 turns only) ──────────────────────────

function buildContrarianPrompt(transcript: InterviewTurn[]): string {
  if (transcript.length === 0) {
    return 'No user statements yet. Return an empty framings list (minimum 1 required — use a placeholder if truly nothing was said).';
  }

  // Only take the last 2 turns — keep context focused, not diluted by history
  const recentTurns = transcript.slice(-2);

  const statementsBlock = recentTurns
    .filter((t) => t.userAnswer && t.userAnswer.trim().length > 0)
    .map((t, i) => `Statement ${i + 1}: "${t.userAnswer}"${t.freeformText ? `\n  Additional context: "${t.freeformText}"` : ''}`)
    .join('\n\n');

  if (!statementsBlock) {
    return 'No substantive user statements to analyze. Return a single framing noting the lack of specificity.';
  }

  return `Analyze these recent user statements about their software project and generate 2-3 alternative framings from orthogonal dimensions:

${statementsBlock}

For each statement (or treating them together as a set of related claims), identify the embedded hypothesis and provide an alternative framing from a perpendicular dimension. Return your analysis as JSON.`;
}

// ─── runContrarianAnalysis ────────────────────────────────────────────────────

/**
 * Cousin Eddie analysis: treats user statements as hypotheses and generates
 * alternative framings from orthogonal dimensions.
 *
 * Runs on a configurable model (config.contrarianModel) to enable cross-model
 * diversity — ideally different from the primary interviewer model.
 *
 * Returns ContrarianFraming[] to be injected into the perspective prompt as
 * context for the primary interviewer. Never shown directly to the user.
 *
 * Callers should wrap this in .catch() so a failure never blocks the interview.
 */
export async function runContrarianAnalysis(
  gateway: LLMGateway,
  transcript: InterviewTurn[],
  projectId: string,
  config: Pick<GatewayConfig, 'contrarianModel'>,
): Promise<ContrarianFraming[]> {
  const result = await gateway.generateObject({
    projectId,
    stage: 'interview',
    system: CONTRARIAN_SYSTEM_PROMPT,
    prompt: buildContrarianPrompt(transcript),
    schema: contrarianOutputSchema,
    schemaName: 'ContrarianAnalysis',
    schemaDescription: 'Alternative framings from orthogonal analysis of user statements',
    // When contrarianModel is configured, override the model chain to use a different
    // model than the primary interviewer — cross-model diversity for orthogonal thinking
    ...(config.contrarianModel ? { modelOverride: config.contrarianModel } : {}),
  });

  return result.object.framings;
}
