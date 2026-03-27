import chalk from 'chalk';
import type { CLIClient } from '../trpc-client.js';
import { createSpinner, formatJson } from '../output.js';

interface Flags {
  json: boolean;
  projectId?: string;
}

/**
 * Crystallize command — finalizes a seed spec from a completed interview (D-16).
 *
 * Uses tRPC client exclusively — calls interview.getSummary then approveSummary.
 *
 * Usage: cauldron crystallize --project <id> [--json]
 */
export async function crystallizeCommand(
  client: CLIClient,
  args: string[],
  flags: Flags
): Promise<{ seedId: string } | undefined> {
  const projectId = flags.projectId;

  if (!projectId) {
    console.error(chalk.red('Error: --project <id> is required (or set CAULDRON_PROJECT_ID)'));
    process.exit(1);
    return;
  }

  // Get current summary
  const spinner = createSpinner('Loading seed summary...').start();
  let summaryResult;
  try {
    summaryResult = await client.interview.getSummary.query({ projectId });
    spinner.stop();
  } catch (err) {
    spinner.fail('Failed to load summary');
    throw err;
  }

  if (summaryResult.phase !== 'reviewing') {
    console.error(chalk.red(`Error: Interview is in "${summaryResult.phase}" phase, not "reviewing"`));
    console.error(chalk.gray('Run: cauldron interview --project ' + projectId));
    process.exit(1);
    return;
  }

  if (!summaryResult.summary) {
    console.error(chalk.red('Error: No summary found. Complete the interview first.'));
    process.exit(1);
    return;
  }

  // Approve and crystallize
  const crystallizeSpinner = createSpinner('Crystallizing seed...').start();
  let result;
  try {
    result = await client.interview.approveSummary.mutate({
      projectId,
      summary: summaryResult.summary,
    });
    crystallizeSpinner.succeed('Seed crystallized');
  } catch (err) {
    crystallizeSpinner.fail('Crystallization failed');
    throw err;
  }

  if (flags.json) {
    console.log(formatJson(result));
    return { seedId: result.seedId };
  }

  console.log(chalk.green('Seed crystallized:'), chalk.cyan(result.seedId));
  console.log(chalk.gray(`  Version: ${result.version}`));
  console.log(chalk.gray('\nNext steps:'));
  console.log(chalk.white(`  cauldron seal --project ${projectId}`));
  console.log(chalk.white(`  cauldron decompose --project ${projectId}`));

  return { seedId: result.seedId };
}
