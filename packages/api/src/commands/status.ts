import chalk from 'chalk';
import type { CLIClient } from '../trpc-client.js';
import { createTable, colorStatus, formatJson } from '../output.js';

interface Flags {
  json: boolean;
  projectId?: string;
}

/**
 * Status command — shows running and queued beads for a project (D-04).
 *
 * Uses tRPC client exclusively via execution.getProjectDAG query.
 * No direct DB imports.
 *
 * Usage: cauldron status --project <id> [--logs] [--json]
 */
export async function statusCommand(
  client: CLIClient,
  args: string[],
  flags: Flags
): Promise<void> {
  const projectId = flags.projectId;
  const showLogs = args.includes('--logs');

  if (!projectId) {
    console.error(chalk.red('Error: --project <id> is required (or set CAULDRON_PROJECT_ID)'));
    process.exit(1);
    return;
  }

  // Query DAG via tRPC
  const dag = await client.execution.getProjectDAG.query({ projectId });

  if (dag.beads.length === 0) {
    console.log(chalk.gray('No beads found for this project. Run: cauldron decompose'));
    return;
  }

  if (flags.json) {
    console.log(formatJson(dag));
    return;
  }

  // Calculate duration
  const now = Date.now();
  function formatDuration(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
  }

  // Render bead table
  const table = createTable(['Title', 'Status', 'Agent', 'Duration']);
  for (const bead of dag.beads) {
    let duration = '-';
    const completedAt = bead.completedAt ? new Date(bead.completedAt).getTime() : null;
    const claimedAt = bead.claimedAt ? new Date(bead.claimedAt).getTime() : null;

    if (completedAt && claimedAt) {
      duration = formatDuration(completedAt - claimedAt);
    } else if (claimedAt) {
      duration = formatDuration(now - claimedAt) + ' (running)';
    }

    table.push([
      chalk.white(bead.title ?? 'Untitled'),
      colorStatus(bead.status ?? 'pending'),
      chalk.gray(bead.agentAssignment ?? '-'),
      chalk.gray(duration),
    ]);
  }
  console.log(table.toString());

  // Summary line
  const counts = {
    completed: dag.beads.filter(b => b.status === 'completed').length,
    active: dag.beads.filter(b => b.status === 'active' || b.status === 'claimed').length,
    pending: dag.beads.filter(b => b.status === 'pending').length,
    failed: dag.beads.filter(b => b.status === 'failed').length,
  };
  console.log(
    chalk.gray(`${counts.completed} completed, ${counts.active} active, ${counts.pending} pending, ${counts.failed} failed`)
  );

  // --logs flag: show bead events
  if (showLogs && dag.beads.length > 0) {
    console.log(chalk.cyan('\n--- Recent Events ---'));
    // Show events for the first few active/failed beads
    const interestingBeads = dag.beads
      .filter(b => b.status === 'active' || b.status === 'failed' || b.status === 'claimed')
      .slice(0, 3);

    for (const bead of interestingBeads) {
      const detail = await client.execution.getBeadDetail.query({ beadId: bead.id });
      console.log(chalk.cyan(`\nBead: ${bead.title ?? bead.id}`));
      for (const evt of detail.events.slice(-10)) {
        const ts = evt.occurredAt ? new Date(evt.occurredAt).toISOString() : 'unknown';
        const payloadSummary = evt.payload
          ? JSON.stringify(evt.payload).slice(0, 80)
          : '{}';
        console.log(chalk.gray(`  [${ts}] ${evt.type}: ${payloadSummary}`));
      }
    }
  }
}
