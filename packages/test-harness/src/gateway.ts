import type { LLMGateway } from '@get-cauldron/engine';
import { vi } from 'vitest';

/**
 * A single scripted response for gateway.generateObject().
 * Responses are consumed in order — first call gets script[0], second gets script[1], etc.
 */
export interface MockGatewayCall {
  /** Pipeline stage (e.g., 'interview', 'holdout'). Optional filter — if set, the call's stage must match. */
  stage?: string;
  /** Schema name filter. Optional — if set, the call's schemaName must match. */
  schema?: string;
  /** The object to return from generateObject(). Wrapped in { object: ... } automatically. */
  returns: unknown;
}

/**
 * Creates a mock LLMGateway that returns scripted responses in order.
 *
 * Features:
 * - Ordered: responses are consumed sequentially
 * - Validating: throws if an unexpected call is made after all scripts are consumed
 * - Exhaustion check: assertAllConsumed() verifies no responses were left unused
 *
 * Usage:
 *   const gateway = createScriptedGateway([
 *     { stage: 'interview', schema: 'scores', returns: { goalClarity: 0.6, ... } },
 *     { stage: 'interview', returns: { question: '...', rationale: '...' } },
 *   ]);
 */
export function createScriptedGateway(
  script: MockGatewayCall[],
): LLMGateway & { assertAllConsumed: () => void } {
  let callIndex = 0;
  const totalCalls = script.length;

  const generateObject = vi.fn().mockImplementation(async (options: { stage?: string; schemaName?: string }) => {
    if (callIndex >= totalCalls) {
      throw new Error(
        `MockGateway: unexpected call #${callIndex + 1} (only ${totalCalls} scripted). ` +
        `Stage: ${options.stage ?? 'unknown'}, schema: ${options.schemaName ?? 'unknown'}`,
      );
    }

    const entry = script[callIndex]!;

    // Validate stage filter if specified
    if (entry.stage && options.stage && entry.stage !== options.stage) {
      throw new Error(
        `MockGateway call #${callIndex + 1}: expected stage '${entry.stage}', got '${options.stage}'`,
      );
    }

    // Validate schema filter if specified
    if (entry.schema && options.schemaName && entry.schema !== options.schemaName) {
      throw new Error(
        `MockGateway call #${callIndex + 1}: expected schema '${entry.schema}', got '${options.schemaName}'`,
      );
    }

    callIndex++;
    return { object: entry.returns };
  });

  const assertAllConsumed = () => {
    if (callIndex < totalCalls) {
      throw new Error(
        `MockGateway: ${totalCalls - callIndex} scripted responses were not consumed ` +
        `(consumed ${callIndex} of ${totalCalls})`,
      );
    }
  };

  // Return a minimal mock that satisfies the LLMGateway interface for what tRPC routers use.
  // Only generateObject is used by interview/holdout flows.
  return {
    generateObject,
    generateText: vi.fn().mockRejectedValue(new Error('MockGateway: generateText not scripted')),
    streamText: vi.fn().mockRejectedValue(new Error('MockGateway: streamText not scripted')),
    streamObject: vi.fn().mockRejectedValue(new Error('MockGateway: streamObject not scripted')),
    assertAllConsumed,
  } as unknown as LLMGateway & { assertAllConsumed: () => void };
}
