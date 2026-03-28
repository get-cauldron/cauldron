import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { createTestContext, type TestContext } from '@get-cauldron/test-harness';

describe('costs router wiring', () => {
  let ctx: TestContext;

  afterEach(async () => {
    await ctx?.truncate();
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it('getProjectSummary returns zeros when no usage exists', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const summary = await ctx.caller.costs.getProjectSummary({ projectId: project.id });
    expect(Number(summary.totalCostCents)).toBe(0);
    expect(Number(summary.totalTokens)).toBe(0);
    expect(Number(summary.callCount)).toBeGreaterThanOrEqual(0);
  });

  it('getProjectSummary aggregates multiple usage records', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    await ctx.fixtures.llmUsage({ projectId: project.id, costCents: 10, promptTokens: 100, completionTokens: 50 });
    await ctx.fixtures.llmUsage({ projectId: project.id, costCents: 20, promptTokens: 200, completionTokens: 100 });
    const summary = await ctx.caller.costs.getProjectSummary({ projectId: project.id });
    expect(Number(summary.totalCostCents)).toBe(30);
    expect(Number(summary.totalPromptTokens)).toBe(300);
    expect(Number(summary.totalCompletionTokens)).toBe(150);
    expect(Number(summary.callCount)).toBe(2);
  });

  it('getByModel groups usage by model name', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    await ctx.fixtures.llmUsage({ projectId: project.id, model: 'claude-sonnet-4-6', costCents: 15 });
    await ctx.fixtures.llmUsage({ projectId: project.id, model: 'claude-sonnet-4-6', costCents: 25 });
    await ctx.fixtures.llmUsage({ projectId: project.id, model: 'gpt-4o', costCents: 10 });
    const byModel = await ctx.caller.costs.getByModel({ projectId: project.id });
    expect(byModel).toHaveLength(2);
    const claude = byModel.find((r) => r.model === 'claude-sonnet-4-6');
    expect(Number(claude?.totalCostCents)).toBe(40);
    expect(Number(claude?.callCount)).toBe(2);
  });

  it('getByStage groups usage by pipeline stage', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    await ctx.fixtures.llmUsage({ projectId: project.id, stage: 'interview', costCents: 10 });
    await ctx.fixtures.llmUsage({ projectId: project.id, stage: 'decomposition', costCents: 20 });
    await ctx.fixtures.llmUsage({ projectId: project.id, stage: 'interview', costCents: 5 });
    const byStage = await ctx.caller.costs.getByStage({ projectId: project.id });
    const interviewStage = byStage.find((r) => r.stage === 'interview');
    expect(Number(interviewStage?.totalCostCents)).toBe(15);
  });

  it('getTopBeads returns beads ordered by cost descending with titles', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });
    const bead1 = await ctx.fixtures.bead({ seedId: seed.id, title: 'Expensive Bead' });
    const bead2 = await ctx.fixtures.bead({ seedId: seed.id, title: 'Cheap Bead' });
    await ctx.fixtures.llmUsage({ projectId: project.id, beadId: bead1.id, costCents: 100 });
    await ctx.fixtures.llmUsage({ projectId: project.id, beadId: bead2.id, costCents: 5 });
    const topBeads = await ctx.caller.costs.getTopBeads({ projectId: project.id, limit: 2 });
    expect(topBeads).toHaveLength(2);
    expect(Number(topBeads[0]!.totalCostCents)).toBeGreaterThanOrEqual(Number(topBeads[1]!.totalCostCents));
    expect(topBeads[0]!.beadName).toBe('Expensive Bead');
  });
});
