import chalk from 'chalk';
import type { CLIClient } from '../trpc-client.js';
import { createSpinner, createTable, formatJson } from '../output.js';

interface Flags {
  json: boolean;
  projectId?: string;
}

/**
 * Seal command — reviews and seals holdout vault scenarios (D-04).
 *
 * Uses tRPC client exclusively via interview router procedures.
 *
 * Usage: cauldron seal --project <id> [--seed-id <id>] [--approve-all] [--json]
 */
export async function sealCommand(
  client: CLIClient,
  args: string[],
  flags: Flags
): Promise<void> {
  // Parse seed-id from args
  const seedIdIdx = args.indexOf('--seed-id');
  const seedId = seedIdIdx !== -1 ? args[seedIdIdx + 1] : undefined;
  const approveAll = args.includes('--approve-all');

  if (!seedId) {
    console.error(chalk.red('Error: --seed-id is required'));
    console.error('Usage: cauldron seal --seed-id <id> [--approve-all]');
    process.exit(1);
    return;
  }

  // Get holdout scenarios
  const spinner = createSpinner('Loading holdout scenarios...').start();
  let holdouts;
  try {
    holdouts = await client.interview.getHoldouts.query({ seedId });
    spinner.stop();
  } catch (err) {
    spinner.fail('Failed to load holdouts');
    throw err;
  }

  if (holdouts.scenarios.length === 0) {
    console.log(chalk.yellow('No holdout scenarios found for this seed.'));
    return;
  }

  if (flags.json) {
    console.log(formatJson(holdouts));
    return;
  }

  // Display scenarios
  console.log(chalk.cyan(`\nHoldout Scenarios (${holdouts.scenarios.length} total):`));
  const table = createTable(['#', 'ID', 'Description', 'Status']);
  holdouts.scenarios.forEach((s, i) => {
    const desc = String(s.description ?? '').slice(0, 60);
    table.push([
      chalk.gray(String(i + 1)),
      chalk.gray(String(s.id).slice(0, 8) + '...'),
      chalk.white(desc),
      chalk.yellow(String(s.status ?? 'pending_review')),
    ]);
  });
  console.log(table.toString());

  // Approve scenarios
  let toApprove = holdouts.scenarios;
  if (!approveAll) {
    // Interactive approval — for each scenario, prompt for approval
    const { createInterface } = await import('node:readline');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = (prompt: string): Promise<string> =>
      new Promise(resolve => rl.question(prompt, resolve));

    toApprove = [];
    for (const scenario of holdouts.scenarios) {
      const desc = String(scenario.description ?? '').slice(0, 80);
      const answer = await ask(chalk.cyan(`\nApprove scenario "${desc}"? [y/N] `));
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        toApprove.push(scenario);
      }
    }
    rl.close();
  }

  if (toApprove.length === 0) {
    console.log(chalk.yellow('No scenarios approved.'));
    process.exit(1);
    return;
  }

  // Approve each selected scenario
  console.log(chalk.cyan(`\nApproving ${toApprove.length} scenarios...`));
  for (const scenario of toApprove) {
    await client.interview.approveHoldout.mutate({ holdoutId: String(scenario.id) });
  }

  // Seal the vault
  const sealSpinner = createSpinner('Sealing holdout vault...').start();
  let sealResult;
  try {
    sealResult = await client.interview.sealHoldouts.mutate({ seedId });
    sealSpinner.succeed(`Vault sealed with ${sealResult.sealedCount} scenarios`);
  } catch (err) {
    sealSpinner.fail('Seal failed');
    throw err;
  }

  if (flags.json) {
    console.log(formatJson(sealResult));
    return;
  }

  console.log(chalk.green('Holdout vault sealed:'), chalk.cyan(sealResult.seedId));
  console.log(chalk.gray(`  Sealed: ${sealResult.sealedCount} scenarios`));
  console.log(chalk.gray('\nNext step:'));
  console.log(chalk.white(`  cauldron decompose --project ${flags.projectId ?? '<project-id>'}`));
}
