import { eq, sql } from 'drizzle-orm';
import { seeds, interviews } from '@get-cauldron/shared';
import { appendEvent } from '@get-cauldron/shared';
import type { DbClient } from '@get-cauldron/shared';
import type { Seed } from '@get-cauldron/shared';
import type { SeedSummary } from './types.js';

/**
 * D-26: Application-level guard — thrown when attempting to mutate a crystallized seed.
 */
export class ImmutableSeedError extends Error {
  public readonly seedId: string;
  constructor(seedId: string) {
    super(`Seed ${seedId} is crystallized and cannot be mutated`);
    this.name = 'ImmutableSeedError';
    this.seedId = seedId;
  }
}

/**
 * D-25, SEED-01, SEED-02: Crystallize a seed from an interview transcript summary.
 * Seeds are immutable once crystallized — always INSERT, never UPDATE.
 * Fires seed_crystallized event via event store.
 */
export async function crystallizeSeed(
  db: DbClient,
  interviewId: string,
  projectId: string,
  summary: SeedSummary,
  ambiguityScore: number,
  parentSeedId?: string,
): Promise<Seed> {
  // Check if a crystallized seed already exists for this interview
  const existing = await db.select().from(seeds).where(eq(seeds.interviewId, interviewId));
  const crystallized = existing.find((s) => s.status === 'crystallized');
  if (crystallized) {
    throw new ImmutableSeedError(crystallized.id);
  }

  // Compute version: parent's version + 1, or 1 if no parent
  let version = 1;
  if (parentSeedId) {
    const [parent] = await db.select().from(seeds).where(eq(seeds.id, parentSeedId));
    if (parent) version = parent.version + 1;
  }

  // D-25: INSERT new seed as crystallized (never UPDATE, always INSERT)
  const [seed] = await db.insert(seeds).values({
    projectId,
    interviewId,
    parentId: parentSeedId ?? null,
    version,
    status: 'crystallized',
    goal: summary.goal,
    constraints: summary.constraints,
    acceptanceCriteria: summary.acceptanceCriteria,
    ontologySchema: summary.ontologySchema,
    evaluationPrinciples: summary.evaluationPrinciples,
    exitConditions: summary.exitConditions,
    ambiguityScore,
    crystallizedAt: new Date(),
  }).returning();

  // Update interview status to 'completed' and phase to 'crystallized'
  await db.update(interviews)
    .set({ status: 'completed', phase: 'crystallized', completedAt: new Date() })
    .where(eq(interviews.id, interviewId));

  // Append seed_crystallized event to event store
  await appendEvent(db, {
    projectId,
    seedId: seed!.id,
    type: 'seed_crystallized',
    payload: { interviewId, ambiguityScore, version, parentSeedId: parentSeedId ?? null },
  });

  return seed!;
}

/**
 * D-27, SEED-04: Get the full lineage of a seed via recursive CTE.
 * Returns all ancestor seeds ordered by version ASC (oldest first).
 */
export async function getSeedLineage(
  db: DbClient,
  seedId: string,
): Promise<Seed[]> {
  const result = await db.execute(sql`
    WITH RECURSIVE lineage AS (
      SELECT * FROM seeds WHERE id = ${seedId}::uuid
      UNION ALL
      SELECT s.* FROM seeds s INNER JOIN lineage l ON s.id = l.parent_id
    )
    SELECT * FROM lineage ORDER BY version ASC
  `);
  return result as unknown as Seed[];
}
