import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { seeds, holdoutVault } from '@cauldron/shared';
import { generateHoldoutScenarios, createVault, approveScenarios, sealVault } from '@cauldron/engine';
import { writeHoldoutDraft, readHoldoutDraft } from '../review/holdout-writer.js';
import { bootstrap } from '../bootstrap.js';

/**
 * Seal command — seals holdout vault scenarios for a project.
 *
 * Usage:
 *   cauldron seal --seed-id <id> [--project-root <path>] [--generate]
 *
 * Two modes:
 *   --generate: Generates holdout scenarios from the seed and writes draft for review.
 *   (no flag): Reads the draft, approves marked scenarios, and seals the vault.
 */
export async function sealCommand(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      'seed-id': { type: 'string' },
      'project-root': { type: 'string' },
      'generate': { type: 'boolean', default: false },
    },
    strict: false,
  });

  const seedId = values['seed-id'] as string | undefined;
  const projectRoot = (values['project-root'] as string | undefined) ?? process.cwd();
  const generate = values['generate'] as boolean | undefined ?? false;

  if (!seedId) {
    console.error('Error: --seed-id is required');
    process.exit(1);
    return;
  }

  const deps = await bootstrap(projectRoot);

  // Check if draft file exists
  const draftPath = join(projectRoot, '.cauldron', 'review', `holdout-draft-${seedId}.json`);
  const draftExists = existsSync(draftPath);

  if (generate || !draftExists) {
    // Generate mode: create scenarios, persist vault, write draft for review
    const seedRows = await deps.db
      .select()
      .from(seeds)
      .where(eq(seeds.id, seedId))
      .limit(1);

    const seed = seedRows[0];
    if (!seed) {
      console.error(`Error: Seed ${seedId} not found`);
      process.exit(1);
      return;
    }

    const projectId = seed.projectId;
    const scenarios = await generateHoldoutScenarios({
      gateway: deps.gateway,
      seed,
      projectId,
    });

    await createVault(deps.db, { seedId, scenarios });
    const filePath = await writeHoldoutDraft(projectRoot, seedId, scenarios);

    console.log(`Holdout draft written to ${filePath}. Review scenarios, then re-run without --generate to seal.`);
    process.exit(0);
    return;
  }

  // Seal mode: read draft, approve, seal vault
  const draft = await readHoldoutDraft(projectRoot, seedId);
  const approvedScenarios = draft.filter(s => s.approved);

  if (approvedScenarios.length === 0) {
    console.error('No scenarios approved. Edit the draft file.');
    process.exit(1);
    return;
  }

  // Find vault ID from DB
  const vaultRows = await deps.db
    .select()
    .from(holdoutVault)
    .where(eq(holdoutVault.seedId, seedId))
    .limit(1);

  const vault = vaultRows[0];
  if (!vault) {
    console.error(`Error: No holdout vault found for seed ${seedId}. Run with --generate first.`);
    process.exit(1);
    return;
  }

  const vaultId = vault.id;
  const approvedIds = approvedScenarios.map(s => s.id);

  // Skip approval if vault is already approved (idempotent re-run)
  if (vault.status !== 'approved') {
    await approveScenarios(deps.db, { vaultId, approvedIds });
  }

  // Find the projectId from the seed
  const seedRows = await deps.db
    .select()
    .from(seeds)
    .where(eq(seeds.id, seedId))
    .limit(1);

  const seed = seedRows[0];
  if (!seed) {
    console.error(`Error: Seed ${seedId} not found`);
    process.exit(1);
    return;
  }

  await sealVault(deps.db, { vaultId, projectId: seed.projectId });

  const approvedCount = approvedIds.length;
  console.log(`Vault sealed with ${approvedCount} holdout scenarios.`);
  process.exit(0);
}
