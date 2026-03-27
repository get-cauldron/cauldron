import chalk from 'chalk';
import type { CLIClient } from '../trpc-client.js';
import { createTable, formatJson } from '../output.js';

interface Flags {
  json: boolean;
  projectId?: string;
}

/**
 * Costs command — shows token usage and cost breakdown for a project (D-04).
 *
 * Usage: cauldron costs [--project <id>] [--json]
 *
 * Requires --project <id> or CAULDRON_PROJECT_ID env var.
 */
export async function costsCommand(
  client: CLIClient,
  args: string[],
  flags: Flags
): Promise<void> {
  const projectId = flags.projectId;

  if (!projectId) {
    console.error(chalk.red('Error: --project <id> is required (or set CAULDRON_PROJECT_ID)'));
    process.exit(1);
  }

  const [summary, byModel, byStage] = await Promise.all([
    client.costs.getProjectSummary.query({ projectId }),
    client.costs.getByModel.query({ projectId }),
    client.costs.getByStage.query({ projectId }),
  ]);

  if (flags.json) {
    console.log(formatJson({ summary, byModel, byStage }));
    return;
  }

  // Summary table
  console.log(chalk.cyan('\nProject Cost Summary'));
  const summaryTable = createTable(['Metric', 'Value']);
  summaryTable.push(
    [chalk.white('Total Cost'), chalk.yellow(`$${(Number(summary.totalCostCents) / 100).toFixed(4)}`)],
    [chalk.white('Total Tokens'), chalk.white(Number(summary.totalTokens).toLocaleString())],
    [chalk.white('Prompt Tokens'), chalk.gray(Number(summary.totalPromptTokens).toLocaleString())],
    [chalk.white('Completion Tokens'), chalk.gray(Number(summary.totalCompletionTokens).toLocaleString())],
    [chalk.white('API Calls'), chalk.white(Number(summary.callCount).toLocaleString())],
  );
  console.log(summaryTable.toString());

  // By model table
  if (byModel.length > 0) {
    console.log(chalk.cyan('\nCost by Model'));
    const modelTable = createTable(['Model', 'Cost', 'Tokens', 'Calls']);
    for (const row of byModel) {
      modelTable.push([
        chalk.white(row.model),
        chalk.yellow(`$${(Number(row.totalCostCents) / 100).toFixed(4)}`),
        chalk.gray(Number(row.totalTokens).toLocaleString()),
        chalk.gray(String(Number(row.callCount))),
      ]);
    }
    console.log(modelTable.toString());
  }

  // By stage table
  if (byStage.length > 0) {
    console.log(chalk.cyan('\nCost by Stage'));
    const stageTable = createTable(['Stage', 'Cost', 'Tokens', 'Calls']);
    for (const row of byStage) {
      stageTable.push([
        chalk.white(row.stage ?? 'unknown'),
        chalk.yellow(`$${(Number(row.totalCostCents) / 100).toFixed(4)}`),
        chalk.gray(Number(row.totalTokens).toLocaleString()),
        chalk.gray(String(Number(row.callCount))),
      ]);
    }
    console.log(stageTable.toString());
  }
}
