import type { LLMGateway } from '../gateway/gateway.js';
import type { DbClient, Seed } from '@get-cauldron/shared';
import type { Inngest } from 'inngest';
import { decomposeSeed } from './decomposer.js';
import { persistDecomposition, findReadyBeads } from './scheduler.js';
import { appendEvent } from '@get-cauldron/shared';
import type { DecompositionResult, BeadDispatchPayload } from './types.js';

/**
 * Options for the full decomposition pipeline entry point.
 */
export interface RunDecompositionOptions {
  db: DbClient;
  gateway: LLMGateway;
  inngest: Inngest;
  seed: Seed;
  projectId: string;
  maxRetries?: number;
  tokenBudget?: number;
}

/**
 * Result of the full decomposition pipeline run.
 */
export interface RunDecompositionResult {
  decomposition: DecompositionResult;
  moleculeDbIds: Map<string, string>;
  beadDbIds: Map<string, string>;
  dispatchedBeadIds: string[];
}

/**
 * Full decomposition pipeline: decompose seed -> persist to DB -> dispatch all ready beads.
 *
 * Implements D-12: immediately after decomposition, all beads with no blocking dependencies
 * are dispatched via Inngest 'bead.dispatch_requested' events so they begin executing in parallel.
 *
 * This is the single entry point Phase 6 calls after seed crystallization.
 *
 * Emits lifecycle events: decomposition_started, decomposition_completed, decomposition_failed.
 */
export async function runDecomposition(options: RunDecompositionOptions): Promise<RunDecompositionResult> {
  const { db, gateway, inngest, seed, projectId, maxRetries, tokenBudget } = options;

  // 1. Emit decomposition_started event
  await appendEvent(db, {
    projectId,
    seedId: seed.id,
    type: 'decomposition_started',
    payload: { seedId: seed.id },
  });

  try {
    // 2. Run two-pass LLM decomposition with validation and retry loop
    const decomposition = await decomposeSeed({
      gateway,
      seed,
      projectId,
      maxRetries,
      tokenBudget,
    });

    // 3. Persist molecules, beads, and edges to database
    const { moleculeDbIds, beadDbIds } = await persistDecomposition(db, seed.id, decomposition);

    // 4. Emit decomposition_completed event with counts for observability
    await appendEvent(db, {
      projectId,
      seedId: seed.id,
      type: 'decomposition_completed',
      payload: {
        moleculeCount: decomposition.molecules.length,
        beadCount: decomposition.beads.length,
      },
    });

    // 5. Find all immediately ready beads (no blocking dependencies) per D-12
    const readyBeads = await findReadyBeads(db, seed.id);

    // 6. Dispatch all ready beads via Inngest events for parallel execution
    const dispatchedBeadIds: string[] = [];
    for (const bead of readyBeads) {
      const payload: BeadDispatchPayload = {
        beadId: bead.id,
        seedId: seed.id,
        projectId,
        moleculeId: bead.moleculeId,
      };
      await inngest.send({ name: 'bead.dispatch_requested', data: payload });
      dispatchedBeadIds.push(bead.id);
    }

    return { decomposition, moleculeDbIds, beadDbIds, dispatchedBeadIds };
  } catch (error) {
    // Emit decomposition_failed event on any error so the event log captures the failure
    await appendEvent(db, {
      projectId,
      seedId: seed.id,
      type: 'decomposition_failed',
      payload: { error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}
