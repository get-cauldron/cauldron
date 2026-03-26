import { parseArgs } from 'node:util';
import { healthCheck } from './health.js';
import { statusCommand } from './commands/status.js';
import { interviewCommand } from './commands/interview.js';
import { crystallizeCommand } from './commands/crystallize.js';
import { decomposeCommand } from './commands/decompose.js';
import { executeCommand } from './commands/execute.js';
import { killCommand } from './commands/kill.js';
import { sealCommand } from './commands/seal.js';
import { resolveCommand } from './commands/resolve.js';

const COMMANDS = [
  'health',
  'status',
  'interview',
  'crystallize',
  'decompose',
  'execute',
  'kill',
  'seal',
  'resolve',
] as const;

type Command = (typeof COMMANDS)[number];

function printUsage(): void {
  console.log(`
Cauldron CLI — AI-powered software development platform

Usage: cauldron <command> [options]

Commands:
  health       Check that all required services (PostgreSQL, Inngest) are reachable
  status       Show running and queued beads for a project
  interview    Start a Socratic interview session
  crystallize  Finalize a seed spec from a completed interview
  decompose    Run two-pass LLM decomposition on a crystallized seed
  execute      Dispatch a decomposed DAG for parallel bead execution
  kill         Stop a running pipeline for a project
  seal         Seal holdout vault scenarios for a project
  resolve      Manually resolve a stalled or failed bead
`);
}

async function main(): Promise<void> {
  const { positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {},
    strict: false,
  });

  const command = positionals[0] as Command | undefined;

  if (!command || !COMMANDS.includes(command as Command)) {
    if (command) {
      console.error(`Unknown command: ${command}`);
    }
    printUsage();
    process.exit(1);
  }

  // All commands except 'health' run healthCheck first
  if (command !== 'health') {
    await healthCheck();
  }

  switch (command) {
    case 'health':
      await healthCheck();
      break;
    case 'status':
      await statusCommand();
      break;
    case 'interview':
      await interviewCommand();
      break;
    case 'crystallize':
      await crystallizeCommand();
      break;
    case 'decompose':
      await decomposeCommand();
      break;
    case 'execute':
      await executeCommand();
      break;
    case 'kill':
      await killCommand();
      break;
    case 'seal':
      await sealCommand();
      break;
    case 'resolve':
      await resolveCommand();
      break;
  }
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
