import { z } from 'zod';
import type { PerspectiveCandidate, RankedQuestion, InterviewTurn } from './types.js';
import type { LLMGateway } from '../gateway/gateway.js';

// ─── Ranker Output Zod Schema (D-11) ─────────────────────────────────────────
// Note: no integer min/max or array minItems/maxItems — Anthropic structured
// output does not support these JSON Schema constraints. The ranker guards
// out-of-bounds index at runtime (line 60) and takes first 4 mc options.

const rankerOutputSchema = z.object({
  selectedIndex: z.number(),
  mcOptions: z.array(z.string()),
  selectionRationale: z.string(),
});

// ─── System Prompt ────────────────────────────────────────────────────────────

export const RANKER_SYSTEM_PROMPT =
  'You are a question ranker for a Socratic interview. Given candidate questions from multiple perspectives, select the single most valuable question to ask next — the one that will most efficiently reduce ambiguity. Then generate 3-4 multiple-choice answer suggestions that represent the most likely answers, ranging from simple to comprehensive. The user always has a freeform option in addition to your suggestions.';

// ─── Transcript Serializer ────────────────────────────────────────────────────

export function serializeTranscript(transcript: InterviewTurn[]): string {
  if (transcript.length === 0) {
    return '(No turns yet)';
  }
  return transcript
    .map(
      (t) =>
        `Turn ${t.turnNumber} (${t.perspective}): Q: ${t.question} A: ${t.userAnswer}`,
    )
    .join('\n');
}

// ─── Ranker Function (D-11, D-13) ────────────────────────────────────────────

/**
 * Selects the best question from perspective candidates and generates
 * 3-4 multiple-choice answer options for the user.
 */
export async function rankCandidates(
  gateway: LLMGateway,
  candidates: PerspectiveCandidate[],
  transcript: InterviewTurn[],
  projectId: string,
): Promise<RankedQuestion> {
  const candidateList = candidates
    .map((c, i) => `[${i}] (${c.perspective}): ${c.question}\n    Rationale: ${c.rationale}`)
    .join('\n');

  const turnGuidance = transcript.length === 0
    ? '\n\nNote: This is the opening question of the interview. Prefer questions that explore the user\'s full vision and goals before narrowing scope. The first question should make the user feel heard and excited to share — avoid questions that sound like they are simplifying or constraining the idea.'
    : '';

  const result = await gateway.generateObject({
    projectId,
    stage: 'interview',
    system: RANKER_SYSTEM_PROMPT,
    prompt: `Interview transcript so far:\n${serializeTranscript(transcript)}\n\nCandidate questions:\n${candidateList}\n\nSelect the best question (by index) and generate 3-4 multiple-choice answer options.${turnGuidance}`,
    schema: rankerOutputSchema,
    schemaName: 'RankerOutput',
    schemaDescription: 'Selected question index and multiple-choice answer suggestions',
  });

  const { selectedIndex, mcOptions, selectionRationale } = result.object;
  // Guard against out-of-bounds index from LLM
  const selected = candidates[selectedIndex] ?? candidates[0]!;

  return {
    selectedCandidate: selected,
    mcOptions,
    selectionRationale,
  };
}
