import chalk from 'chalk';
import type { CLIClient } from '../trpc-client.js';
import { createSpinner, formatJson } from '../output.js';

interface Flags {
  json: boolean;
  projectId?: string;
}

/**
 * Resolve command — manually resolves a stalled or failed bead (D-04).
 *
 * Uses tRPC client exclusively via execution.respondToEscalation mutation.
 * No direct DB imports.
 *
 * Usage: cauldron resolve <beadId> --project <id> [--action retry|skip|guidance] [--guidance <text>] [--json]
 */
export async function resolveCommand(
  client: CLIClient,
  args: string[],
  flags: Flags
): Promise<void> {
  const projectId = flags.projectId;

  // First positional arg is beadId
  const positionals = args.filter(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
  const beadId = positionals[0];

  // Parse action from args (default: retry)
  const actionIdx = args.indexOf('--action');
  const action = (actionIdx !== -1 ? args[actionIdx + 1] : 'retry') as 'retry' | 'skip' | 'guidance' | 'abort';

  // Parse guidance from args
  const guidanceIdx = args.indexOf('--guidance');
  const guidance = guidanceIdx !== -1 ? args[guidanceIdx + 1] : undefined;

  if (!beadId) {
    console.error(chalk.red('Error: beadId is required as first positional argument'));
    console.error('Usage: cauldron resolve <beadId> --project <id> [--action retry|skip|guidance]');
    process.exit(1);
    return;
  }

  if (!projectId) {
    console.error(chalk.red('Error: --project <id> is required (or set CAULDRON_PROJECT_ID)'));
    process.exit(1);
    return;
  }

  const validActions = ['retry', 'skip', 'guidance', 'abort'] as const;
  if (!validActions.includes(action)) {
    console.error(chalk.red(`Error: Invalid action "${action}". Must be one of: retry, skip, guidance, abort`));
    process.exit(1);
    return;
  }

  const spinner = createSpinner(`Resolving bead (action: ${action})...`).start();
  let result;
  try {
    result = await client.execution.respondToEscalation.mutate({
      projectId,
      beadId,
      action,
      guidance,
    });
    spinner.succeed('Bead resolved');
  } catch (err) {
    spinner.fail('Resolve failed');
    throw err;
  }

  if (flags.json) {
    console.log(formatJson(result));
    return;
  }

  console.log(chalk.green(`Resolved bead ${beadId} with action: ${action}`));
  if (action === 'retry') {
    console.log(chalk.gray('Bead will be re-dispatched on next execution cycle.'));
  }
}
