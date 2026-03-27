import { parseArgs } from 'node:util';
import chalk from 'chalk';
import { loadCLIConfig, saveCLIConfig, generateApiKey } from './config-io.js';
import { isServerRunning, startDevServer } from './server-check.js';
import { createCLIClient } from './trpc-client.js';
import { createSpinner } from './output.js';
import type { CLIClient } from './trpc-client.js';

import { statusCommand } from './commands/status.js';
import { interviewCommand } from './commands/interview.js';
import { crystallizeCommand } from './commands/crystallize.js';
import { decomposeCommand } from './commands/decompose.js';
import { executeCommand } from './commands/execute.js';
import { killCommand } from './commands/kill.js';
import { sealCommand } from './commands/seal.js';
import { resolveCommand } from './commands/resolve.js';
import { projectsCommand } from './commands/projects.js';
import { costsCommand } from './commands/costs.js';
import { evolutionCommand } from './commands/evolution.js';
import { runCommand } from './commands/run.js';
import { webhookCommand } from './commands/webhook.js';

const COMMANDS = [
  'health',
  'projects',
  'interview',
  'crystallize',
  'seal',
  'decompose',
  'execute',
  'status',
  'logs',
  'costs',
  'evolution',
  'kill',
  'resolve',
  'run',
  'webhook',
] as const;

type Command = (typeof COMMANDS)[number];

function printUsage(): void {
  console.log(chalk.cyan(`
  ██████╗ █████╗ ██╗   ██╗██╗     ██████╗ ██████╗  ██████╗ ███╗   ██╗
 ██╔════╝██╔══██╗██║   ██║██║    ██╔══██╗██╔══██╗██╔═══██╗████╗  ██║
 ██║     ███████║██║   ██║██║    ██║  ██║██████╔╝██║   ██║██╔██╗ ██║
 ██║     ██╔══██║██║   ██║██║    ██║  ██║██╔══██╗██║   ██║██║╚██╗██║
 ╚██████╗██║  ██║╚██████╔╝███████╗██████╔╝██║  ██║╚██████╔╝██║ ╚████║
  ╚═════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝
`));
  console.log(chalk.white('AI-powered software development platform\n'));
  console.log(chalk.white('Usage: cauldron <command> [options]\n'));
  console.log(chalk.cyan('Pipeline commands:'));
  console.log('  interview      Start or resume a Socratic interview session');
  console.log('  crystallize    Finalize a seed spec from a completed interview');
  console.log('  seal           Review and seal holdout vault scenarios');
  console.log('  decompose      Trigger two-pass LLM decomposition on a crystallized seed');
  console.log('  execute        Dispatch a decomposed DAG for parallel bead execution');
  console.log('  run            Run the full pipeline: interview→crystallize→seal→decompose→execute');
  console.log('');
  console.log(chalk.cyan('Monitoring commands:'));
  console.log('  status         Show running and queued beads for a project');
  console.log('  costs          Show token usage and cost breakdown for a project');
  console.log('  evolution      Show seed lineage and evolution history');
  console.log('');
  console.log(chalk.cyan('Management commands:'));
  console.log('  projects       Manage projects (list, create, archive)');
  console.log('  kill           Stop a running pipeline for a project');
  console.log('  resolve        Manually resolve a stalled or failed bead');
  console.log('  health         Check server connectivity');
  console.log('');
  console.log(chalk.cyan('Options:'));
  console.log('  --json         Output machine-readable JSON');
  console.log('  --project <id> Project ID override (or use CAULDRON_PROJECT_ID env)');
}

async function bootstrapClient(projectRoot: string): Promise<CLIClient> {
  // 1. Load CLI config
  let config = await loadCLIConfig(projectRoot);

  // 2. If no apiKey, generate one and persist it
  if (!config.apiKey) {
    const newKey = generateApiKey();
    await saveCLIConfig(projectRoot, { ...config, apiKey: newKey });
    config = { ...config, apiKey: newKey };
    console.log(chalk.cyan('Generated new API key:'), newKey);
    console.log(chalk.gray('Key saved to .env as CAULDRON_API_KEY'));
  }

  // 3. Check if server is running; auto-start if not
  const running = await isServerRunning(config.serverUrl);
  if (!running) {
    const spinner = createSpinner('Starting dev server...').start();
    try {
      await startDevServer(projectRoot);
      spinner.succeed('Dev server started');
    } catch (err) {
      spinner.fail('Dev server failed to start');
      throw err;
    }
  }

  // 4. Create tRPC client
  return createCLIClient(config.serverUrl, config.apiKey);
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      json: { type: 'boolean', default: false },
      project: { type: 'string' },
    },
    strict: false,
  });

  const command = positionals[0] as Command | undefined;

  if (!command || !COMMANDS.includes(command as Command)) {
    if (command) {
      console.error(chalk.red(`Unknown command: ${command}`));
    }
    printUsage();
    process.exit(1);
  }

  const flags = {
    json: (values['json'] as boolean | undefined) ?? false,
    projectId: (values['project'] as string | undefined) ?? process.env['CAULDRON_PROJECT_ID'],
  };

  // Args to pass downstream (everything after the command name)
  const commandArgs = process.argv.slice(3);

  // Health command is special — no tRPC client needed
  if (command === 'health') {
    const config = await loadCLIConfig(process.cwd());
    const ok = await isServerRunning(config.serverUrl);
    if (ok) {
      console.log(chalk.green('Server is running at'), config.serverUrl);
    } else {
      console.log(chalk.red('Server is not running at'), config.serverUrl);
      process.exit(1);
    }
    return;
  }

  // Bootstrap tRPC client for all other commands
  const client = await bootstrapClient(process.cwd());

  switch (command) {
    case 'projects':
      await projectsCommand(client, commandArgs, flags);
      break;
    case 'interview':
      await interviewCommand(client, commandArgs, flags);
      break;
    case 'crystallize':
      await crystallizeCommand(client, commandArgs, flags);
      break;
    case 'seal':
      await sealCommand(client, commandArgs, flags);
      break;
    case 'decompose':
      await decomposeCommand(client, commandArgs, flags);
      break;
    case 'execute':
      await executeCommand(client, commandArgs, flags);
      break;
    case 'status':
      await statusCommand(client, commandArgs, flags);
      break;
    case 'logs':
      // logs is an alias for status --logs
      await statusCommand(client, [...commandArgs, '--logs'], flags);
      break;
    case 'costs':
      await costsCommand(client, commandArgs, flags);
      break;
    case 'evolution':
      await evolutionCommand(client, commandArgs, flags);
      break;
    case 'kill':
      await killCommand(client, commandArgs, flags);
      break;
    case 'resolve':
      await resolveCommand(client, commandArgs, flags);
      break;
    case 'run':
      await runCommand(client, commandArgs, flags);
      break;
    case 'webhook':
      await webhookCommand(client, commandArgs, flags);
      break;
  }
}

main().catch((err: unknown) => {
  console.error(chalk.red('Fatal error:'), err);
  process.exit(1);
});
