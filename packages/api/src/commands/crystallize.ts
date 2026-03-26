import { parseArgs } from 'node:util';
import { eq, desc } from 'drizzle-orm';
import { bootstrap } from '../bootstrap.js';
import { readSeedDraft } from '../review/seed-writer.js';
import { InterviewFSM } from '@cauldron/engine';
import { interviews } from '@cauldron/shared';

/**
 * Crystallize command — finalizes a seed spec from a reviewed seed draft (D-16).
 *
 * Reads the seed draft JSON file (written by interview command), looks up the
 * most recent interview in 'reviewing' state, and calls approveAndCrystallize
 * to produce an immutable seed record.
 *
 * Usage: cauldron crystallize --project-id <id> [--project-root <path>]
 */
export async function crystallizeCommand(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(3), // skip 'node', 'cli.ts', 'crystallize'
    options: {
      'project-id': { type: 'string' },
      'project-root': { type: 'string' },
    },
    allowPositionals: false,
    strict: false,
  });

  const projectId = values['project-id'] as string | undefined;
  const projectRoot = (values['project-root'] as string | undefined) ?? process.cwd();

  if (!projectId) {
    console.error('Error: --project-id is required');
    console.error('Usage: cauldron crystallize --project-id <id> [--project-root <path>]');
    process.exit(1);
  }

  // Bootstrap all engine dependencies
  const deps = await bootstrap(projectRoot);

  // Read the seed draft file (edited by human after interview)
  let summary: Awaited<ReturnType<typeof readSeedDraft>>;
  try {
    summary = await readSeedDraft(projectRoot, projectId);
  } catch {
    console.error(
      `No seed draft found for project ${projectId}. Run /cauldron:interview first.`,
    );
    process.exit(1);
    return;
  }

  // Find the most recent interview in reviewing state
  const interviewRows = await deps.db
    .select()
    .from(interviews)
    .where(eq(interviews.projectId, projectId))
    .orderBy(desc(interviews.createdAt))
    .limit(1);

  const interview = interviewRows.find((i) => i.phase === 'reviewing') ?? null;

  if (!interview) {
    console.error(
      `No interview in reviewing state for project ${projectId}. Run /cauldron:interview first.`,
    );
    process.exit(1);
  }

  // Create FSM and crystallize the seed
  const fsm = new InterviewFSM(deps.db, deps.gateway, deps.config, deps.logger);
  const seed = await fsm.approveAndCrystallize(interview.id, projectId, summary);

  console.log(`Seed crystallized: ${seed.id}`);

  process.exit(0);
}
