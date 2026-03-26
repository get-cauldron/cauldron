import { type InngestFunction } from 'inngest';
import { eq, and } from 'drizzle-orm';
import { appendEvent, beads, beadEdges } from '@cauldron/shared';
import type { DbClient } from '@cauldron/shared';
import { inngest } from '../holdout/events.js';
import { findReadyBeads, claimBead, completeBead } from './scheduler.js';
import type { BeadDispatchPayload, BeadCompletedPayload } from './types.js';

/**
 * Module-level dependencies for the scheduler event handlers.
 * Configured via configureSchedulerDeps() — must be called before Inngest handlers run.
 * Phase 6 will wire the real db during application startup.
 */
interface SchedulerDeps {
  db: DbClient;
}

let schedulerDeps: SchedulerDeps | null = null;

/**
 * Configure the database dependency used by the Inngest handlers.
 * Call this during application startup before Inngest begins serving functions.
 */
export function configureSchedulerDeps(deps: SchedulerDeps): void {
  schedulerDeps = deps;
}

function getSchedulerDeps(): SchedulerDeps {
  if (!schedulerDeps) {
    throw new Error(
      'Scheduler dependencies not configured. Call configureSchedulerDeps({ db }) before using DAG event handlers.'
    );
  }
  return schedulerDeps;
}

/**
 * The core bead dispatch handler — extracted for testability.
 * Tests call this directly with fake step objects instead of using Inngest's test harness.
 *
 * Implements the bead dispatch lifecycle per D-12, D-14, D-15:
 * Step 1 — check-upstream-waits: wait for all waits_for upstream beads to complete (fan-in)
 * Step 2 — check-conditional: if upstream failed, skip this bead (D-14)
 * Step 3 — claim-bead: atomically claim the bead (optimistic concurrency, D-16)
 * Step 4 — emit-dispatched: record the dispatch event
 *
 * Phase 6 will add the actual execution logic between claim and completion.
 */
export async function beadDispatchHandler({
  event,
  step,
}: {
  event: { data: BeadDispatchPayload };
  step: {
    run: <T>(name: string, callback: () => Promise<T>) => Promise<T>;
    waitForEvent: (id: string, opts: { event: string; match?: string; timeout: string }) => Promise<any>;
    sendEvent: (id: string, event: { name: string; data: any }) => Promise<void>;
  };
}): Promise<{ beadId: string; status: string }> {
  const { db } = getSchedulerDeps();
  const { beadId, seedId, projectId } = event.data;

  // Step 1: Fan-in synchronization — wait for all waits_for upstream beads (D-12, Research Pattern 2)
  const waitsForEdges = await step.run('check-upstream-waits', async () => {
    return db
      .select()
      .from(beadEdges)
      .where(
        and(
          eq(beadEdges.toBeadId, beadId),
          eq(beadEdges.edgeType, 'waits_for')
        )
      );
  });

  if (waitsForEdges.length > 0) {
    // Wait for all upstream waits_for beads to emit bead.completed events
    const results = await Promise.all(
      waitsForEdges.map(edge =>
        step.waitForEvent(`wait-for-bead-${edge.fromBeadId}`, {
          event: 'bead.completed',
          match: 'data.beadId',
          timeout: '2h',
        })
      )
    );

    const timedOut = results.some(r => r === null);
    if (timedOut) {
      await step.run('mark-timeout-failed', async () => {
        await completeBead(db, beadId, 'failed', projectId, seedId);
      });
      return { beadId, status: 'failed' };
    }
  }

  // Step 2: Check conditional_blocks — if upstream failed, skip this bead (D-14)
  const conditionalEdge = await step.run('check-conditional', async () => {
    const edges = await db
      .select()
      .from(beadEdges)
      .where(
        and(
          eq(beadEdges.toBeadId, beadId),
          eq(beadEdges.edgeType, 'conditional_blocks')
        )
      );

    if (edges.length === 0) return null;

    const [upstream] = await db
      .select()
      .from(beads)
      .where(eq(beads.id, edges[0]!.fromBeadId));

    return upstream ?? null;
  });

  if (conditionalEdge && conditionalEdge.status === 'failed') {
    await step.run('skip-conditional', async () => {
      await completeBead(db, beadId, 'failed', projectId, seedId);
      await appendEvent(db, {
        projectId,
        seedId,
        beadId,
        type: 'bead_skipped',
        payload: { reason: 'upstream_conditional_failed' },
      });
    });
    return { beadId, status: 'skipped' };
  }

  // Step 3: Atomically claim the bead
  const claimResult = await step.run('claim-bead', async () => {
    return claimBead(db, beadId, 'inngest-worker');
  });

  if (!claimResult.success) {
    // Another worker already claimed this bead
    return { beadId, status: 'already-claimed' };
  }

  // Step 4: Record dispatch event
  await step.run('emit-dispatched', async () => {
    await appendEvent(db, {
      projectId,
      seedId,
      beadId,
      type: 'bead_dispatched',
      payload: { beadId },
    });
  });

  // Phase 6 will add the actual LLM execution logic here
  return { beadId, status: 'dispatched' };
}

/**
 * Handler for bead completion events — finds newly-ready beads and dispatches them.
 * This is the fan-out part of the DAG execution loop (D-12).
 *
 * After each bead completes, we re-evaluate which beads are now unblocked
 * and fire dispatch events for each of them.
 */
export async function beadCompletionHandler({
  event,
  step,
}: {
  event: { data: BeadCompletedPayload };
  step: {
    run: <T>(name: string, callback: () => Promise<T>) => Promise<T>;
    sendEvent: (id: string, event: { name: string; data: any }) => Promise<void>;
  };
}): Promise<{ dispatched: string[] }> {
  const { db } = getSchedulerDeps();
  const { seedId, projectId } = event.data;

  // Find all beads that are now ready after this completion
  const readyBeads = await step.run('find-ready', async () => {
    return findReadyBeads(db, seedId);
  });

  // Dispatch each ready bead via Inngest event
  const dispatchedIds: string[] = [];
  for (const bead of readyBeads) {
    await step.sendEvent(`dispatch-bead-${bead.id}`, {
      name: 'bead.dispatch_requested',
      data: {
        beadId: bead.id,
        seedId,
        projectId,
        moleculeId: bead.moleculeId,
      } satisfies BeadDispatchPayload,
    });
    dispatchedIds.push(bead.id);
  }

  return { dispatched: dispatchedIds };
}

/**
 * Inngest function wrapper for bead dispatch.
 * Listens for 'bead.dispatch_requested' events and orchestrates the full dispatch lifecycle.
 * Per-project concurrency limit enforced via the concurrency config (D-15).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handleBeadDispatchRequested: InngestFunction<any, any, any, any> = inngest.createFunction(
  {
    id: 'dag/dispatch-bead',
    triggers: [{ event: 'bead.dispatch_requested' }],
    concurrency: {
      limit: 5, // default; overridden at runtime from project settings (D-15)
      scope: 'fn',
      key: 'event.data.projectId',
    },
    retries: 3,
  },
  (ctx) => beadDispatchHandler(ctx as any)
);

/**
 * Inngest function wrapper for bead completion.
 * Listens for 'bead.completed' events and dispatches newly-ready beads.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handleBeadCompleted: InngestFunction<any, any, any, any> = inngest.createFunction(
  {
    id: 'dag/on-bead-completed',
    triggers: [{ event: 'bead.completed' }],
  },
  (ctx) => beadCompletionHandler(ctx as any)
);
