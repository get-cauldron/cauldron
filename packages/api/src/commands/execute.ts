import { parseArgs } from 'node:util';
import { desc, eq, and } from 'drizzle-orm';
import { seeds, beads } from '@cauldron/shared';
import {
  findReadyBeads,
  handleBeadDispatchRequested,
  handleBeadCompleted,
  handleMergeRequested,
  handleEvolutionConverged,
} from '@cauldron/engine';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serve as inngestServe } from 'inngest/hono';
import { captureEngineSnapshot, detectEngineChange } from '../self-build.js';
import { bootstrap } from '../bootstrap.js';

/**
 * Execute command — dispatches a decomposed DAG for parallel bead execution.
 *
 * Usage:
 *   cauldron execute --project-id <id> [--seed-id <id>] [--project-root <path>] [--resume]
 *
 * Starts an Inngest HTTP server on port 3001 and dispatches all ready beads.
 * --resume: re-dispatches beads that are in 'failed' or 'pending' state.
 */
export async function executeCommand(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      'project-id': { type: 'string' },
      'seed-id': { type: 'string' },
      'project-root': { type: 'string' },
      'resume': { type: 'boolean', default: false },
    },
    strict: false,
  });

  const projectId = values['project-id'] as string | undefined;
  const seedId = values['seed-id'] as string | undefined;
  const projectRoot = (values['project-root'] as string | undefined) ?? process.cwd();
  const resume = values['resume'] as boolean | undefined ?? false;

  if (!projectId) {
    console.error('Error: --project-id is required');
    process.exit(1);
    return;
  }

  const deps = await bootstrap(projectRoot);

  // Capture engine snapshot if running in self-build mode (D-12, D-15)
  let engineSnapshot: string | null = null;
  if (deps.config.selfBuild === true) {
    engineSnapshot = captureEngineSnapshot(projectRoot);
    console.log(`Self-build mode: engine snapshot captured (${engineSnapshot.slice(0, 8)}...)`);
  }

  // Find seed: by id or most recent crystallized for the project
  let resolvedSeedId: string;
  if (seedId) {
    resolvedSeedId = seedId;
  } else {
    const rows = await deps.db
      .select({ id: seeds.id })
      .from(seeds)
      .where(eq(seeds.projectId, projectId))
      .orderBy(desc(seeds.createdAt))
      .limit(1);

    const seed = rows[0];
    if (!seed) {
      console.error(`Error: No crystallized seed found for project ${projectId}`);
      process.exit(1);
      return;
    }
    resolvedSeedId = seed.id;
  }

  // --resume: reset failed beads back to pending so they can be re-dispatched
  if (resume) {
    await deps.db
      .update(beads)
      .set({ status: 'pending' })
      .where(
        and(
          eq(beads.seedId, resolvedSeedId),
          eq(beads.status, 'failed')
        )
      );
  }

  // Find all ready beads for dispatch
  const readyBeads = await findReadyBeads(deps.db, resolvedSeedId);

  // Collect all Inngest functions from engine
  const functions = [
    handleBeadDispatchRequested,
    handleBeadCompleted,
    handleMergeRequested,
    handleEvolutionConverged,
  ];

  // Start Hono server with Inngest handler
  const app = new Hono();
  app.on(['GET', 'PUT', 'POST'], '/api/inngest', inngestServe({ client: deps.inngest, functions }));
  serve({ fetch: app.fetch, port: 3001 });
  console.log('Inngest handler listening on http://localhost:3001/api/inngest');

  // Dispatch ready beads
  for (const bead of readyBeads) {
    await deps.inngest.send({
      name: 'bead.dispatch_requested',
      data: {
        beadId: bead.id,
        seedId: resolvedSeedId,
        projectId,
      },
    });
  }

  const count = readyBeads.length;
  console.log(`Dispatched ${count} beads. Listening for Inngest events... (Ctrl-C to stop)`);

  // Self-build: register SIGINT handler to warn if engine changed during run (D-12)
  if (engineSnapshot && deps.config.selfBuild === true) {
    const snapshot = engineSnapshot;
    process.on('SIGINT', () => {
      if (detectEngineChange(snapshot, projectRoot)) {
        console.warn('WARNING: Engine changed during self-build run. Restart the execute command to use the new engine code.');
      }
      process.exit(0);
    });
  }

  // Keep process alive (Hono server keeps it alive naturally)
}
