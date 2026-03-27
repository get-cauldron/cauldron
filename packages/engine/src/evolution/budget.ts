import { sql, inArray } from 'drizzle-orm';
import type { DbClient } from '@get-cauldron/shared';
import { llmUsage } from '@get-cauldron/shared';
import { BudgetExceededError } from '../gateway/errors.js';
import { getSeedLineage } from '../interview/crystallizer.js';

/**
 * Check cumulative LLM cost across the full seed lineage (D-18).
 * Uses getSeedLineage to collect all ancestor seed IDs,
 * then aggregates llm_usage.costCents where seed_id IN lineage IDs.
 * Throws BudgetExceededError if total >= limitCents.
 */
export async function checkLineageBudget(
  db: DbClient,
  seedId: string,
  limitCents: number,
): Promise<void> {
  const lineage = await getSeedLineage(db, seedId);
  const lineageIds = lineage.map((s) => s.id);

  if (lineageIds.length === 0) {
    return; // No lineage = no cost
  }

  const [result] = await db
    .select({ total: sql<number>`COALESCE(SUM(${llmUsage.costCents}), 0)` })
    .from(llmUsage)
    .where(inArray(llmUsage.seedId, lineageIds));

  const currentCents = result?.total ?? 0;
  if (currentCents >= limitCents) {
    throw new BudgetExceededError(seedId, limitCents, currentCents);
  }
}
