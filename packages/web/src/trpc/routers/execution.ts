import { z } from 'zod';
import { router, publicProcedure } from '../init.js';
import { beads, beadEdges, events, seeds } from '@cauldron/shared';
import { appendEvent } from '@cauldron/shared';
import { eq, desc, inArray } from 'drizzle-orm';

export const executionRouter = router({
  // Get full DAG for a seed (all beads + edges)
  getDAG: publicProcedure
    .input(z.object({ seedId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const beadRows = await ctx.db.select().from(beads)
        .where(eq(beads.seedId, input.seedId));
      const beadIds = beadRows.map(b => b.id);
      const edgeRows = beadIds.length > 0
        ? await ctx.db.select().from(beadEdges)
            .where(inArray(beadEdges.fromBeadId, beadIds))
        : [];
      return { beads: beadRows, edges: edgeRows };
    }),

  // Get DAG for a project (find latest seed, then get its DAG)
  getProjectDAG: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [latestSeed] = await ctx.db.select().from(seeds)
        .where(eq(seeds.projectId, input.projectId))
        .orderBy(desc(seeds.createdAt))
        .limit(1);
      if (!latestSeed) return { beads: [], edges: [], seedId: null };

      const beadRows = await ctx.db.select().from(beads)
        .where(eq(beads.seedId, latestSeed.id));
      const beadIds = beadRows.map(b => b.id);
      const edgeRows = beadIds.length > 0
        ? await ctx.db.select().from(beadEdges)
            .where(inArray(beadEdges.fromBeadId, beadIds))
        : [];
      return { beads: beadRows, edges: edgeRows, seedId: latestSeed.id };
    }),

  // Get bead detail (spec, logs, code changes)
  getBeadDetail: publicProcedure
    .input(z.object({ beadId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [bead] = await ctx.db.select().from(beads)
        .where(eq(beads.id, input.beadId));
      if (!bead) throw new Error('Bead not found');

      // Get bead events for log data
      const beadEvents = await ctx.db.select().from(events)
        .where(eq(events.beadId, input.beadId))
        .orderBy(events.occurredAt);

      return { bead, events: beadEvents };
    }),

  // Trigger decomposition (emits event for async Inngest processing)
  triggerDecomposition: publicProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      seedId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await appendEvent(ctx.db, {
        projectId: input.projectId,
        beadId: null,
        type: 'decomposition_started',
        payload: { seedId: input.seedId, source: 'cli' },
      });
      return { success: true, message: 'Decomposition triggered' };
    }),

  // Trigger execution (emits event for async Inngest processing)
  triggerExecution: publicProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      seedId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await appendEvent(ctx.db, {
        projectId: input.projectId,
        beadId: null,
        type: 'execution_started',
        payload: { seedId: input.seedId, source: 'cli' },
      });
      return { success: true, message: 'Execution triggered' };
    }),

  // Submit escalation response
  respondToEscalation: publicProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      beadId: z.string().uuid().optional(),
      action: z.enum(['retry', 'skip', 'guidance', 'abort']),
      guidance: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await appendEvent(ctx.db, {
        projectId: input.projectId,
        beadId: input.beadId ?? null,
        type: 'conflict_resolved',
        payload: { action: input.action, guidance: input.guidance ?? null },
      });
      return { success: true };
    }),
});
