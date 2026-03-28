import { type InngestFunction } from 'inngest';
import { eq } from 'drizzle-orm';
import { appendEvent, seeds } from '@get-cauldron/shared';
import type { DbClient } from '@get-cauldron/shared';
import type { Seed } from '@get-cauldron/shared';
import { inngest } from '../holdout/events.js';
import { evaluateGoalAttainment } from './evaluator.js';
import { checkConvergence, checkStagnation } from './convergence.js';
import { mutateSeed, mutateSeedFromProposal } from './mutator.js';
import { runLateralThinking } from './lateral-thinking.js';
import { checkLineageBudget } from './budget.js';
import { getSeedLineage } from '../interview/crystallizer.js';
import { BudgetExceededError } from '../gateway/errors.js';
import type { LLMGateway } from '../gateway/gateway.js';
import { SUCCESS_THRESHOLD } from './types.js';
import type { GoalAttainmentResult } from './types.js';

interface EvolutionDeps {
  db: DbClient;
  gateway: LLMGateway;
  budgetLimitCents?: number; // default 10000 (100 USD)
}

let evolutionDeps: EvolutionDeps | null = null;

/**
 * Configure the database and gateway dependencies used by the evolution FSM Inngest handler.
 * Call this during application startup before Inngest begins serving functions.
 */
export function configureEvolutionDeps(deps: EvolutionDeps): void {
  evolutionDeps = deps;
}

function getEvolutionDeps(): EvolutionDeps {
  if (!evolutionDeps) {
    throw new Error(
      'Evolution dependencies not configured. Call configureEvolutionDeps({ db, gateway }) before using evolution event handlers.'
    );
  }
  return evolutionDeps;
}

/**
 * The core evolution cycle handler — extracted for testability.
 * Tests call this directly with a fake step object instead of using Inngest's test harness.
 *
 * Implements the 8-state FSM per D-21:
 * - idle → evaluating → scoring → evolving → decomposing (normal path)
 * - Any terminal state: converged or halted
 * - Stagnation triggers lateral_thinking state before halting or evolving
 *
 * Pre-cycle: budget-check (BudgetExceededError → halted/budget_exceeded)
 * Step 1 — load-seed: fetch seed from DB
 * Step 2 — evaluate-goal-attainment (evaluating state): score the implementation
 * Step 3 — check-goal-met (converged): score >= SUCCESS_THRESHOLD → emit goal_met, send converged
 * Step 4 — check-convergence (scoring state): any-of convergence signals → emit halted, send converged
 * Step 5 — check-stagnation (evolving/lateral_thinking): fetch lineage, check for stagnation
 *   5a — lateral thinking: run personas, meta-judge selects
 *     - null → emit escalated, send converged → halted/escalated
 *     - non-null → mutateSeedFromProposal → dispatch with tier=full
 * Step 6 — generate-evolved-seed (evolving state, normal path): mutateSeed
 * Step 7 — dispatch-decomposition (decomposing state): send bead.dispatch_requested with tier + previousSeedId
 */
export async function evolutionCycleHandler({
  event,
  step,
}: {
  event: {
    data: {
      seedId: string;
      projectId: string;
      codeSummary: string;
      failureReport?: unknown;
      lineageRootId?: string;
    };
  };
  step: {
    run: <T>(name: string, callback: () => Promise<T>) => Promise<T>;
    sendEvent: (stepId: string, event: { name: string; data: Record<string, unknown> }) => Promise<void>;
  };
}): Promise<{ status: string; reason?: string; nextSeedId?: string; signal?: string }> {
  const { seedId, projectId, codeSummary } = event.data;
  const { db, gateway, budgetLimitCents = 10000 } = getEvolutionDeps();

  // --- Pre-cycle: Budget check ---
  // Runs before any evaluation to halt early if budget is exhausted (D-18)
  try {
    await step.run('budget-check', async () => {
      await checkLineageBudget(db, seedId, budgetLimitCents);
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      await step.run('emit-budget-halt', async () => {
        await appendEvent(db, {
          projectId,
          seedId,
          type: 'evolution_halted',
          payload: { reason: 'budget_exceeded' },
        });
      });
      await step.sendEvent('trigger-holdout-unseal-budget', {
        name: 'evolution_converged',
        data: { seedId, projectId, vaultId: '', codeSummary },
      });
      return { status: 'halted', reason: 'budget_exceeded' };
    }
    throw err;
  }

  // --- FSM: evaluating state — load seed ---
  const seed = await step.run('load-seed', async () => {
    const [row] = await db.select().from(seeds).where(eq(seeds.id, seedId));
    return row as Seed;
  });

  // --- FSM: evaluating state — compute goal attainment score ---
  const goalResult: GoalAttainmentResult = await step.run('evaluate-goal-attainment', async () => {
    return evaluateGoalAttainment({
      gateway,
      seed,
      codeSummary,
      projectId,
      evolutionCycle: (seed as Seed & { generation: number }).generation ?? 0,
      seedId,
    });
  });

  // --- FSM: converged terminal state — score >= SUCCESS_THRESHOLD ---
  if (goalResult.overallScore >= SUCCESS_THRESHOLD) {
    await step.run('emit-goal-met', async () => {
      await appendEvent(db, {
        projectId,
        seedId,
        type: 'evolution_goal_met',
        payload: { score: goalResult.overallScore },
      });
    });
    await step.sendEvent('trigger-holdout-unseal-goal-met', {
      name: 'evolution_converged',
      data: { seedId, projectId, vaultId: '', codeSummary },
    });
    return { status: 'converged', reason: 'goal_met' };
  }

  // --- FSM: scoring state — check convergence signals ---
  const convergenceResult = await step.run('check-convergence', async () => {
    return checkConvergence({
      db,
      seedId,
      currentGeneration: (seed as Seed & { generation: number }).generation ?? 0,
      currentScore: goalResult.overallScore,
      currentGaps: goalResult.gapAnalysis,
    });
  });

  if (convergenceResult.halt && convergenceResult.signal) {
    const signal = convergenceResult.signal;
    await step.run('emit-convergence-halt', async () => {
      await appendEvent(db, {
        projectId,
        seedId,
        type: 'evolution_halted',
        payload: { signal: signal.type, detail: signal.detail },
      });
    });
    await step.sendEvent('trigger-holdout-unseal-convergence', {
      name: 'evolution_converged',
      data: { seedId, projectId, vaultId: '', codeSummary },
    });
    return { status: 'halted', signal: convergenceResult.signal.type };
  }

  // --- FSM: evolving / lateral_thinking state — check stagnation ---
  const lineage = await step.run('fetch-lineage', async () => {
    return getSeedLineage(db, seedId);
  });

  const stagnationSignal = checkStagnation(lineage);

  if (stagnationSignal.fired) {
    // --- FSM: lateral_thinking state ---
    await step.run('emit-lateral-thinking', async () => {
      await appendEvent(db, {
        projectId,
        seedId,
        type: 'evolution_lateral_thinking',
        payload: { detail: stagnationSignal.detail },
      });
    });

    const lateralResult = await runLateralThinking({
      step,
      gateway,
      seed,
      gapAnalysis: goalResult.gapAnalysis,
      projectId,
      seedId,
    });

    if (lateralResult === null) {
      // Lateral thinking failed — escalate to human (D-17)
      await step.run('emit-escalated', async () => {
        await appendEvent(db, {
          projectId,
          seedId,
          type: 'evolution_escalated',
          payload: { reason: 'lateral_thinking_exhausted' },
        });
      });
      await step.sendEvent('trigger-holdout-unseal-escalated', {
        name: 'evolution_converged',
        data: { seedId, projectId, vaultId: '', codeSummary },
      });
      return { status: 'halted', reason: 'escalated' };
    }

    // Lateral thinking succeeded — create evolved seed from proposal (always full tier)
    const lateralSeed = await step.run('create-lateral-seed', () =>
      mutateSeedFromProposal({
        db,
        seed,
        proposal: lateralResult,
        projectId,
        seedId,
        lastScore: goalResult.overallScore,
        lastGapAnalysis: goalResult.gapAnalysis,
      })
    );

    // Dispatch decomposition with tier='full' (lateral is always full regen)
    await step.sendEvent('trigger-decomposition-lateral', {
      name: 'bead.dispatch_requested',
      data: {
        seedId: lateralSeed.id,
        projectId,
        tier: 'full',
        // No previousSeedId for lateral full regen — clean slate
      },
    });

    return { status: 'cycle_complete', nextSeedId: lateralSeed.id };
  }

  // --- FSM: evolving state — normal path (no stagnation) ---
  const newSeed = await step.run('generate-evolved-seed', async () => {
    return mutateSeed({
      db,
      gateway,
      seed,
      goalResult,
      projectId,
      seedId,
    });
  });

  // --- FSM: decomposing state — dispatch decomposition of new seed ---
  // Per D-08/EVOL-04: ac_only tier passes previousSeedId so decomposition can skip completed beads
  // Per D-08: full tier does NOT pass previousSeedId (clean slate — all beads re-implemented)
  await step.sendEvent('trigger-decomposition', {
    name: 'bead.dispatch_requested',
    data: {
      seedId: newSeed.id,
      projectId,
      tier: goalResult.tier,
      ...(goalResult.tier === 'ac_only' ? { previousSeedId: seedId } : {}),
    },
  });

  return { status: 'cycle_complete', nextSeedId: newSeed.id };
}

/**
 * Inngest function wrapper for the evolution cycle handler.
 * Listens for 'evolution_started' events and runs the full FSM cycle.
 * The evolution_started event is emitted by the holdout convergence handler when tests fail.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- InngestFunction<any> avoids TS2883 from Inngest v4's deeply-nested generic chain; explicit annotation required for non-portable inferred type across package boundaries
export const handleEvolutionStarted: InngestFunction<any, any, any, any> = inngest.createFunction(
  { id: 'evolution/run-cycle', triggers: [{ event: 'evolution_started' }] },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ctx narrowing handled inside evolutionCycleHandler; SDK context type not exported
  (ctx) => evolutionCycleHandler(ctx as any)
);
