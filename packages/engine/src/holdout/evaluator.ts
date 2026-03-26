import { z } from 'zod';
import type { LLMGateway } from '../gateway/gateway.js';
import type { HoldoutScenario, HoldoutEvalResult, HoldoutFailureReport, ScenarioResult } from './types.js';

/**
 * System prompt for the LLM evaluation stage.
 * Instructs the model to assess each Given/When/Then scenario against
 * the actual built code, returning pass/fail with reasoning per D-14.
 */
export const EVALUATION_SYSTEM_PROMPT = `You are evaluating whether implemented software meets its holdout test scenarios.

For each scenario provided:
1. Read the Given/When/Then acceptance criteria carefully
2. Examine the code summary to determine if the implementation satisfies each criterion
3. Return pass: true only if the code demonstrably satisfies ALL parts of the scenario
4. For failures, provide specific reasoning citing what is missing or incorrect
5. Include evidence: a specific code reference or behavioral observation

Be critical and precise. "Probably works" is not a pass — you need evidence in the code that it works.
Evaluate each scenario independently based on what the code actually does, not what it might do.`;

/**
 * Zod schema for the structured LLM evaluation output.
 */
export const EvalResultSchema = z.object({
  scenarioResults: z.array(z.object({
    scenarioId: z.string(),
    pass: z.boolean(),
    reasoning: z.string(),
    evidence: z.string(),
  })),
});

/**
 * Builds a structured failure report from failed scenarios for evo loop consumption per D-15.
 */
export function buildFailureReport(params: {
  seedId: string;
  scenarios: HoldoutScenario[];
  evalResults: Array<{ scenarioId: string; pass: boolean; reasoning: string; evidence?: string }>;
  evaluationModel: string;
}): HoldoutFailureReport {
  const { seedId, scenarios, evalResults, evaluationModel } = params;

  const scenarioMap = new Map(scenarios.map(s => [s.id, s]));

  const failedScenarios = evalResults
    .filter(r => !r.pass)
    .map(r => {
      const scenario = scenarioMap.get(r.scenarioId);
      return {
        scenarioId: r.scenarioId,
        title: scenario?.title ?? 'Unknown scenario',
        category: scenario?.category ?? 'edge_case',
        reasoning: r.reasoning,
      };
    });

  return {
    seedId,
    failedScenarios,
    evaluationModel,
    triggeredBy: 'holdout_failure',
  };
}

/**
 * Evaluates holdout scenarios against built code using the LLM evaluation stage per D-14.
 *
 * Process:
 * 1. Build a prompt with scenario JSON + code summary
 * 2. Call gateway.generateObject with stage 'evaluation'
 * 3. Compute overall pass/fail
 * 4. If any scenario fails, build a failure report for the evolutionary loop
 *
 * @returns HoldoutEvalResult with per-scenario pass/fail and optional failure report
 */
export async function evaluateHoldouts(params: {
  gateway: LLMGateway;
  scenarios: HoldoutScenario[];
  codeSummary: string;
  projectId: string;
  seedId: string;
}): Promise<HoldoutEvalResult> {
  const { gateway, scenarios, codeSummary, projectId, seedId } = params;

  const scenariosJson = JSON.stringify(scenarios, null, 2);

  const prompt = `You are evaluating whether the following implementation satisfies the holdout test scenarios.

## Holdout Test Scenarios

${scenariosJson}

## Implementation Code Summary

${codeSummary}

Evaluate each scenario against the code summary. For each scenario, determine if the implementation satisfies the Given/When/Then criteria.`;

  const result = await gateway.generateObject({
    projectId,
    stage: 'evaluation',
    schema: EvalResultSchema,
    schemaName: 'HoldoutEvaluation',
    prompt,
    system: EVALUATION_SYSTEM_PROMPT,
  });

  const { scenarioResults } = result.object as z.infer<typeof EvalResultSchema>;

  const passed = scenarioResults.every((r: ScenarioResult) => r.pass);

  // Use a stable evaluation model identifier for now; Phase 6 will wire in the actual model ID
  const evaluationModel = 'evaluation-stage';

  let failureReport: HoldoutFailureReport | undefined;
  if (!passed) {
    failureReport = buildFailureReport({
      seedId,
      scenarios,
      evalResults: scenarioResults,
      evaluationModel,
    });
  }

  return {
    passed,
    scenarioResults,
    evaluationModel,
    evaluatedAt: new Date(),
    failureReport,
  };
}
