import { z } from 'zod';
import { router, publicProcedure } from '../init.js';
import { beads, beadEdges, events, seeds } from '@get-cauldron/shared';
import { appendEvent } from '@get-cauldron/shared';
import { eq, desc, inArray } from 'drizzle-orm';
import { runDecomposition, inngest as engineInngest, findReadyBeads } from '@get-cauldron/engine';


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

  // Trigger decomposition: runs the full decomposition pipeline synchronously
  triggerDecomposition: publicProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      seedId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { gateway } = await ctx.getEngineDeps();

      const [seed] = await ctx.db
        .select()
        .from(seeds)
        .where(eq(seeds.id, input.seedId))
        .limit(1);

      if (!seed) throw new Error(`Seed ${input.seedId} not found`);

      // Audit trail event (kept for observability)
      await appendEvent(ctx.db, {
        projectId: input.projectId,
        beadId: null,
        type: 'decomposition_started',
        payload: { seedId: input.seedId, source: 'trpc' },
      });

      // Call the real decomposition pipeline with the engine Inngest client
      await runDecomposition({
        db: ctx.db,
        gateway,
        inngest: engineInngest,
        seed,
        projectId: input.projectId,
      });

      return { success: true, message: 'Decomposition completed' };
    }),

  // Trigger execution (emits event for async Inngest processing)
  triggerExecution: publicProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      seedId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Audit trail
      await appendEvent(ctx.db, {
        projectId: input.projectId,
        beadId: null,
        type: 'execution_started',
        payload: { seedId: input.seedId, source: 'cli' },
      });

      // Find all ready beads (no unmet dependencies) and dispatch each individually
      const readyBeads = await findReadyBeads(ctx.db, input.seedId);

      for (const bead of readyBeads) {
        await engineInngest.send({
          name: 'bead.dispatch_requested',
          data: {
            beadId: bead.id,
            seedId: input.seedId,
            projectId: input.projectId,
            moleculeId: bead.moleculeId,
          },
        });
      }

      return { success: true, message: `Execution triggered: ${readyBeads.length} beads dispatched` };
    }),

  // Get pipeline status including active state and queue state
  getPipelineStatus: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [latestSeed] = await ctx.db
        .select()
        .from(seeds)
        .where(eq(seeds.projectId, input.projectId))
        .orderBy(desc(seeds.createdAt))
        .limit(1);

      if (!latestSeed) return { active: false, queued: false, seedId: null };

      const beadRows = await ctx.db
        .select()
        .from(beads)
        .where(eq(beads.seedId, latestSeed.id));

      const activeBeads = beadRows.filter(
        (b) => b.status === 'claimed' || b.status === 'pending'
      );
      const active = activeBeads.length > 0;

      // Check for queued pipeline_trigger events
      const triggerEvents = await ctx.db
        .select()
        .from(events)
        .where(eq(events.projectId, input.projectId))
        .orderBy(desc(events.occurredAt))
        .limit(10);

      const queued = triggerEvents.some(
        (e) =>
          e.type === 'pipeline_trigger' &&
          e.payload &&
          (e.payload as Record<string, unknown>)['status'] === 'queued'
      );

      return { active, queued, seedId: latestSeed.id };
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
