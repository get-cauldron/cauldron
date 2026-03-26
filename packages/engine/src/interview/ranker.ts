import { z } from 'zod';
import type { PerspectiveCandidate, RankedQuestion, InterviewTurn } from './types.js';
import type { LLMGateway } from '../gateway/gateway.js';

// ─── Ranker Output Zod Schema (D-11) ─────────────────────────────────────────

const rankerOutputSchema = z.object({
  selectedIndex: z.number().int().min(0),
  mcOptions: z.array(z.string()).min(3).max(4),
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

  const result = await gateway.generateObject({
    projectId,
    stage: 'interview',
    system: RANKER_SYSTEM_PROMPT,
    prompt: `Interview transcript so far:\n${serializeTranscript(transcript)}\n\nCandidate questions:\n${candidateList}\n\nSelect the best question (by index) and generate 3-4 multiple-choice answer options.`,
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
