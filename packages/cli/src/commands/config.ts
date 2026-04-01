import chalk from 'chalk';
import { z } from 'zod';
import type { CLIClient } from '../trpc-client.js';
import { formatJson } from '../output.js';

interface Flags {
  json: boolean;
  projectId?: string;
}

// Validation map for dot-notation keys
const ASSET_KEY_VALIDATORS: Record<string, z.ZodType> = {
  'asset.mode': z.enum(['active', 'paused', 'disabled']),
  'asset.runtimeUrl': z.string().url(),
  'asset.artifactsRoot': z.string().min(1),
  'asset.maxConcurrentJobs': z.coerce.number().int().positive(),
};

/**
 * Parse a dot-notation key (e.g. "asset.mode") and value into a nested settings object.
 * Only top-level "asset.*" keys are supported.
 */
function buildNestedSettings(
  key: string,
  parsedValue: unknown,
): Record<string, unknown> {
  const parts = key.split('.');
  if (parts.length === 2 && parts[0] === 'asset') {
    return {
      asset: { [parts[1]!]: parsedValue },
    };
  }
  // Flat key (non-asset settings)
  return { [key]: parsedValue };
}

async function configSet(
  client: CLIClient,
  key: string,
  value: string,
  flags: Flags,
): Promise<void> {
  const projectId = flags.projectId;
  if (!projectId) {
    console.error(chalk.red('Error: --project <id> is required for config set'));
    console.error('Usage: cauldron config set <key> <value> --project <id>');
    process.exit(1);
  }

  const validator = ASSET_KEY_VALIDATORS[key];
  if (!validator) {
    const validKeys = Object.keys(ASSET_KEY_VALIDATORS).join(', ');
    console.error(chalk.red(`Unknown config key: ${key}`));
    console.error(`Valid keys: ${validKeys}`);
    process.exit(1);
  }

  const parseResult = validator.safeParse(value);
  if (!parseResult.success) {
    const issues = parseResult.error.issues.map((i) => i.message).join('; ');
    console.error(chalk.red(`Invalid value for ${key}: ${issues}`));
    process.exit(1);
  }

  const nested = buildNestedSettings(key, parseResult.data);

  const updated = await client.projects.updateSettings.mutate({
    id: projectId,
    settings: nested as Parameters<typeof client.projects.updateSettings.mutate>[0]['settings'],
  });

  if (flags.json) {
    console.log(formatJson(updated));
    return;
  }

  console.log(chalk.green(`Set ${key} = ${JSON.stringify(parseResult.data)}`));
  console.log(chalk.gray(`Project: ${projectId}`));
}

async function configGet(client: CLIClient, flags: Flags): Promise<void> {
  const projectId = flags.projectId;
  if (!projectId) {
    console.error(chalk.red('Error: --project <id> is required for config get'));
    console.error('Usage: cauldron config get --project <id>');
    process.exit(1);
  }

  const project = await client.projects.byId.query({ id: projectId });

  if (flags.json) {
    console.log(formatJson(project.settings));
    return;
  }

  const settings = project.settings ?? {};
  const asset = (settings as { asset?: Record<string, unknown> }).asset ?? {};

  console.log(chalk.cyan('Asset settings:'));
  console.log(`  mode:              ${chalk.white(String(asset['mode'] ?? 'active (default)'))}`);
  console.log(`  runtimeUrl:        ${chalk.white(String(asset['runtimeUrl'] ?? '(not set)'))}`);
  console.log(`  artifactsRoot:     ${chalk.white(String(asset['artifactsRoot'] ?? '(not set)'))}`);
  console.log(`  maxConcurrentJobs: ${chalk.white(String(asset['maxConcurrentJobs'] ?? '(no limit)'))}`);
}

/**
 * CLI config command — get or set project configuration.
 *
 * Subcommands:
 *   set <key> <value> --project <id>   Set a config value
 *   get --project <id>                 Show all config values
 *
 * Supported keys:
 *   asset.mode              active | paused | disabled
 *   asset.runtimeUrl        URL of the local ComfyUI runtime
 *   asset.artifactsRoot     Path where generated artifacts are written
 *   asset.maxConcurrentJobs Positive integer limit on concurrent jobs
 *
 * Examples:
 *   cauldron config set asset.mode active --project <id>
 *   cauldron config set asset.maxConcurrentJobs 3 --project <id>
 *   cauldron config get --project <id>
 */
export async function configCommand(
  client: CLIClient,
  args: string[],
  flags: Flags,
): Promise<void> {
  const subcommand = args[0];

  if (subcommand === 'set') {
    const key = args[1];
    const value = args[2];
    if (!key || value === undefined) {
      console.error(chalk.red('Usage: cauldron config set <key> <value> --project <id>'));
      process.exit(1);
    }
    await configSet(client, key, value, flags);
  } else if (subcommand === 'get') {
    await configGet(client, flags);
  } else {
    console.error(chalk.red('Usage: cauldron config [set|get]'));
    console.error('');
    console.error('Subcommands:');
    console.error('  set <key> <value> --project <id>   Set a config value');
    console.error('  get --project <id>                 Show config values');
    process.exit(1);
  }
}
