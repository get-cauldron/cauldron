import { z } from 'zod';
import { router, publicProcedure } from '../init';
import { projects, llmUsage } from '@get-cauldron/shared';
import { eq, sql } from 'drizzle-orm';

export const projectsRouter = router({
  list: publicProcedure
    .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
    const includeArchived = input?.includeArchived ?? false;

    // Single query with LATERAL subqueries — eliminates N+1 pattern (PERF-01).
    // The events table has a composite index on (project_id, occurred_at) from Phase 22,
    // so the LATERAL subquery for latest event uses an index seek, not a full scan.
    const archiveFilter = includeArchived
      ? sql``
      : sql`AND p.name NOT LIKE '[archived]%'`;

    const rows = await ctx.db.execute<{
      id: string;
      name: string;
      description: string | null;
      settings: Record<string, unknown> | null;
      createdAt: Date;
      updatedAt: Date;
      lastActivity: Date;
      lastEventType: string | null;
      totalCostCents: string;
    }>(sql`
      SELECT
        p.id,
        p.name,
        p.description,
        p.settings,
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt",
        COALESCE(le.occurred_at, p.created_at) AS "lastActivity",
        le.type AS "lastEventType",
        COALESCE(cu.total_cost, 0) AS "totalCostCents"
      FROM projects p
      LEFT JOIN LATERAL (
        SELECT e.type, e.occurred_at
        FROM events e
        WHERE e.project_id = p.id
        ORDER BY e.occurred_at DESC
        LIMIT 1
      ) le ON true
      LEFT JOIN LATERAL (
        SELECT SUM(u.cost_cents) AS total_cost
        FROM llm_usage u
        WHERE u.project_id = p.id
      ) cu ON true
      WHERE p.deleted_at IS NULL
        ${archiveFilter}
      ORDER BY p.updated_at DESC
    `);

    const result = rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      settings: row.settings as typeof projects.$inferSelect['settings'],
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      lastActivity: new Date(row.lastActivity),
      lastEventType: row.lastEventType ?? null,
      totalCostCents: Number(row.totalCostCents),
    }));

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
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(projects)
        .where(eq(projects.id, input.id));

      if (!existing) throw new Error('Project not found');

      const merged = { ...existing.settings, ...input.settings };

      const [updated] = await ctx.db
        .update(projects)
        .set({ settings: merged, updatedAt: new Date() })
        .where(eq(projects.id, input.id))
        .returning();

      return updated!;
    }),
});
