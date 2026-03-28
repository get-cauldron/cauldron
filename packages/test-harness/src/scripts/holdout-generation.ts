import type { MockGatewayCall } from '../gateway.js';

export interface HoldoutGenerationOptions {
  /** Number of scenarios to generate. Default 5 (minimum for sealing). */
  scenarioCount?: number;
}

/**
 * Builds a 1-call gateway script for holdout scenario generation:
 *   1. generateHoldoutScenarios (generateObject with stage 'holdout')
 *
 * Matches the call sequence in generateHoldoutScenarios().
 */
export function holdoutGenerationScript(options?: HoldoutGenerationOptions): MockGatewayCall[] {
  const count = options?.scenarioCount ?? 5;

  const scenarios = Array.from({ length: count }, (_, i) => ({
    id: `holdout-${i + 1}`,
    name: `Adversarial Scenario ${i + 1}`,
    description: `Tests edge case ${i + 1} that implementation might miss`,
    testCode: `test('holdout scenario ${i + 1}', () => {\n  expect(true).toBe(true);\n});`,
    category: i % 2 === 0 ? 'functional' : 'edge_case',
  }));

  return [
    {
      stage: 'holdout',
      returns: { scenarios },
    },
  ];
}
