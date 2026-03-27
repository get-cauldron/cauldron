import chalk from 'chalk';
import type { CLIClient } from '../trpc-client.js';
import { createSpinner, formatJson } from '../output.js';

interface Flags {
  json: boolean;
  projectId?: string;
}

/**
 * Kill command — stops a running pipeline for a project (D-04).
 *
 * Uses tRPC client exclusively via execution.respondToEscalation mutation.
 * No direct DB imports.
 *
 * Usage: cauldron kill --project <id> [--bead-id <id>] [--json]
 */
export async function killCommand(
  client: CLIClient,
  args: string[],
  flags: Flags
): Promise<void> {
  const projectId = flags.projectId;

  // Parse optional bead-id from args
  const beadIdIdx = args.indexOf('--bead-id');
  const beadId = beadIdIdx !== -1 ? args[beadIdIdx + 1] : undefined;

  if (!projectId) {
    console.error(chalk.red('Error: --project <id> is required (or set CAULDRON_PROJECT_ID)'));
    process.exit(1);
    return;
  }

  const spinner = createSpinner('Killing pipeline...').start();
  let result;
  try {
    result = await client.execution.respondToEscalation.mutate({
      projectId,
      beadId,
      action: 'abort',
    });
    spinner.succeed('Pipeline killed');
  } catch (err) {
    spinner.fail('Kill failed');
    throw err;
  }

  if (flags.json) {
    console.log(formatJson(result));
    return;
  }

  console.log(chalk.green('Pipeline killed for project:'), chalk.gray(projectId));
  if (beadId) {
    console.log(chalk.gray(`  Bead: ${beadId}`));
  }
}
