import { z } from 'zod';
import { router, publicProcedure } from '../init';
import { projects, events, llmUsage } from '@get-cauldron/shared';
import { eq, desc, sql, isNull, and, not, like } from 'drizzle-orm';

export const projectsRouter = router({
  list: publicProcedure
    .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
    const includeArchived = input?.includeArchived ?? false;

    const conditions = includeArchived
      ? isNull(projects.deletedAt)
      : and(isNull(projects.deletedAt), not(like(projects.name, '[archived]%')));

    const rows = await ctx.db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        settings: projects.settings,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(conditions)
      .orderBy(desc(projects.updatedAt));

    // For each project, get latest event and total cost
    const result = await Promise.all(
      rows.map(async (project) => {
        const [latestEvent] = await ctx.db
          .select({
            type: events.type,
            occurredAt: events.occurredAt,
          })
          .from(events)
          .where(eq(events.projectId, project.id))
          .orderBy(desc(events.occurredAt))
          .limit(1);

        const [costRow] = await ctx.db
          .select({
            totalCost: sql<number>`COALESCE(SUM(${llmUsage.costCents}), 0)`,
          })
          .from(llmUsage)
          .where(eq(llmUsage.projectId, project.id));

        return {
          ...project,
          lastActivity: latestEvent?.occurredAt ?? project.createdAt,
          lastEventType: latestEvent?.type ?? null,
          totalCostCents: Number(costRow?.totalCost ?? 0),
        };
      }),
    );

    return result;
  }),

  byId: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [project] = await ctx.db
        .select()
        .from(projects)
        .where(eq(projects.id, input.id));

      if (!project) throw new Error('Project not found');

      const [costRow] = await ctx.db
        .select({
          totalCost: sql<number>`COALESCE(SUM(${llmUsage.costCents}), 0)`,
        })
        .from(llmUsage)
        .where(eq(llmUsage.projectId, input.id));

      return { ...project, totalCostCents: Number(costRow?.totalCost ?? 0) };
    }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [project] = await ctx.db
        .insert(projects)
        .values({ name: input.name, description: input.description ?? null })
        .returning();
      return project!;
    }),

  archive: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [project] = await ctx.db
        .select()
        .from(projects)
        .where(eq(projects.id, input.id));

      if (!project) throw new Error('Project not found');

      await ctx.db
        .update(projects)
        .set({ name: `[archived] ${project.name}`, updatedAt: new Date() })
        .where(eq(projects.id, input.id));

      return { success: true };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [project] = await ctx.db
        .select()
        .from(projects)
        .where(eq(projects.id, input.id));

      if (!project) throw new Error('Project not found');

      await ctx.db
        .update(projects)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(projects.id, input.id));

      return { success: true };
    }),

  updateSettings: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        settings: z.object({
          budgetLimitCents: z.number().optional(),
          maxConcurrentBeads: z.number().optional(),
          repoUrl: z.string().optional(),
          asset: z.object({
            mode: z.enum(['active', 'paused', 'disabled']).optional(),
            runtimeUrl: z.string().optional(),
            artifactsRoot: z.string().optional(),
            maxConcurrentJobs: z.number().int().positive().optional(),
          }).optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(projects)
        .where(eq(projects.id, input.id));

      if (!existing) throw new Error('Project not found');

      const merged = {
        ...existing.settings,
        ...input.settings,
        ...(input.settings.asset !== undefined ? {
          asset: { ...existing.settings?.asset, ...input.settings.asset },
        } : {}),
      };

      const [updated] = await ctx.db
        .update(projects)
        .set({ settings: merged, updatedAt: new Date() })
        .where(eq(projects.id, input.id))
        .returning();

      return updated!;
    }),
});
