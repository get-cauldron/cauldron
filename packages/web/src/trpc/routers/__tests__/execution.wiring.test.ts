import { describe, it, expect, afterEach, afterAll, vi } from 'vitest';
import { createTestContext, type TestContext } from '@get-cauldron/test-harness';

// Mock the engine's Inngest client and runDecomposition for mutation tests
vi.mock('@get-cauldron/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@get-cauldron/engine')>();
  return {
    ...actual,
    inngest: {
      send: vi.fn().mockResolvedValue(undefined),
    },
    runDecomposition: vi.fn().mockResolvedValue({
      molecules: [],
      beads: [],
    }),
  };
});

describe('execution router wiring', () => {
  let ctx: TestContext;

  afterEach(async () => {
    await ctx?.truncate();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it('getDAG returns beads and edges for a seed', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });
    const beadA = await ctx.fixtures.bead({ seedId: seed.id, title: 'Bead A' });
    const beadB = await ctx.fixtures.bead({ seedId: seed.id, title: 'Bead B' });
    await ctx.fixtures.beadEdge({ fromBeadId: beadA.id, toBeadId: beadB.id, edgeType: 'blocks' });
    const dag = await ctx.caller.execution.getDAG({ seedId: seed.id });
    expect(dag.beads).toHaveLength(2);
    expect(dag.edges).toHaveLength(1);
    expect(dag.edges[0]!.fromBeadId).toBe(beadA.id);
    expect(dag.edges[0]!.toBeadId).toBe(beadB.id);
  });

  it('getProjectDAG finds latest seed and returns its DAG', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });
    await ctx.fixtures.bead({ seedId: seed.id, title: 'Only Bead' });
    const dag = await ctx.caller.execution.getProjectDAG({ projectId: project.id });
    expect(dag.seedId).toBe(seed.id);
    expect(dag.beads).toHaveLength(1);
  });

  it('getProjectDAG returns empty when no seed exists', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const dag = await ctx.caller.execution.getProjectDAG({ projectId: project.id });
    expect(dag.seedId).toBeNull();
    expect(dag.beads).toHaveLength(0);
    expect(dag.edges).toHaveLength(0);
  });

  it('getBeadDetail returns bead with associated events', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });
    const bead = await ctx.fixtures.bead({ seedId: seed.id, title: 'Detail Bead' });
    await ctx.fixtures.event({
      projectId: project.id,
      beadId: bead.id,
      type: 'bead_dispatched',
      payload: { agentId: 'test-agent' },
    });
    const detail = await ctx.caller.execution.getBeadDetail({ beadId: bead.id });
    expect(detail.bead.title).toBe('Detail Bead');
    expect(detail.events).toHaveLength(1);
    expect(detail.events[0]!.type).toBe('bead_dispatched');
  });

  it('getPipelineStatus reflects bead states', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });
    const emptyStatus = await ctx.caller.execution.getPipelineStatus({ projectId: project.id });
    expect(emptyStatus.active).toBe(false);
    await ctx.fixtures.bead({ seedId: seed.id, status: 'pending' });
    const activeStatus = await ctx.caller.execution.getPipelineStatus({ projectId: project.id });
    expect(activeStatus.active).toBe(true);
  });

  it('respondToEscalation records conflict_resolved event', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });
    const bead = await ctx.fixtures.bead({ seedId: seed.id });
    const result = await ctx.caller.execution.respondToEscalation({
      projectId: project.id,
      beadId: bead.id,
      action: 'retry',
      guidance: 'Try a different approach',
    });
    expect(result.success).toBe(true);
    const detail = await ctx.caller.execution.getBeadDetail({ beadId: bead.id });
    const resolvedEvent = detail.events.find((e) => e.type === 'conflict_resolved');
    expect(resolvedEvent).toBeDefined();
    expect((resolvedEvent!.payload as Record<string, unknown>)['action']).toBe('retry');
  });

  it('getBeadDetail throws for non-existent bead', async () => {
    ctx = await createTestContext();
    await expect(
      ctx.caller.execution.getBeadDetail({ beadId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toThrow(/not found/i);
  });
});
