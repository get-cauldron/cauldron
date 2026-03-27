import { type InngestFunction } from 'inngest';
import { eq, and } from 'drizzle-orm';
import { appendEvent, beads, beadEdges, seeds as seedsTable } from '@get-cauldron/shared';
import type { DbClient } from '@get-cauldron/shared';
import { inngest } from '../holdout/events.js';
import { findReadyBeads, claimBead, completeBead } from './scheduler.js';
import type { BeadDispatchPayload, BeadCompletedPayload } from './types.js';
import { WorktreeManager } from '../execution/worktree-manager.js';
import { ContextAssembler } from '../execution/context-assembler.js';
import { AgentRunner } from '../execution/agent-runner.js';
import { MergeQueue, type MergeOutcome } from '../execution/merge-queue.js';
import { detectTestRunner } from '../execution/test-detector.js';
import { KnowledgeGraphAdapter } from '../intelligence/adapter.js';
import type { LLMGateway } from '../gateway/gateway.js';

/**
 * Module-level dependencies for the scheduler event handlers.
 * Configured via configureSchedulerDeps() — must be called before Inngest handlers run.
 * Phase 6 wires the real db, gateway, and projectRoot during application startup.
 */
interface SchedulerDeps {
  db: DbClient;
  gateway?: LLMGateway;
  projectRoot?: string; // target project root for worktree/git operations
}

let schedulerDeps: SchedulerDeps | null = null;

/**
 * Configure the database and execution dependencies used by the Inngest handlers.
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
 * Step 5 — create-worktree: isolated git worktree for this bead (EXEC-02)
 * Step 6 — assemble-context: knowledge graph + token budget (EXEC-01, EXEC-04, CODE-02)
 * Step 7 — execute-tdd-loop: TDD self-healing loop (EXEC-05, TEST-01 through TEST-06)
 * Step 8 — handle result: enqueue merge or mark failed
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

  // Step 3.5: Emit bead_claimed for live DAG active status (WEB-03)
  await step.run('emit-claimed', async () => {
    await appendEvent(db, {
      projectId,
      seedId,
      beadId,
      type: 'bead_claimed',
      payload: { beadId, agentId: 'inngest-worker' },
    });
  });

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

  // Phase 6: Full execution lifecycle
  const { gateway, projectRoot } = getSchedulerDeps();
  if (!gateway || !projectRoot) {
    // Graceful fallback: if execution deps not configured, return dispatched status (Phase 5 behavior)
    return { beadId, status: 'dispatched' };
  }

  // Load bead and seed from DB for context assembly
  const beadRecord = await step.run('load-bead', async () => {
    const [bead] = await db.select().from(beads).where(eq(beads.id, beadId));
    return bead ?? null;
  });
  if (!beadRecord) return { beadId, status: 'bead-not-found' };

  const seedRecord = await step.run('load-seed', async () => {
    const [seed] = await db.select().from(seedsTable).where(eq(seedsTable.id, seedId));
    return seed ?? null;
  });
  if (!seedRecord) return { beadId, status: 'seed-not-found' };

  // Step 5: Create git worktree for isolated execution (EXEC-02)
  const knowledgeGraph = new KnowledgeGraphAdapter(projectRoot);
  const worktreeManager = new WorktreeManager(projectRoot);
  const worktreeInfo = await step.run('create-worktree', async () => {
    return worktreeManager.createWorktree(beadId);
  });

  // Step 5b: Ensure knowledge graph is indexed before context assembly
  await step.run('index-knowledge-graph', async () => {
    await knowledgeGraph.indexRepository();
  });

  // Step 6: Assemble context (EXEC-01, EXEC-04, CODE-02)
  const contextAssembler = new ContextAssembler(knowledgeGraph, gateway);
  const agentContext = await step.run('assemble-context', async () => {
    return contextAssembler.assemble({
      bead: beadRecord,
      seed: seedRecord,
      projectId,
      projectRoot,
    });
  });

  // Step 7: TDD self-healing loop (EXEC-05, TEST-01 through TEST-06)
  const agentRunner = new AgentRunner(gateway, worktreeManager);
  const execResult = await step.run('execute-tdd-loop', async () => {
    return agentRunner.runWithTddLoop({
      agentContext,
      worktreePath: worktreeInfo.path,
      beadId,
      projectId,
      seedId,
      maxIterations: 5,
    });
  });

  // Step 8: Handle execution result
  if (execResult.success) {
    // Enqueue merge via event (processed by handleMergeRequested with serialized concurrency)
    await step.sendEvent('enqueue-merge', {
      name: 'bead.merge_requested',
      data: {
        beadId,
        seedId,
        projectId,
        branch: worktreeInfo.branch,
        worktreePath: worktreeInfo.path,
      },
    });

    // Mark bead as completed
    await step.run('complete-bead', async () => {
      await completeBead(db, beadId, 'completed', projectId, seedId);
    });

    // Emit bead.completed event for fan-out (triggers beadCompletionHandler)
    await step.sendEvent('emit-completed', {
      name: 'bead.completed',
      data: { beadId, seedId, projectId, status: 'completed' },
    });

    return { beadId, status: 'completed' };
  } else {
    // Mark bead as failed after max iterations exhausted
    await step.run('fail-bead', async () => {
      await completeBead(db, beadId, 'failed', projectId, seedId);
      await appendEvent(db, {
        projectId,
        seedId,
        beadId,
        type: 'bead_failed',
        payload: {
          iterations: execResult.iterations,
          finalErrors: execResult.finalErrors,
        },
      });
    });

    return { beadId, status: 'failed' };
  }
}

/**
 * Handler for bead completion events — finds newly-ready beads and dispatches them.
 * This is the fan-out part of the DAG execution loop (D-12).
 *
 * After each bead completes, we re-evaluate which beads are now unblocked
 * and fire dispatch events for each of them.
 *
 * Phase 6: Re-indexes the knowledge graph before finding ready beads (D-05, CODE-03)
 * so downstream beads see updated code from the completed bead's merge.
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

  // Re-index knowledge graph so downstream beads see updated code (D-05, CODE-03)
  // projectRoot is the single target project root (single-project-per-instance assumption)
  const { projectRoot: projRoot } = getSchedulerDeps();
  if (projRoot) {
    await step.run('reindex-knowledge-graph', async () => {
      const kg = new KnowledgeGraphAdapter(projRoot);
      await kg.indexRepository();
    });
  }

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
 * Handler for merge requests — processes a single bead merge with LLM conflict resolution.
 * Extracted for testability; Inngest wrapper is handleMergeRequested below.
 */
export async function mergeRequestedHandler({
  event,
  step,
}: {
  event: { data: { beadId: string; seedId: string; projectId: string; branch: string; worktreePath: string } };
  step: {
    run: <T>(name: string, callback: () => Promise<T>) => Promise<T>;
  };
}): Promise<MergeOutcome> {
  const { db, gateway, projectRoot } = getSchedulerDeps();
  const { beadId, seedId, projectId, branch, worktreePath } = event.data;

  if (!gateway || !projectRoot) {
    return { beadId, status: 'failed', error: 'Execution deps not configured' };
  }

  const worktreeManager = new WorktreeManager(projectRoot);
  const knowledgeGraph = new KnowledgeGraphAdapter(projectRoot);
  const mergeQueue = new MergeQueue(worktreeManager, knowledgeGraph, gateway, db, projectRoot);
  const testRunner = detectTestRunner(projectRoot);

  return step.run('process-merge', async () => {
    mergeQueue.enqueue({
      beadId,
      seedId,
      projectId,
      branch,
      worktreePath,
      topologicalOrder: 0, // single entry processing
    });
    const result = await mergeQueue.processNext(testRunner);
    return result ?? { beadId, status: 'failed' as const, error: 'No merge entry found' };
  });
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

/**
 * Inngest function for merge requests.
 * Serialized per project (concurrency limit 1, keyed by projectId) to prevent
 * concurrent merges from corrupting the main branch (D-15, Research Pitfall 4).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handleMergeRequested: InngestFunction<any, any, any, any> = inngest.createFunction(
  {
    id: 'execution/merge-bead',
    triggers: [{ event: 'bead.merge_requested' }],
    concurrency: {
      limit: 1, // Serialize merges per project (D-15, Research Pitfall 4)
      scope: 'fn',
      key: 'event.data.projectId',
    },
    retries: 2,
  },
  (ctx) => mergeRequestedHandler(ctx as any)
);
