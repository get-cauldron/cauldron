import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { createTestContext, type TestContext } from '@get-cauldron/test-harness';

describe('evolution router wiring', () => {
  let ctx: TestContext;

  afterEach(async () => {
    await ctx?.truncate();
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it('getSeedLineage returns seeds ordered by generation ascending', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });

    const seed0 = await ctx.fixtures.seed({
      projectId: project.id,
      interviewId: interview.id,
      version: 1,
      goal: 'Initial goal',
    });

    const { seeds } = await import('@get-cauldron/shared');
    const { eq } = await import('drizzle-orm');

    const seed1 = await ctx.fixtures.seed({
      projectId: project.id,
      interviewId: interview.id,
      version: 2,
      parentId: seed0.id,
      goal: 'Evolved goal',
    });

    await ctx.db.update(seeds).set({ generation: 0 }).where(eq(seeds.id, seed0.id));
    await ctx.db.update(seeds).set({ generation: 1 }).where(eq(seeds.id, seed1.id));

    const lineage = await ctx.caller.evolution.getSeedLineage({ projectId: project.id });
    expect(lineage).toHaveLength(2);
    expect(lineage[0]!.id).toBe(seed0.id);
    expect(lineage[1]!.id).toBe(seed1.id);
    expect(lineage[1]!.parentId).toBe(seed0.id);
  });

  it('getSeedLineage returns single-element chain for root seed', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });

    const lineage = await ctx.caller.evolution.getSeedLineage({ projectId: project.id });
    expect(lineage).toHaveLength(1);
    expect(lineage[0]!.parentId).toBeNull();
  });

  it('getEvolutionHistory returns evolution events in order', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();

    await ctx.fixtures.event({
      projectId: project.id,
      type: 'evolution_started',
      payload: { generation: 1 },
    });
    await ctx.fixtures.event({
      projectId: project.id,
      type: 'evolution_converged',
      payload: { signal: 'stagnation' },
    });

    const history = await ctx.caller.evolution.getEvolutionHistory({ projectId: project.id });
    expect(history).toHaveLength(2);
    expect(history[0]!.type).toBe('evolution_started');
    expect(history[1]!.type).toBe('evolution_converged');
  });

  it('getConvergenceForSeed returns cost data and convergence events', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });

    await ctx.fixtures.llmUsage({ projectId: project.id, seedId: seed.id, costCents: 50 });
    await ctx.fixtures.llmUsage({ projectId: project.id, seedId: seed.id, costCents: 30 });

    const result = await ctx.caller.evolution.getConvergenceForSeed({ seedId: seed.id });
    expect(Number(result.costCents)).toBe(80);
    expect(result.convergenceEvent).toBeNull();
    expect(result.lateralThinkingEvents).toHaveLength(0);
  });

  it('getConvergenceForSeed finds convergence event for seed', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });

    await ctx.fixtures.event({
      projectId: project.id,
      seedId: seed.id,
      type: 'evolution_goal_met',
      payload: { score: 0.96 },
    });

    const result = await ctx.caller.evolution.getConvergenceForSeed({ seedId: seed.id });
    expect(result.convergenceEvent).not.toBeNull();
    expect(result.convergenceEvent!.type).toBe('evolution_goal_met');
  });
});
