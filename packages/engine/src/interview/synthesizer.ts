import { z } from 'zod';
import type { SeedSummary, InterviewTurn } from './types.js';
import type { LLMGateway } from '../gateway/gateway.js';

// D-22, D-24: Seed summary Zod schema for structured generation
export const seedSummarySchema = z.object({
  goal: z.string(),
  constraints: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
  ontologySchema: z.object({
    entities: z.array(z.object({
      name: z.string(),
      attributes: z.array(z.string()),
      relations: z.array(z.object({ to: z.string(), type: z.string() })),
    })),
  }),
  evaluationPrinciples: z.array(z.string()),
  // exitConditions as array of named conditions (z.record generates propertyNames which
  // Anthropic/OpenAI structured output both reject — use explicit array shape instead)
  exitConditions: z.array(z.object({ condition: z.string(), description: z.string() })),
});

// D-22: System prompt for synthesis agent
export const SYNTHESIZER_SYSTEM_PROMPT = `You are a seed specification synthesizer for Cauldron. Given a complete Socratic interview transcript, produce a structured specification that will serve as the immutable source of truth for all downstream software development.

Extract and synthesize:
- goal: A clear, concise statement of what the software must accomplish
- constraints: Technical and business constraints mentioned or implied
- acceptanceCriteria: Specific, testable criteria for success (each should be independently verifiable)
- ontologySchema: Domain entities with their attributes and relationships (the data model implied by the interview)
- evaluationPrinciples: Weighted principles for evaluating whether the built software meets the goal
- exitConditions: Conditions under which development is considered complete

Be precise and complete. Every statement should be traceable to something in the interview transcript.`;

/**
 * D-22, INTV-06: Synthesize a SeedSummary from a full interview transcript.
 * Calls gateway.generateObject with the seedSummarySchema and SYNTHESIZER_SYSTEM_PROMPT.
 */
export async function synthesizeFromTranscript(
  gateway: LLMGateway,
  transcript: InterviewTurn[],
  projectId: string,
): Promise<SeedSummary> {
  const transcriptText = transcript
    .map((t) => `Turn ${t.turnNumber} (${t.perspective}): Q: ${t.question}\nA: ${t.userAnswer}${t.freeformText ? `\nAdditional: ${t.freeformText}` : ''}`)
    .join('\n\n');

  const result = await gateway.generateObject({
    projectId,
    stage: 'interview',
    system: SYNTHESIZER_SYSTEM_PROMPT,
    prompt: `Synthesize the following interview transcript into a seed specification:\n\n${transcriptText}`,
    schema: seedSummarySchema,
    schemaName: 'SeedSummary',
    schemaDescription: 'Immutable seed specification synthesized from interview transcript',
  });

  return result.object as SeedSummary;
}
