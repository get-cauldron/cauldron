import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { createTestContext, type TestContext } from '@get-cauldron/test-harness';

describe('projects router wiring', () => {
  let ctx: TestContext;

  afterEach(async () => {
    await ctx?.truncate();
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it('create returns a project with id and name', async () => {
    ctx = await createTestContext();
    const project = await ctx.caller.projects.create({ name: 'My Project', description: 'A test project' });
    expect(project.id).toBeDefined();
    expect(project.name).toBe('My Project');
    expect(project.description).toBe('A test project');
  });

  it('list returns non-deleted projects', async () => {
    ctx = await createTestContext();
    await ctx.caller.projects.create({ name: 'Project A' });
    await ctx.caller.projects.create({ name: 'Project B' });
    const list = await ctx.caller.projects.list();
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.name)).toContain('Project A');
    expect(list.map((p) => p.name)).toContain('Project B');
  });

  it('byId returns project with cost totals', async () => {
    ctx = await createTestContext();
    const created = await ctx.caller.projects.create({ name: 'Lookup Project' });
    const found = await ctx.caller.projects.byId({ id: created.id });
    expect(found.name).toBe('Lookup Project');
    expect(found.totalCostCents).toBe(0);
  });

  it('archive prefixes name with [archived] and hides from default list', async () => {
    ctx = await createTestContext();
    const project = await ctx.caller.projects.create({ name: 'To Archive' });
    await ctx.caller.projects.archive({ id: project.id });
    const found = await ctx.caller.projects.byId({ id: project.id });
    expect(found.name).toBe('[archived] To Archive');

    // Default list hides archived projects
    const list = await ctx.caller.projects.list();
    expect(list).toHaveLength(0);

    // includeArchived shows them
    const fullList = await ctx.caller.projects.list({ includeArchived: true });
    expect(fullList).toHaveLength(1);
    expect(fullList[0]!.name).toBe('[archived] To Archive');
  });

  it('delete sets deletedAt and excludes from list', async () => {
    ctx = await createTestContext();
    const project = await ctx.caller.projects.create({ name: 'To Delete' });
    await ctx.caller.projects.delete({ id: project.id });
    const list = await ctx.caller.projects.list();
    expect(list).toHaveLength(0);
    const found = await ctx.caller.projects.byId({ id: project.id });
    expect(found.deletedAt).not.toBeNull();
  });

  it('updateSettings persists budget and concurrent bead settings', async () => {
    ctx = await createTestContext();
    const project = await ctx.caller.projects.create({ name: 'Config Project' });
    const updated = await ctx.caller.projects.updateSettings({
      id: project.id,
      settings: { budgetLimitCents: 5000, maxConcurrentBeads: 3, repoUrl: 'https://github.com/test/repo' },
    });
    expect(updated.settings).toMatchObject({ budgetLimitCents: 5000, maxConcurrentBeads: 3, repoUrl: 'https://github.com/test/repo' });
    const found = await ctx.caller.projects.byId({ id: project.id });
    expect(found.settings).toMatchObject({ budgetLimitCents: 5000 });
  });

  it('create with duplicate name is allowed', async () => {
    ctx = await createTestContext();
    const first = await ctx.caller.projects.create({ name: 'Same Name' });
    const second = await ctx.caller.projects.create({ name: 'Same Name' });
    expect(first.id).not.toBe(second.id);
    const list = await ctx.caller.projects.list();
    expect(list).toHaveLength(2);
  });

  // Single-query N+1 elimination tests (PERF-01)
  // These tests verify projects.list returns lastActivity, lastEventType, and
  // totalCostCents correctly via the single-query implementation.

  it('list returns lastActivity from latest event and lastEventType when project has events', async () => {
    ctx = await createTestContext();
    const project = await ctx.caller.projects.create({ name: 'Event Project' });
    await ctx.fixtures.event({ projectId: project.id, type: 'interview_started' });
    await ctx.fixtures.event({ projectId: project.id, type: 'seed_crystallized' });

    const list = await ctx.caller.projects.list();
    const found = list.find((p) => p.id === project.id);
    expect(found).toBeDefined();
    expect(found!.lastEventType).toBe('seed_crystallized');
    expect(found!.lastActivity).toBeInstanceOf(Date);
  });

  it('list returns createdAt as lastActivity and null lastEventType when project has no events', async () => {
    ctx = await createTestContext();
    const project = await ctx.caller.projects.create({ name: 'No Events Project' });

    const list = await ctx.caller.projects.list();
    const found = list.find((p) => p.id === project.id);
    expect(found).toBeDefined();
    expect(found!.lastEventType).toBeNull();
    expect(found!.lastActivity).toBeInstanceOf(Date);
    // lastActivity should equal createdAt (within a second)
    expect(Math.abs(found!.lastActivity.getTime() - found!.createdAt.getTime())).toBeLessThan(2000);
  });

  it('list returns totalCostCents=0 when project has no llm_usage rows', async () => {
    ctx = await createTestContext();
    const project = await ctx.caller.projects.create({ name: 'No Usage Project' });

    const list = await ctx.caller.projects.list();
    const found = list.find((p) => p.id === project.id);
    expect(found).toBeDefined();
    expect(found!.totalCostCents).toBe(0);
  });

  it('list returns summed totalCostCents from llm_usage rows', async () => {
    ctx = await createTestContext();
    const project = await ctx.caller.projects.create({ name: 'Usage Project' });
    await ctx.fixtures.llmUsage({ projectId: project.id, costCents: 100 });
    await ctx.fixtures.llmUsage({ projectId: project.id, costCents: 250 });

    const list = await ctx.caller.projects.list();
    const found = list.find((p) => p.id === project.id);
    expect(found).toBeDefined();
    expect(found!.totalCostCents).toBe(350);
  });

  it('list filters archived projects when includeArchived=false (single-query)', async () => {
    ctx = await createTestContext();
    const project = await ctx.caller.projects.create({ name: 'Archivable Project' });
    await ctx.caller.projects.archive({ id: project.id });

    const list = await ctx.caller.projects.list({ includeArchived: false });
    expect(list.find((p) => p.id === project.id)).toBeUndefined();

    const fullList = await ctx.caller.projects.list({ includeArchived: true });
    expect(fullList.find((p) => p.id === project.id)).toBeDefined();
  });

  it('list excludes soft-deleted projects (single-query)', async () => {
    ctx = await createTestContext();
    const project = await ctx.caller.projects.create({ name: 'To Soft Delete' });
    await ctx.caller.projects.delete({ id: project.id });

    const list = await ctx.caller.projects.list();
    expect(list.find((p) => p.id === project.id)).toBeUndefined();
  });
});
