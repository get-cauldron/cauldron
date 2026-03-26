/**
 * inject-cli-renamer-seed.ts
 *
 * Injects a pre-generated crystallized seed for the CLI renamer project into the
 * development database. Used to validate the downstream pipeline (holdout -> decompose
 * -> execute) without depending on interview convergence (D-07, Track 2).
 *
 * Usage: pnpm exec tsx scripts/inject-cli-renamer-seed.ts
 * Output: { "projectId": "...", "seedId": "..." }
 */

import 'dotenv/config';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { config as dotenvConfig } from 'dotenv';

// Load ~/.env as fallback (same pattern as bootstrap.ts)
dotenvConfig({ path: resolve(homedir(), '.env') });

import { db } from '@cauldron/shared';
import { projects, seeds } from '@cauldron/shared';

async function main(): Promise<void> {
  // Step 1: Insert a project row for CLI Renamer
  const [project] = await db
    .insert(projects)
    .values({
      name: 'CLI Renamer',
      description: 'Bulk file renaming CLI tool',
      settings: {},
    })
    .returning();

  if (!project) {
    throw new Error('Failed to insert project row');
  }

  const projectId = project.id;

  // Step 2: Insert a pre-crystallized seed
  const [seed] = await db
    .insert(seeds)
    .values({
      projectId,
      interviewId: null,
      parentId: null,
      version: 1,
      status: 'crystallized',
      goal: 'Build a CLI file renamer tool that recursively renames files by replacing a pattern string in filenames with a replacement string within a target directory.',
      constraints: [
        'TypeScript implementation',
        'No external LLM dependencies',
        'Unix/macOS target platform',
        'Dry-run mode must be supported (preview changes without applying)',
      ],
      acceptanceCriteria: [
        'CLI accepts --dir, --find, --replace, --dry-run flags',
        'Recursively walks target directory',
        'Renames all files matching --find pattern in filename to --replace',
        'Dry-run mode lists changes without applying them',
        'Handles edge cases: no matches found, permission errors, name collisions',
      ],
      ontologySchema: {
        entities: [
          {
            name: 'File',
            attributes: ['path', 'name', 'extension'],
            relations: [],
          },
          {
            name: 'RenamePlan',
            attributes: ['from', 'to', 'dry'],
            relations: [{ to: 'File', type: 'targets' }],
          },
        ],
      },
      evaluationPrinciples: [
        'Correctness: renames exactly the files matched by the pattern, no others',
        'Safety: dry-run must never write to disk',
        'Clarity: output is human-readable',
      ],
      exitConditions: {
        allTestsPass: true,
        dryRunVerified: true,
      },
      ambiguityScore: 0.05,
      crystallizedAt: new Date(),
    })
    .returning();

  if (!seed) {
    throw new Error('Failed to insert seed row');
  }

  const seedId = seed.id;

  // Output as JSON for downstream pipeline commands to capture
  console.log(JSON.stringify({ projectId, seedId }, null, 2));
}

main().catch((err) => {
  console.error('Injection failed:', err);
  process.exit(1);
});
