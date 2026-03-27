import chalk from 'chalk';
import type { CLIClient } from '../trpc-client.js';
import { createTable, colorStatus, formatJson } from '../output.js';

interface Flags {
  json: boolean;
  projectId?: string;
}

/**
 * Evolution command — shows seed lineage and evolution history (D-04).
 *
 * Usage: cauldron evolution [--project <id>] [--json]
 *
 * Requires --project <id> or CAULDRON_PROJECT_ID env var.
 */
export async function evolutionCommand(
  client: CLIClient,
  args: string[],
  flags: Flags
): Promise<void> {
  const projectId = flags.projectId;

  if (!projectId) {
    console.error(chalk.red('Error: --project <id> is required (or set CAULDRON_PROJECT_ID)'));
    process.exit(1);
  }

  const [lineage, history] = await Promise.all([
    client.evolution.getSeedLineage.query({ projectId }),
    client.evolution.getEvolutionHistory.query({ projectId }),
  ]);

  if (flags.json) {
    console.log(formatJson({ lineage, history }));
    return;
  }

  // Seed lineage table
  console.log(chalk.cyan('\nSeed Lineage'));

  if (lineage.length === 0) {
    console.log(chalk.gray('  No seeds found. Run: cauldron interview'));
  } else {
    const lineageTable = createTable(['Gen', 'Version', 'Goal', 'Status', 'Created']);
    for (const seed of lineage) {
      const goal = String(seed.goal ?? '').slice(0, 60) + (String(seed.goal ?? '').length > 60 ? '...' : '');
      const created = seed.createdAt
        ? new Date(seed.createdAt).toLocaleString()
        : 'Unknown';
      lineageTable.push([
        chalk.white(String(seed.generation ?? 0)),
        chalk.gray(`v${seed.version ?? 1}`),
        chalk.white(goal),
        colorStatus(seed.status ?? 'unknown'),
        chalk.gray(created),
      ]);
    }
    console.log(lineageTable.toString());
    console.log(chalk.gray(`\n${lineage.length} seed(s) in lineage`));
  }

  // Evolution event timeline
  console.log(chalk.cyan('\nEvolution History'));

  if (history.length === 0) {
    console.log(chalk.gray('  No evolution events yet.'));
  } else {
    const historyTable = createTable(['Time', 'Type', 'Summary']);
    for (const evt of history) {
      const time = evt.occurredAt
        ? new Date(evt.occurredAt).toLocaleString()
        : 'Unknown';
      const payload = evt.payload ? JSON.stringify(evt.payload).slice(0, 60) : '{}';
      historyTable.push([
        chalk.gray(time),
        chalk.cyan(evt.type),
        chalk.gray(payload),
      ]);
    }
    console.log(historyTable.toString());
  }
}
