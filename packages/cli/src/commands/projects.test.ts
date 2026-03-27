import { describe, it, expect, vi, beforeEach } from 'vitest';
import { projectsCommand } from './projects.js';

// Minimal mock CLIClient shape
function makeMockClient(overrides?: {
  list?: () => Promise<unknown[]>;
  create?: (input: { name: string }) => Promise<unknown>;
  archive?: (input: { id: string }) => Promise<unknown>;
}) {
  return {
    projects: {
      list: { query: overrides?.list ?? vi.fn().mockResolvedValue([]) },
      create: { mutate: overrides?.create ?? vi.fn().mockResolvedValue({ id: 'new-id', name: 'Test' }) },
      archive: { mutate: overrides?.archive ?? vi.fn().mockResolvedValue({ success: true }) },
    },
  } as unknown as Parameters<typeof projectsCommand>[0];
}

describe('projectsCommand', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  it('calls client.projects.list.query() on list subcommand', async () => {
    const listFn = vi.fn().mockResolvedValue([]);
    const client = makeMockClient({ list: listFn });
    await projectsCommand(client, ['list'], { json: false });
    expect(listFn).toHaveBeenCalledOnce();
  });

  it('calls client.projects.list.query() with no subcommand', async () => {
    const listFn = vi.fn().mockResolvedValue([]);
    const client = makeMockClient({ list: listFn });
    await projectsCommand(client, [], { json: false });
    expect(listFn).toHaveBeenCalledOnce();
  });

  it('renders table with project names when projects exist', async () => {
    const projects = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'My First Project',
        lastActivity: new Date().toISOString(),
        lastEventType: 'interview_started',
        totalCostCents: 150,
      },
    ];
    const listFn = vi.fn().mockResolvedValue(projects);
    const client = makeMockClient({ list: listFn });
    await projectsCommand(client, ['list'], { json: false });
    // Table output should include the project name somewhere in console.log calls
    const allOutput = consoleLogSpy.mock.calls.flat().join(' ');
    expect(allOutput).toContain('My First Project');
  });

  it('outputs JSON when --json flag is set', async () => {
    const projects = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'My First Project',
        lastActivity: null,
        lastEventType: null,
        totalCostCents: 0,
      },
    ];
    const client = {
      projects: {
        list: { query: vi.fn().mockResolvedValue(projects) },
        create: { mutate: vi.fn() },
        archive: { mutate: vi.fn() },
      },
    } as unknown as Parameters<typeof projectsCommand>[0];
    await projectsCommand(client, ['list'], { json: true });
    // Find the first JSON-parseable output
    const allOutputs = consoleLogSpy.mock.calls.flat().map(String);
    const jsonOutput = allOutputs.find((o: string) => {
      try { JSON.parse(o); return true; } catch { return false; }
    });
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput!) as typeof projects;
    expect(parsed[0]?.name).toBe('My First Project');
  });

  it('calls client.projects.create.mutate() on create subcommand', async () => {
    const createFn = vi.fn().mockResolvedValue({ id: 'created-id', name: 'NewProj' });
    const client = makeMockClient({ create: createFn });
    await projectsCommand(client, ['create', 'NewProj'], { json: false });
    expect(createFn).toHaveBeenCalledWith({ name: 'NewProj' });
  });

  it('calls client.projects.archive.mutate() on archive subcommand', async () => {
    const archiveFn = vi.fn().mockResolvedValue({ success: true });
    const client = makeMockClient({ archive: archiveFn });
    await projectsCommand(client, ['archive', 'some-project-id'], { json: false });
    expect(archiveFn).toHaveBeenCalledWith({ id: 'some-project-id' });
  });

  it('exits with error when create is called without a name', async () => {
    const client = makeMockClient();
    await expect(
      projectsCommand(client, ['create'], { json: false })
    ).rejects.toThrow('process.exit called');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
