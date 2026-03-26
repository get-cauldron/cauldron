import { z } from 'zod';
import type { LLMGateway } from '../gateway/gateway.js';
import type { Seed } from '@cauldron/shared';
import { HoldoutScenarioSchema, HoldoutScenariosSchema } from './types.js';
import type { HoldoutScenario } from './types.js';

/**
 * Adversarial system prompt per D-04.
 * Instructs the holdout model to generate tests that a DIFFERENT AI model
 * implementing the spec would likely miss.
 */
export const ADVERSARIAL_SYSTEM_PROMPT = `You are generating adversarial holdout test scenarios for software.
Your goal is to create tests that a DIFFERENT AI model implementing the specification is likely to miss.

Focus on:
- boundary conditions and off-by-one errors (e.g., empty arrays, single-element collections, maximum sizes)
- Error handling and error propagation (what happens when things go wrong)
- Null and undefined inputs that look valid but aren't
- Unicode and encoding edge cases (emoji, RTL text, special characters)
- Concurrency and state management bugs (shared state, race conditions, ordering)
- Large inputs and performance edge cases (timeouts, memory limits)
- Security edge cases (injection, path traversal, privilege escalation)
- Unexpected sequences or orderings of operations

Format each scenario using Given/When/Then to describe observable behavior.
Do NOT test implementation internals — test the WHAT, not the HOW.
Think adversarially: what would a developer assume is true but might not be?`;

/**
 * Builds the user prompt from seed data.
 * Includes goal, acceptance criteria, constraints, and optionally rejection context.
 */
export function buildGeneratorPrompt(
  seed: Seed,
  rejectedContext?: { rejectedIds: string[]; reasons: string[] }
): string {
  const acceptanceCriteria = seed.acceptanceCriteria as unknown as string[];
  const constraints = seed.constraints as unknown as string[];

  let prompt = `## Software Goal

${seed.goal}

## Acceptance Criteria

${acceptanceCriteria.map((ac, i) => `${i + 1}. ${ac}`).join('\n')}

## Constraints

${constraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Instructions

Generate 1-3 holdout test scenarios per acceptance criterion. Minimum 5 total.
Scenarios must test observable behavior, not implementation details.
Use the Given/When/Then format. Be adversarial — focus on what implementing agents miss.`;

  if (rejectedContext) {
    prompt += `\n\n## Regeneration Request

The following scenario IDs were rejected and need replacement:
${rejectedContext.rejectedIds.join(', ')}

Rejection reasons:
${rejectedContext.reasons.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Generate replacement scenarios only for these rejected IDs. Do not repeat approved scenarios.`;
  }

  return prompt;
}

/**
 * Generates adversarial holdout scenarios from a seed via the LLM gateway.
 * Uses stage 'holdout' to enforce cross-model diversity (gateway enforces different
 * provider family from implementation stage per D-03).
 */
export async function generateHoldoutScenarios(params: {
  gateway: LLMGateway;
  seed: Seed;
  projectId: string;
}): Promise<HoldoutScenario[]> {
  const { gateway, seed, projectId } = params;

  const result = await gateway.generateObject({
    projectId,
    stage: 'holdout',
    schema: HoldoutScenariosSchema,
    schemaName: 'HoldoutScenarios',
    schemaDescription: 'A collection of adversarial holdout test scenarios for software validation',
    prompt: buildGeneratorPrompt(seed),
    system: ADVERSARIAL_SYSTEM_PROMPT,
    temperature: 0.8,
  });

  return result.object.scenarios;
}

/**
 * Regenerates only rejected scenarios, preserving approved ones per D-09.
 * Uses a relaxed schema (no min 5) since we're only replacing a subset.
 */
export async function regenerateRejected(params: {
  gateway: LLMGateway;
  seed: Seed;
  projectId: string;
  rejectedIds: string[];
  reasons: string[];
  existingApproved: HoldoutScenario[];
}): Promise<HoldoutScenario[]> {
  const { gateway, seed, projectId, rejectedIds, reasons, existingApproved } = params;

  // Relaxed schema for partial regeneration (no .min(5))
  const RegenerationSchema = z.object({
    scenarios: z.array(HoldoutScenarioSchema),
  });

  const result = await gateway.generateObject({
    projectId,
    stage: 'holdout',
    schema: RegenerationSchema,
    schemaName: 'HoldoutScenarios',
    schemaDescription: 'Replacement holdout scenarios for rejected entries',
    prompt: buildGeneratorPrompt(seed, { rejectedIds, reasons }),
    system: ADVERSARIAL_SYSTEM_PROMPT,
    temperature: 0.8,
  });

  // Combine: existing approved + newly regenerated
  return [...existingApproved, ...result.object.scenarios];
}
