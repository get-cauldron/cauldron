import { eq, desc, inArray } from 'drizzle-orm';
import { beads, events, seeds } from '@cauldron/shared';
import type { DbClient } from '@cauldron/shared';

export interface StatusDeps {
  db: DbClient;
}

/**
 * Status command — shows running and queued beads for a project.
 *
 * Usage: cauldron status [seedId] [--logs]
 *
 * If seedId is omitted, uses the most recent seed.
 * --logs flag tails recent events (last 20).
 */
export async function statusCommand(deps: StatusDeps, args: string[]): Promise<void> {
  const flags = args.filter(a => a.startsWith('--'));
  const positionals = args.filter(a => !a.startsWith('--'));

  const showLogs = flags.includes('--logs');
  let seedId = positionals[0];

  // If no seedId provided, use the most recent seed
  if (!seedId) {
    const recentSeeds = await deps.db
      .select({ id: seeds.id })
      .from(seeds)
      .orderBy(desc(seeds.createdAt))
      .limit(1);
    if (recentSeeds.length === 0) {
      console.log('No seeds found. Run: cauldron interview');
      return;
    }
    seedId = recentSeeds[0]!.id;
  }

  // Query beads for this seed
  const beadRows = await deps.db
    .select({
      id: beads.id,
      title: beads.title,
      status: beads.status,
      agent: beads.agentAssignment,
      claimedAt: beads.claimedAt,
      completedAt: beads.completedAt,
    })
    .from(beads)
    .where(eq(beads.seedId, seedId))
    .orderBy(beads.createdAt);

  // Query escalation events to detect NEEDS REVIEW status
  const escalationEvents = await deps.db
    .select({ beadId: events.beadId, type: events.type })
    .from(events)
    .where(eq(events.type, 'merge_escalation_needed'));

  const escalatedBeadIds = new Set(
    escalationEvents
      .map(e => e.beadId)
      .filter((id): id is string => id !== null)
  );

  // Build display rows with computed duration
  const now = Date.now();

  function formatDuration(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
  }

  const tableRows = beadRows.map(row => {
    let duration = '-';
    if (row.completedAt && row.claimedAt) {
      duration = formatDuration(row.completedAt.getTime() - row.claimedAt.getTime());
    } else if (row.claimedAt) {
      duration = formatDuration(now - row.claimedAt.getTime()) + ' (running)';
    }

    // Override status display if escalation event exists for this bead
    let displayStatus: string = row.status;
    if (row.id && escalatedBeadIds.has(row.id)) {
      displayStatus = 'NEEDS REVIEW';
    }

    return {
      Title: row.title,
      Status: displayStatus,
      Agent: row.agent ?? '-',
      Duration: duration,
    };
  });

  console.table(tableRows);

  // Summary line
  const counts = {
    completed: beadRows.filter(r => r.status === 'completed').length,
    active: beadRows.filter(r => r.status === 'active' || r.status === 'claimed').length,
    pending: beadRows.filter(r => r.status === 'pending').length,
    failed: beadRows.filter(r => r.status === 'failed').length,
  };
  console.log(
    `${counts.completed} completed, ${counts.active} active, ${counts.pending} pending, ${counts.failed} failed`
  );

  // --logs flag: tail last 20 events for this seed
  if (showLogs) {
    console.log('\n--- Recent Events ---');
    const recentEvents = await deps.db
      .select({
        occurredAt: events.occurredAt,
        type: events.type,
        payload: events.payload,
        beadId: events.beadId,
      })
      .from(events)
      .where(eq(events.seedId, seedId))
      .orderBy(desc(events.occurredAt))
      .limit(20);

    for (const evt of recentEvents) {
      const ts = evt.occurredAt?.toISOString() ?? 'unknown';
      const payloadSummary = evt.payload
        ? JSON.stringify(evt.payload).slice(0, 80)
        : '{}';
      const beadRef = evt.beadId ? ` [bead:${evt.beadId.slice(0, 8)}]` : '';
      console.log(`[${ts}] ${evt.type}${beadRef}: ${payloadSummary}`);
    }
  }
}
