import { z } from 'zod';
import { router, publicProcedure } from '../init';
import { llmUsage, beads } from '@cauldron/shared';
import { eq, sql, desc, inArray } from 'drizzle-orm';

export const costsRouter = router({
  // Total project cost summary
  getProjectSummary: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [summary] = await ctx.db
        .select({
          totalCostCents: sql<number>`COALESCE(SUM(${llmUsage.costCents}), 0)`,
          totalPromptTokens: sql<number>`COALESCE(SUM(${llmUsage.promptTokens}), 0)`,
          totalCompletionTokens: sql<number>`COALESCE(SUM(${llmUsage.completionTokens}), 0)`,
          totalTokens: sql<number>`COALESCE(SUM(${llmUsage.totalTokens}), 0)`,
          callCount: sql<number>`COUNT(*)`,
        })
        .from(llmUsage)
        .where(eq(llmUsage.projectId, input.projectId));
      return summary ?? {
        totalCostCents: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        callCount: 0,
      };
    }),

  // Breakdown by model
  getByModel: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          model: llmUsage.model,
          totalCostCents: sql<number>`SUM(${llmUsage.costCents})`,
          totalTokens: sql<number>`SUM(${llmUsage.totalTokens})`,
          callCount: sql<number>`COUNT(*)`,
        })
        .from(llmUsage)
        .where(eq(llmUsage.projectId, input.projectId))
        .groupBy(llmUsage.model)
        .orderBy(desc(sql`SUM(${llmUsage.costCents})`));
      return rows;
    }),

  // Breakdown by pipeline stage
  getByStage: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          stage: llmUsage.stage,
          totalCostCents: sql<number>`SUM(${llmUsage.costCents})`,
          totalTokens: sql<number>`SUM(${llmUsage.totalTokens})`,
          callCount: sql<number>`COUNT(*)`,
        })
        .from(llmUsage)
        .where(eq(llmUsage.projectId, input.projectId))
        .groupBy(llmUsage.stage)
        .orderBy(desc(sql`SUM(${llmUsage.costCents})`));
      return rows;
    }),

  // Breakdown by evolution cycle
  getByCycle: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          evolutionCycle: llmUsage.evolutionCycle,
          totalCostCents: sql<number>`SUM(${llmUsage.costCents})`,
          totalTokens: sql<number>`SUM(${llmUsage.totalTokens})`,
          callCount: sql<number>`COUNT(*)`,
        })
        .from(llmUsage)
        .where(eq(llmUsage.projectId, input.projectId))
        .groupBy(llmUsage.evolutionCycle)
        .orderBy(llmUsage.evolutionCycle);
      return rows;
    }),

  // Top beads by cost
  getTopBeads: publicProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        limit: z.number().min(1).max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          beadId: llmUsage.beadId,
          totalCostCents: sql<number>`SUM(${llmUsage.costCents})`,
          totalTokens: sql<number>`SUM(${llmUsage.totalTokens})`,
          callCount: sql<number>`COUNT(*)`,
        })
        .from(llmUsage)
        .where(eq(llmUsage.projectId, input.projectId))
        .groupBy(llmUsage.beadId)
        .orderBy(desc(sql`SUM(${llmUsage.costCents})`))
        .limit(input.limit);

      // Enrich with bead titles
      const beadIds = rows.filter((r) => r.beadId).map((r) => r.beadId!);
      const beadTitles =
        beadIds.length > 0
          ? await ctx.db
              .select({ id: beads.id, title: beads.title })
              .from(beads)
              .where(inArray(beads.id, beadIds))
          : [];
      const titleMap = new Map(beadTitles.map((b) => [b.id, b.title]));

      return rows.map((r) => ({
        ...r,
        beadName: r.beadId
          ? (titleMap.get(r.beadId) ?? 'Unknown')
          : 'Non-bead (interview/eval)',
      }));
    }),
});
