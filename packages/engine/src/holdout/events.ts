import { Inngest, type InngestFunction } from 'inngest';
import { appendEvent } from '@get-cauldron/shared';
import type { DbClient } from '@get-cauldron/shared';
import { unsealVault, storeEvalResults } from './vault.js';
import { evaluateHoldouts } from './evaluator.js';
import type { LLMGateway } from '../gateway/gateway.js';

/**
 * Inngest client for the Cauldron engine.
 * All holdout vault Inngest functions use this shared client.
 */
export const inngest = new Inngest({ id: 'cauldron-engine' });

/**
 * Module-level dependencies for the vault event handlers.
 * Configured via configureVaultDeps() — must be called before Inngest handlers run.
 * Phase 6 will wire the real db and gateway during application startup.
 */
interface VaultDeps {
  db: DbClient;
  gateway: LLMGateway;
}

let vaultDeps: VaultDeps | null = null;

/**
 * Configure the database and gateway dependencies used by the Inngest handlers.
 * Call this during application startup before Inngest begins serving functions.
 */
export function configureVaultDeps(deps: VaultDeps): void {
  vaultDeps = deps;
}

function getVaultDeps(): VaultDeps {
  if (!vaultDeps) {
    throw new Error(
      'Vault dependencies not configured. Call configureVaultDeps({ db, gateway }) before using holdout event handlers.'
    );
  }
  return vaultDeps;
}

/**
 * The core convergence handler logic — extracted for testability.
 * Tests call this directly with a mock step object instead of using Inngest's test harness.
 *
 * Implements the four durable steps per D-13:
 * Step 1 — unseal-vault: decrypt sealed holdout scenarios
 * Step 2 — evaluate-holdouts: LLM evaluation of each scenario against built code
 * Step 3 — store-eval-results: persist evaluation results JSONB + transition to 'evaluated'
 * Step 4 — emit-failure-event (conditional): if any scenarios failed, emit evolution_started
 *
 * Passing all holdout scenarios does NOT trigger a new evolution cycle.
 * Failing scenarios trigger evolution_started with the failure report for Phase 7's evo loop.
 */
export async function convergenceHandler({
  event,
  step,
}: {
  event: {
    data: {
      seedId: string;
      projectId: string;
      vaultId: string;
      codeSummary: string;
    };
  };
  step: {
    run: <T>(name: string, callback: () => Promise<T>) => Promise<T>;
  };
}): Promise<{ vaultId: string; passed: boolean; scenarioCount: number }> {
  const { seedId, projectId, vaultId, codeSummary } = event.data;
  const { db, gateway } = getVaultDeps();

  // Step 1: Unseal the vault — decrypt holdout scenarios
  const scenarios = await step.run('unseal-vault', async () => {
    return unsealVault(db, { vaultId, projectId });
  });

  // Step 2: Evaluate holdout scenarios against the built code using LLM
  const evalResult = await step.run('evaluate-holdouts', async () => {
    return evaluateHoldouts({
      gateway,
      scenarios,
      codeSummary,
      projectId,
      seedId,
    });
  });

  // Step 3: Persist evaluation results and transition vault to 'evaluated'
  await step.run('store-eval-results', async () => {
    await storeEvalResults(db, { vaultId, results: evalResult });
  });

  // Step 4 (conditional): If any scenarios failed, emit evolution_started for the evo loop
  if (!evalResult.passed) {
    await step.run('emit-failure-event', async () => {
      await appendEvent(db, {
        projectId,
        seedId,
        type: 'evolution_started',
        payload: {
          failureReport: evalResult.failureReport,
          triggeredBy: 'holdout_failure',
        },
      });
      // Bridge Gap 1: also send Inngest event so evolution FSM receives it (DB appendEvent alone
      // does not reach the evolution_started Inngest trigger in handleEvolutionStarted)
      await inngest.send({
        name: 'evolution_started',
        data: {
          seedId,
          projectId,
          codeSummary,
          failureReport: evalResult.failureReport,
        },
      });
    });
  }

  return {
    vaultId,
    passed: evalResult.passed,
    scenarioCount: evalResult.scenarioResults.length,
  };
}

/**
 * Inngest function wrapper for the convergence handler.
 * Listens for 'evolution_converged' events and runs the full unseal-evaluate pipeline.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handleEvolutionConverged: InngestFunction<any, any, any, any> = inngest.createFunction(
  { id: 'holdout-vault/unseal-on-convergence', triggers: [{ event: 'evolution_converged' }] },
  (ctx) => convergenceHandler(ctx as any)
);
