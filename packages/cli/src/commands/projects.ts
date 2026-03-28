import chalk from 'chalk';
import type { CLIClient } from '../trpc-client.js';
import { createTable, colorStatus, formatJson } from '../output.js';

interface Flags {
  json: boolean;
  projectId?: string;
}

/**
 * Projects command — manages Cauldron projects (D-04).
 *
 * Subcommands: list, create <name>, archive <id>
 * Usage:
 *   cauldron projects list [--json]
 *   cauldron projects create <name> [--json]
 *   cauldron projects archive <id> [--json]
 */
export async function projectsCommand(
  client: CLIClient,
  args: string[],
  flags: Flags
): Promise<void> {
  const subcommand = args[0];

  if (!subcommand || subcommand === 'list') {
    await listProjects(client, flags);
  } else if (subcommand === 'create') {
    const name = args[1];
    if (!name) {
      console.error(chalk.red('Error: project name is required'));
      console.error('Usage: cauldron projects create <name>');
      process.exit(1);
    }
    await createProject(client, name, flags);
  } else if (subcommand === 'archive') {
    const id = args[1];
    if (!id) {
      console.error(chalk.red('Error: project ID is required'));
      console.error('Usage: cauldron projects archive <id>');
      process.exit(1);
    }
    await archiveProject(client, id, flags);
  } else if (subcommand === 'delete') {
    const id = args[1];
    if (!id) {
      console.error(chalk.red('Error: project ID is required'));
      console.error('Usage: cauldron projects delete <id>');
      process.exit(1);
    }
    await deleteProject(client, id, flags);
  } else {
    console.error(chalk.red(`Unknown subcommand: ${subcommand}`));
    console.error('Usage: cauldron projects [list|create|archive|delete]');
    process.exit(1);
  }
}

async function listProjects(client: CLIClient, flags: Flags): Promise<void> {
  const projects = await client.projects.list.query();

  if (flags.json) {
    console.log(formatJson(projects));
    return;
  }

  if (projects.length === 0) {
    console.log(chalk.gray('No projects found. Create one with: cauldron projects create <name>'));
    return;
  }

  const table = createTable(['Name', 'ID', 'Last Activity', 'Cost']);
  for (const p of projects) {
    const lastActivity = p.lastActivity
      ? new Date(p.lastActivity).toLocaleString()
      : 'Never';
    const cost = `$${(p.totalCostCents / 100).toFixed(2)}`;
    const status = p.lastEventType ?? 'new';
    table.push([
      chalk.white(p.name),
      chalk.gray(p.id.slice(0, 8) + '...'),
      chalk.gray(lastActivity),
      chalk.yellow(cost),
    ]);
    void status; // suppress unused var (colorStatus shown in future if needed)
  }

  console.log(table.toString());
  console.log(chalk.gray(`\n${projects.length} project(s)`));
}

async function createProject(client: CLIClient, name: string, flags: Flags): Promise<void> {
  const project = await client.projects.create.mutate({ name });

  if (flags.json) {
    console.log(formatJson(project));
    return;
  }

  console.log(chalk.green('Created project:'), chalk.cyan(project.id));
  console.log(chalk.gray(`  Name: ${project.name}`));
  console.log(chalk.gray(`  Use: cauldron interview --project ${project.id}`));
}

async function archiveProject(client: CLIClient, id: string, flags: Flags): Promise<void> {
  const result = await client.projects.archive.mutate({ id });

  if (flags.json) {
    console.log(formatJson(result));
    return;
  }

  console.log(chalk.green('Archived project:'), chalk.gray(id));
}

async function deleteProject(client: CLIClient, id: string, flags: Flags): Promise<void> {
  const result = await client.projects.delete.mutate({ id });

  if (flags.json) {
    console.log(formatJson(result));
    return;
  }

  console.log(chalk.green('Deleted project:'), chalk.gray(id));
}
