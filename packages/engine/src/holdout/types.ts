import { z } from 'zod';

/**
 * Zod schema for a single holdout test scenario per D-05.
 * Given/When/Then format, LLM-evaluable, tests the WHAT not the HOW.
 */
export const HoldoutScenarioSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  given: z.string(),
  when: z.string(),
  then: z.string(),
  category: z.enum(['happy_path', 'edge_case', 'error_handling', 'performance', 'security']),
  acceptanceCriterionRef: z.string(),
  severity: z.enum(['critical', 'major', 'minor']),
});

/**
 * Schema for the full collection of holdout scenarios.
 * Minimum 5 scenarios per D-02.
 */
export const HoldoutScenariosSchema = z.object({
  scenarios: z.array(HoldoutScenarioSchema).min(5),
});

export type HoldoutScenario = z.infer<typeof HoldoutScenarioSchema>;
export type HoldoutScenarios = z.infer<typeof HoldoutScenariosSchema>;

/**
 * The sealed payload as stored in holdout_vault DB columns.
 * All fields are base64-encoded strings.
 * encryptedDek is a compound string: `${dekIv}:${dekAuthTag}:${dekCiphertext}` (all base64).
 */
export interface SealedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  encryptedDek: string;
}

/**
 * Per-scenario result from LLM evaluation after unsealing.
 */
export interface ScenarioResult {
  scenarioId: string;
  pass: boolean;
  reasoning: string;
  evidence: string;
}

/**
 * Full evaluation result returned by the holdout evaluator.
 * Stored as JSONB in holdout_vault.results per D-18.
 */
export interface HoldoutEvalResult {
  passed: boolean;
  scenarioResults: ScenarioResult[];
  evaluationModel: string;
  evaluatedAt: Date;
  failureReport?: HoldoutFailureReport;
}

/**
 * Failure report attached to evolution_started event per D-15.
 * Consumed by Phase 7 evolutionary loop.
 */
export interface HoldoutFailureReport {
  seedId: string;
  failedScenarios: Array<{
    scenarioId: string;
    title: string;
    category: string;
    reasoning: string;
  }>;
  evaluationModel: string;
  triggeredBy: 'holdout_failure';
}
