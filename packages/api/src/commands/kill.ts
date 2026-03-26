import { eq } from 'drizzle-orm';
import { beads, appendEvent } from '@cauldron/shared';
import type { DbClient } from '@cauldron/shared';

export interface KillDeps {
  db: DbClient;
  projectId: string;
}

/**
 * Kill command — marks a bead as failed and appends a bead_failed event.
 *
 * Usage: cauldron kill <beadId>
 */
export async function killCommand(deps: KillDeps, args: string[]): Promise<void> {
  const beadId = args[0];

  if (!beadId) {
    console.error('Usage: cauldron kill <beadId>');
    process.exit(1);
  }

  // Verify bead exists
  const existingBeads = await deps.db
    .select({ id: beads.id, seedId: beads.seedId, status: beads.status })
    .from(beads)
    .where(eq(beads.id, beadId));

  if (existingBeads.length === 0) {
    console.error(`Bead not found: ${beadId}`);
    process.exit(1);
  }

  // Update bead status to 'failed'
  await deps.db
    .update(beads)
    .set({ status: 'failed' })
    .where(eq(beads.id, beadId));

  // Append bead_failed event
  await appendEvent(deps.db, {
    projectId: deps.projectId,
    type: 'bead_failed',
    beadId,
    payload: { beadId, reason: 'manual_kill' },
  });

  console.log(`Killed bead: ${beadId}`);
}
