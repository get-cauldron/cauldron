/**
 * LLM-based simulated user for the live pipeline E2E test.
 *
 * Uses Claude Haiku (Anthropic) to play the "human" role in the interview,
 * reading each question and providing contextual answers. The simulated
 * user never shares a provider with the interviewer (OpenAI).
 */
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

interface SimulatedUserConfig {
  model: string;
  persona: string;
}

/**
 * Generate a simulated user answer for an interview question.
 *
 * @param question - The interviewer's question text
 * @param config - Model and persona configuration
 * @param conversationHistory - Previous Q&A pairs for context
 * @returns The simulated user's answer text
 */
export async function getSimulatedAnswer(
  question: string,
  config: SimulatedUserConfig,
  conversationHistory: Array<{ question: string; answer: string }> = [],
): Promise<string> {
  const historyContext = conversationHistory.length > 0
    ? `\n\nPrevious conversation:\n${conversationHistory.map(
        (h) => `Q: ${h.question}\nA: ${h.answer}`
      ).join('\n\n')}`
    : '';

  const { text } = await generateText({
    model: anthropic(config.model),
    prompt: `${config.persona}${historyContext}\n\nThe interviewer now asks: "${question}"\n\nRespond concisely (1-3 sentences). Be specific and direct:`,
    maxTokens: 200,
  });

  return text.trim();
}

/**
 * Determine if a simulated answer matches any of the MC chip options closely enough
 * to click instead of typing freeform.
 *
 * Uses simple keyword overlap — not LLM-based, to avoid extra cost.
 * Returns the best-matching chip text, or null if no good match.
 */
export function findMatchingChip(
  answer: string,
  chipTexts: string[],
): string | null {
  const answerWords = new Set(answer.toLowerCase().split(/\s+/));

  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const chip of chipTexts) {
    const chipWords = chip.toLowerCase().split(/\s+/);
    const overlap = chipWords.filter((w) => answerWords.has(w)).length;
    const score = overlap / chipWords.length;
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMatch = chip;
    }
  }

  return bestMatch;
}
