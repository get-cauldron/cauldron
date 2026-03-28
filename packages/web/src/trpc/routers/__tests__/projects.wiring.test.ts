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

  it('archive prefixes name with [archived]', async () => {
    ctx = await createTestContext();
    const project = await ctx.caller.projects.create({ name: 'To Archive' });
    await ctx.caller.projects.archive({ id: project.id });
    const found = await ctx.caller.projects.byId({ id: project.id });
    expect(found.name).toBe('[archived] To Archive');
    const list = await ctx.caller.projects.list();
    expect(list).toHaveLength(1);
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
});
