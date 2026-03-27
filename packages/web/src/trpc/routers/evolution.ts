import { z } from 'zod';
import { router, publicProcedure } from '../init.js';
import { seeds, events, llmUsage, eventTypeEnum } from '@get-cauldron/shared';
import { eq, desc, asc, and, inArray, sql } from 'drizzle-orm';

export const evolutionRouter = router({
  // Get seed lineage for a project: ordered list of seeds with parent references
  getSeedLineage: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const seedRows = await ctx.db.select({
        id: seeds.id,
        parentId: seeds.parentId,
        version: seeds.version,
        generation: seeds.generation,
        goal: seeds.goal,
        acceptanceCriteria: seeds.acceptanceCriteria,
        ontologySchema: seeds.ontologySchema,
        ambiguityScore: seeds.ambiguityScore,
        status: seeds.status,
        evolutionContext: seeds.evolutionContext,
        createdAt: seeds.createdAt,
        crystallizedAt: seeds.crystallizedAt,
      }).from(seeds)
        .where(eq(seeds.projectId, input.projectId))
        .orderBy(asc(seeds.generation));
      return seedRows;
    }),

  // Get evolution events for a project: convergence signals, lateral thinking activations, escalations
  getEvolutionHistory: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const evolutionEventTypes: (typeof eventTypeEnum.enumValues)[number][] = [
        'evolution_started',
        'evolution_converged',
        'evolution_lateral_thinking',
        'evolution_escalated',
        'evolution_halted',
        'evolution_goal_met',
      ];
      const eventRows = await ctx.db.select().from(events)
        .where(and(
          eq(events.projectId, input.projectId),
          inArray(events.type, evolutionEventTypes)
        ))
        .orderBy(asc(events.occurredAt));
      return eventRows;
    }),

  // Get convergence signals for a specific seed/generation
  getConvergenceForSeed: publicProcedure
    .input(z.object({ seedId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Find evolution events referencing this seed
      const convergeEventTypes: (typeof eventTypeEnum.enumValues)[number][] = [
        'evolution_converged',
        'evolution_halted',
        'evolution_goal_met',
      ];

      const convergeEvents = await ctx.db.select().from(events)
        .where(and(
          eq(events.seedId, input.seedId),
          inArray(events.type, convergeEventTypes)
        ))
        .orderBy(desc(events.occurredAt))
        .limit(1);

      // Find lateral thinking events for this seed
      const lateralEvents = await ctx.db.select().from(events)
        .where(and(
          eq(events.seedId, input.seedId),
          eq(events.type, 'evolution_lateral_thinking')
        ))
        .orderBy(asc(events.occurredAt));

      // Get per-cycle cost for this seed
      const [costRow] = await ctx.db.select({
        totalCost: sql<number>`COALESCE(SUM(${llmUsage.costCents}), 0)`,
        totalTokens: sql<number>`COALESCE(SUM(${llmUsage.totalTokens}), 0)`,
      }).from(llmUsage)
        .where(eq(llmUsage.seedId, input.seedId));

      return {
        convergenceEvent: convergeEvents[0] ?? null,
        lateralThinkingEvents: lateralEvents,
        costCents: costRow?.totalCost ?? 0,
        totalTokens: costRow?.totalTokens ?? 0,
      };
    }),
});
