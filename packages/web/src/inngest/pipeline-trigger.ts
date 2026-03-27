import { type InngestFunction } from 'inngest';
import { inngest } from './client.js';
import { db } from '@cauldron/shared';
import { beads, seeds, events } from '@cauldron/shared';
import { appendEvent } from '@cauldron/shared';
import { eq, desc } from 'drizzle-orm';

/**
 * Inngest function that handles pipeline trigger events from GitHub pushes.
 *
 * Per D-11: When a push arrives for a project mid-pipeline:
 * - If a pipeline is active, queue the trigger and wait for completion
 * - After pipeline completes, check if this commit was superseded by a newer push
 * - If superseded, skip (newer push will handle it)
 * - Otherwise, trigger the pipeline run
 *
 * Event: 'cauldron/pipeline.trigger'
 * Data: { projectId, commitSha, repo, branch, pusher }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const pipelineTriggerFunction: InngestFunction<any, any, any, any> = inngest.createFunction(
  {
    id: 'pipeline-trigger-handler',
    triggers: [{ event: 'cauldron/pipeline.trigger' }],
  },
  async ({ event, step }) => {
    const { projectId, commitSha, repo, branch, pusher } = event.data as {
      projectId: string;
      commitSha: string;
      repo: string;
      branch: string;
      pusher: string;
    };

    // Step 1: Check if a pipeline is currently active
    const status = await step.run('check-active-pipeline', async () => {
      const [latestSeed] = await db
        .select()
        .from(seeds)
        .where(eq(seeds.projectId, projectId))
        .orderBy(desc(seeds.createdAt))
        .limit(1);

      if (!latestSeed) return { active: false, seedId: null };

      const beadRows = await db
        .select()
        .from(beads)
        .where(eq(beads.seedId, latestSeed.id));

      const hasActive = beadRows.some(
        (b) => b.status === 'claimed' || b.status === 'pending'
      );

      return { active: hasActive, seedId: latestSeed.id };
    });

    if (status.active) {
      // Queue this trigger — mark it as queued in an event
      await step.run('queue-trigger', async () => {
        await appendEvent(db, {
          projectId,
          beadId: null,
          type: 'pipeline_trigger',
          payload: {
            status: 'queued',
            source: 'github_push',
            repo,
            branch,
            commitSha,
            pusher,
            reason: 'Pipeline active, queued behind current run',
          },
        });
      });

      // Wait for pipeline completion event (2-hour timeout)
      const completion = await step.waitForEvent('wait-for-completion', {
        event: 'cauldron/pipeline.completed',
        match: 'data.projectId',
        timeout: '2h',
      });

      // completion is null on timeout — still proceed to trigger
      if (!completion) {
        // Timeout — pipeline took >2h, trigger anyway
      }

      // After completion, check if this commit was superseded by a newer queued push
      const stillRelevant = await step.run('check-relevance', async () => {
        const recentTriggers = await db
          .select()
          .from(events)
          .where(eq(events.projectId, projectId))
          .orderBy(desc(events.occurredAt))
          .limit(10);

        // Look for a newer queued push that isn't this one
        const newerPush = recentTriggers.find(
          (e) =>
            e.type === 'pipeline_trigger' &&
            e.payload &&
            (e.payload as Record<string, unknown>)['commitSha'] !== commitSha &&
            (e.payload as Record<string, unknown>)['status'] === 'queued'
        );

        return !newerPush; // If there's a newer push, this one is superseded
      });

      if (!stillRelevant) {
        return { status: 'superseded', commitSha };
      }
    }

    // Trigger the pipeline run
    await step.run('trigger-pipeline', async () => {
      await appendEvent(db, {
        projectId,
        beadId: null,
        type: 'pipeline_trigger',
        payload: {
          status: 'triggered',
          source: 'github_push',
          repo,
          branch,
          commitSha,
          pusher,
        },
      });
    });

    // Find the latest seed for this project so we can dispatch bead execution
    const latestSeed = await step.run('find-latest-seed', async () => {
      const [seed] = await db
        .select()
        .from(seeds)
        .where(eq(seeds.projectId, projectId))
        .orderBy(desc(seeds.createdAt))
        .limit(1);
      return seed ?? null;
    });

    if (!latestSeed) {
      // No seed exists for this project — cannot dispatch execution.
      // Return a distinct status so callers are not misled into thinking execution started.
      return { status: 'no_seed', projectId };
    }

    // Dispatch bead execution to engine Inngest functions.
    // The engine's handleBeadDispatchRequested (and evolution bootstrap) picks up this event.
    await step.sendEvent('dispatch-bead-execution', {
      name: 'bead.dispatch_requested',
      data: {
        seedId: latestSeed.id,
        projectId,
      },
    });

    return { status: 'triggered', projectId, commitSha };
  }
);
