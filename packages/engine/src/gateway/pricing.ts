interface ModelPricing {
  inputPerMToken: number;   // cost per 1M input tokens in cents
  outputPerMToken: number;  // cost per 1M output tokens in cents
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-6':       { inputPerMToken: 300,  outputPerMToken: 1500 },
  'claude-opus-4-6':         { inputPerMToken: 1500, outputPerMToken: 7500 },
  'claude-opus-4-5':         { inputPerMToken: 1500, outputPerMToken: 7500 },
  'claude-haiku-4-5':        { inputPerMToken: 80,   outputPerMToken: 400 },
  'gpt-5.4':                 { inputPerMToken: 250,  outputPerMToken: 1000 },
  'gpt-5-mini':              { inputPerMToken: 40,   outputPerMToken: 160 },
  'gpt-5-nano':              { inputPerMToken: 10,   outputPerMToken: 40 },
  'gpt-4o':                  { inputPerMToken: 250,  outputPerMToken: 1000 },
  'gpt-4o-mini':             { inputPerMToken: 15,   outputPerMToken: 60 },
  'gpt-4.1':                 { inputPerMToken: 200,  outputPerMToken: 800 },
  'gpt-4.1-mini':            { inputPerMToken: 40,   outputPerMToken: 160 },
  'gemini-3.1-pro-preview':  { inputPerMToken: 125,  outputPerMToken: 1000 },
  'gemini-2.5-pro':          { inputPerMToken: 125,  outputPerMToken: 1000 },
  'gemini-2.5-flash':        { inputPerMToken: 15,   outputPerMToken: 60 },
};

export function calculateCostCents(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = MODEL_PRICING[modelId];
  if (!pricing) return 0;
  const inputCost = (promptTokens / 1_000_000) * pricing.inputPerMToken;
  const outputCost = (completionTokens / 1_000_000) * pricing.outputPerMToken;
  return Math.round(inputCost + outputCost);
}
