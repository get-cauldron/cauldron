import chalk from 'chalk';
import type { CLIClient } from '../trpc-client.js';
import { createSpinner } from '../output.js';
import { interviewCommand } from './interview.js';
import { crystallizeCommand } from './crystallize.js';
import { sealCommand } from './seal.js';
import { decomposeCommand } from './decompose.js';
import { executeCommand } from './execute.js';

interface Flags {
  json: boolean;
  projectId?: string;
}

/**
 * Run command — convenience pipeline: interview→crystallize→seal→decompose→execute (D-05).
 *
 * Runs all pipeline stages sequentially with progress spinners.
 * Each stage reuses the individual command functions to avoid logic duplication.
 *
 * Usage: cauldron run --project <id> [--skip-seal] [--json]
 */
export async function runCommand(
  client: CLIClient,
  args: string[],
  flags: Flags
): Promise<void> {
  const skipSeal = args.includes('--skip-seal');
  const projectId = flags.projectId;

  if (!projectId) {
    console.error(chalk.red('Error: --project <id> is required (or set CAULDRON_PROJECT_ID)'));
    process.exit(1);
  }

  console.log(chalk.cyan('\nCauldron Pipeline Run'));
  console.log(chalk.gray('Running: interview → crystallize → seal → decompose → execute'));
  console.log(chalk.gray(`Project: ${projectId}\n`));

  const stages = [
    {
      name: 'Interview',
      run: async () => {
        const spinner = createSpinner('Running interview...').start();
        try {
          await interviewCommand(client, args, flags);
          spinner.succeed('Interview complete');
        } catch (err) {
          spinner.fail('Interview failed');
          throw err;
        }
      },
    },
    {
      name: 'Crystallize',
      run: async () => {
        const spinner = createSpinner('Crystallizing seed...').start();
        try {
          await crystallizeCommand(client, args, flags);
          spinner.succeed('Seed crystallized');
        } catch (err) {
          spinner.fail('Crystallize failed');
          throw err;
        }
      },
    },
    ...(skipSeal
      ? []
      : [
          {
            name: 'Seal',
            run: async () => {
              const spinner = createSpinner('Sealing holdouts...').start();
              try {
                await sealCommand(client, args, flags);
                spinner.succeed('Holdouts sealed');
              } catch (err) {
                spinner.fail('Seal failed');
                throw err;
              }
            },
          },
        ]),
    {
      name: 'Decompose',
      run: async () => {
        const spinner = createSpinner('Triggering decomposition...').start();
        try {
          await decomposeCommand(client, args, flags);
          spinner.succeed('Decomposition triggered');
        } catch (err) {
          spinner.fail('Decompose failed');
          throw err;
        }
      },
    },
    {
      name: 'Execute',
      run: async () => {
        const spinner = createSpinner('Triggering execution...').start();
        try {
          await executeCommand(client, args, flags);
          spinner.succeed('Execution triggered');
        } catch (err) {
          spinner.fail('Execute failed');
          throw err;
        }
      },
    },
  ];

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]!;
    console.log(chalk.cyan(`\n[${i + 1}/${stages.length}] ${stage.name}`));
    try {
      await stage.run();
    } catch (err) {
      console.error(chalk.red(`\nPipeline stopped at stage: ${stage.name}`));
      console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }

  console.log(chalk.green('\nPipeline complete! All stages succeeded.'));
  console.log(chalk.gray(`Monitor status with: cauldron status --project ${projectId}`));
}
