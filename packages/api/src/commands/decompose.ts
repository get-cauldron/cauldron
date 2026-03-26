import { parseArgs } from 'node:util';
import { desc, eq } from 'drizzle-orm';
import { seeds } from '@cauldron/shared';
import { runDecomposition } from '@cauldron/engine';
import { bootstrap } from '../bootstrap.js';

/**
 * Decompose command — runs two-pass LLM decomposition on a crystallized seed.
 *
 * Usage:
 *   cauldron decompose --project-id <id> [--seed-id <id>] [--project-root <path>]
 *
 * If --seed-id is not provided, uses the most recent crystallized seed for the project.
 */
export async function decomposeCommand(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      'project-id': { type: 'string' },
      'seed-id': { type: 'string' },
      'project-root': { type: 'string' },
    },
    strict: false,
  });

  const projectId = values['project-id'] as string | undefined;
  const seedId = values['seed-id'] as string | undefined;
  const projectRoot = (values['project-root'] as string | undefined) ?? process.cwd();

  if (!projectId) {
    console.error('Error: --project-id is required');
    process.exit(1);
    return;
  }

  const deps = await bootstrap(projectRoot);

  // Find seed: by id or most recent crystallized for the project
  let seed;
  if (seedId) {
    const rows = await deps.db
      .select()
      .from(seeds)
      .where(eq(seeds.id, seedId))
      .limit(1);
    seed = rows[0];
  } else {
    const rows = await deps.db
      .select()
      .from(seeds)
      .where(eq(seeds.projectId, projectId))
      .orderBy(desc(seeds.createdAt))
      .limit(1);
    seed = rows[0];
  }

  if (!seed) {
    console.error(`Error: No crystallized seed found for project ${projectId}`);
    process.exit(1);
    return;
  }

  if (seed.status !== 'crystallized') {
    console.error(`Error: Seed ${seed.id} is not crystallized (status: ${seed.status})`);
    process.exit(1);
    return;
  }

  const result = await runDecomposition({
    db: deps.db,
    gateway: deps.gateway,
    inngest: deps.inngest,
    seed,
    projectId,
    tokenBudget: 180_000,
  });

  const count = result.dispatchedBeadIds.length;
  console.log(`Decomposed into ${count} beads. Run: pnpm exec tsx packages/api/src/cli.ts execute --project-id ${projectId}`);
  process.exit(0);
}
