import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { beads, seeds, appendEvent } from '@cauldron/shared';
import { bootstrap } from '../bootstrap.js';

/**
 * Resolve command — manually resolves a stalled or failed bead after merge conflict.
 *
 * Usage:
 *   cauldron resolve <beadId> [--project-root <path>]
 *
 * Expects the user to have edited the conflict file at:
 *   {projectRoot}/.cauldron/review/conflict-{beadId}.diff
 */
export async function resolveCommand(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(3),
    allowPositionals: true,
    options: {
      'project-root': { type: 'string' },
    },
    strict: false,
  });

  const beadId = positionals[0];
  const projectRoot = (values['project-root'] as string | undefined) ?? process.cwd();

  if (!beadId) {
    console.error('Error: beadId is required as first positional argument');
    process.exit(1);
    return;
  }

  const conflictFilePath = join(projectRoot, '.cauldron', 'review', `conflict-${beadId}.diff`);

  if (!existsSync(conflictFilePath)) {
    console.error(`No conflict file found for bead ${beadId}`);
    process.exit(1);
    return;
  }

  const deps = await bootstrap(projectRoot);

  // Load the bead to get projectId and seedId
  const beadRows = await deps.db
    .select()
    .from(beads)
    .where(eq(beads.id, beadId))
    .limit(1);

  const bead = beadRows[0];
  if (!bead) {
    console.error(`Error: Bead ${beadId} not found`);
    process.exit(1);
    return;
  }

  const seedId = bead.seedId;

  // Lookup projectId via seed (beads don't store projectId directly)
  const seedRows = await deps.db
    .select({ projectId: seeds.projectId })
    .from(seeds)
    .where(eq(seeds.id, seedId))
    .limit(1);

  const projectId = seedRows[0]?.projectId;
  if (!projectId) {
    console.error(`Error: Could not resolve projectId for bead ${beadId}`);
    process.exit(1);
    return;
  }

  // Update bead status from 'failed' back to 'pending' so it can be re-dispatched
  await deps.db
    .update(beads)
    .set({ status: 'pending' })
    .where(eq(beads.id, beadId));

  // Append conflict_resolved event
  await appendEvent(deps.db, {
    projectId,
    seedId,
    beadId,
    type: 'conflict_resolved',
    payload: { beadId },
  });

  console.log(`Conflict resolved for bead ${beadId}. Merge will be retried.`);
  process.exit(0);
}
