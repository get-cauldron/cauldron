import { eq, sql } from 'drizzle-orm';
import type { DbClient } from '@cauldron/shared';
import { llmUsage } from '@cauldron/shared';
import { BudgetExceededError } from './errors.js';

/**
 * Pre-call budget check: queries cumulative cost for the project and throws
 * BudgetExceededError if current spend meets or exceeds the limit.
 * Satisfies D-23: budget check must run before every LLM call.
 */
export async function checkBudget(
  db: DbClient,
  projectId: string,
  limitCents: number,
): Promise<void> {
  const [result] = await db
    .select({ total: sql<number>`COALESCE(SUM(${llmUsage.costCents}), 0)` })
    .from(llmUsage)
    .where(eq(llmUsage.projectId, projectId));

  const currentCents = result?.total ?? 0;
  if (currentCents >= limitCents) {
    throw new BudgetExceededError(projectId, limitCents, currentCents);
  }
}
