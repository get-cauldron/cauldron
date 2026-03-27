import { parseArgs } from 'node:util';
import chalk from 'chalk';
import type { CLIClient } from '../trpc-client.js';
import { generateApiKey, writeEnvVar, saveCLIConfig, loadCLIConfig } from '../config-io.js';
import { formatJson } from '../output.js';

interface Flags {
  json: boolean;
  projectId?: string;
}

/**
 * Webhook command — sets up GitHub push webhook for a project (D-10).
 *
 * Subcommand: cauldron webhook setup <project-id> [--repo <url>] [--json]
 *
 * Generates a webhook secret, writes GITHUB_WEBHOOK_SECRET to .env,
 * and prints GitHub configuration instructions.
 */
export async function webhookCommand(
  client: CLIClient,
  args: string[],
  flags: Flags
): Promise<void> {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      repo: { type: 'string' },
      json: { type: 'boolean', default: false },
    },
    strict: false,
  });

  const subcommand = positionals[0];

  if (subcommand !== 'setup') {
    console.log(chalk.white('Usage: cauldron webhook setup <project-id> [--repo <github-url>]'));
    console.log('');
    console.log(chalk.cyan('Subcommands:'));
    console.log('  setup <project-id>   Configure GitHub push webhook for a project');
    console.log('');
    console.log(chalk.cyan('Options:'));
    console.log('  --repo <url>   GitHub repo URL to associate with the project');
    console.log('  --json         Output machine-readable JSON');
    process.exit(1);
    return;
  }

  const projectId = positionals[1] ?? flags.projectId;
  if (!projectId) {
    console.error(chalk.red('Error: project-id is required'));
    console.error(chalk.gray('Usage: cauldron webhook setup <project-id>'));
    process.exit(1);
    return;
  }

  const repoUrl = values['repo'] as string | undefined;
  const useJson = (values['json'] as boolean | undefined) ?? flags.json;

  // 1. Verify project exists
  const project = await client.projects.byId.query({ id: projectId });

  // 2. Generate webhook secret
  const secret = generateApiKey();

  // 3. Write GITHUB_WEBHOOK_SECRET to .env
  const projectRoot = process.cwd();
  await writeEnvVar(projectRoot, 'GITHUB_WEBHOOK_SECRET', secret);

  // 4. Save webhookSecret to cauldron.config.ts for reference
  const existingConfig = await loadCLIConfig(projectRoot);
  await saveCLIConfig(projectRoot, { ...existingConfig, webhookSecret: secret });

  // 5. Optionally set repoUrl on the project
  if (repoUrl) {
    await client.projects.updateSettings.mutate({ id: projectId, settings: { repoUrl } });
  }

  // 6. Determine server URL for webhook endpoint
  const serverUrl = existingConfig.serverUrl ?? 'http://localhost:3000';
  const webhookUrl = `${serverUrl}/api/webhook/git`;

  if (useJson) {
    console.log(formatJson({ url: webhookUrl, secret, projectId: project.id }));
    return;
  }

  // 7. Print setup instructions
  const repoPath = repoUrl
    ? repoUrl.replace('https://github.com/', '').replace('.git', '')
    : '<owner>/<repo>';

  console.log('');
  console.log(chalk.green('Webhook configured!'));
  console.log('');
  console.log(chalk.white('URL:    ') + chalk.hex('#00d4aa')(webhookUrl));
  console.log(chalk.white('Secret: ') + chalk.hex('#00d4aa')(secret));
  console.log('');
  console.log(chalk.cyan('Add this webhook in GitHub:'));
  console.log(chalk.gray(`  1. Go to https://github.com/${repoPath}/settings/hooks`));
  console.log(chalk.gray(`  2. Payload URL: ${webhookUrl}`));
  console.log(chalk.gray('  3. Content type: application/json'));
  console.log(chalk.gray(`  4. Secret: ${secret}`));
  console.log(chalk.gray('  5. Events: Just the push event'));
  console.log('');
  console.log(chalk.gray(`The secret has been saved to .env (GITHUB_WEBHOOK_SECRET).`));
  console.log(chalk.gray('Restart the web server to pick up the new secret.'));
}
