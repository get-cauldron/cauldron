import chalk from 'chalk';
import type { CLIClient } from '../trpc-client.js';
import { createSpinner, formatJson } from '../output.js';

interface Flags {
  json: boolean;
  projectId?: string;
}

/**
 * Execute command — triggers async bead execution for a decomposed DAG (D-04).
 *
 * Uses tRPC client exclusively via execution.triggerExecution mutation.
 * No engine-direct calls — Inngest handles the actual dispatch.
 *
 * Usage: cauldron execute --project <id> [--seed-id <id>] [--json]
 */
export async function executeCommand(
  client: CLIClient,
  args: string[],
  flags: Flags
): Promise<void> {
  const projectId = flags.projectId;

  // Parse seed-id from args
  const seedIdIdx = args.indexOf('--seed-id');
  const seedId = seedIdIdx !== -1 ? args[seedIdIdx + 1] : undefined;

  if (!projectId) {
    console.error(chalk.red('Error: --project <id> is required (or set CAULDRON_PROJECT_ID)'));
    process.exit(1);
    return;
  }

  // If no seedId, get the latest from the DAG query
  let resolvedSeedId: string;
  if (seedId) {
    resolvedSeedId = seedId;
  } else {
    const dagSpinner = createSpinner('Finding latest seed...').start();
    let dag;
    try {
      dag = await client.execution.getProjectDAG.query({ projectId });
      dagSpinner.stop();
    } catch (err) {
      dagSpinner.fail('Failed to find seed');
      throw err;
    }

    if (!dag.seedId) {
      console.error(chalk.red('Error: No seed found for this project'));
      console.error(chalk.gray('Run: cauldron decompose --project ' + projectId));
      process.exit(1);
      return;
    }
    resolvedSeedId = dag.seedId;
  }

  // Trigger execution via tRPC mutation
  const spinner = createSpinner('Triggering execution...').start();
  let result;
  try {
    result = await client.execution.triggerExecution.mutate({
      projectId,
      seedId: resolvedSeedId,
    });
    spinner.succeed('Execution triggered');
  } catch (err) {
    spinner.fail('Execution trigger failed');
    throw err;
  }

  if (flags.json) {
    console.log(formatJson(result));
    return;
  }

  console.log(chalk.green(result.message));
  console.log(chalk.gray('\nExecution is running asynchronously via Inngest.'));
  console.log(chalk.gray('Monitor progress with:'), chalk.white(`cauldron status --project ${projectId}`));
}
