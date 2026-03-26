import { describe, it, expect } from 'vitest';
import { calculateCostCents, MODEL_PRICING } from '../pricing.js';
import { MODEL_FAMILY_MAP } from '../providers.js';

describe('calculateCostCents', () => {
  it('returns correct cost for claude-sonnet-4-6', () => {
    // inputPerMToken: 300, outputPerMToken: 1500
    // 1M input tokens → 300 cents, 500k output tokens → 750 cents
    const result = calculateCostCents('claude-sonnet-4-6', 1_000_000, 500_000);
    expect(result).toBe(1050); // Math.round(300 + 750)
  });

  it('returns 0 for an unknown model', () => {
    expect(calculateCostCents('unknown-model-xyz', 1_000_000, 1_000_000)).toBe(0);
  });

  it('returns 0 for empty string model ID', () => {
    expect(calculateCostCents('', 1000, 1000)).toBe(0);
  });

  it('returns correct cost for gpt-4o', () => {
    // inputPerMToken: 250, outputPerMToken: 1000
    // 1M input → 250 cents, 1M output → 1000 cents
    expect(calculateCostCents('gpt-4o', 1_000_000, 1_000_000)).toBe(1250);
  });

  it('returns correct cost for gemini-2.5-pro', () => {
    // inputPerMToken: 125, outputPerMToken: 1000
    // 2M input → 250 cents, 1M output → 1000 cents
    expect(calculateCostCents('gemini-2.5-pro', 2_000_000, 1_000_000)).toBe(1250);
  });

  it('rounds fractional cents with Math.round', () => {
    // 1 token of claude-haiku: 80/1M input, 400/1M output
    // 1 input token: 80/1M = 0.000080 cents, 1 output token: 400/1M = 0.000400 cents
    // Total = 0.00048, rounds to 0
    expect(calculateCostCents('claude-haiku-4-5', 1, 1)).toBe(0);
  });

  it('every key in MODEL_FAMILY_MAP has a corresponding MODEL_PRICING entry', () => {
    const missingPricing = Object.keys(MODEL_FAMILY_MAP).filter((modelId) => {
      return !(modelId in MODEL_PRICING);
    });
    expect(missingPricing).toEqual([]);
  });
});
