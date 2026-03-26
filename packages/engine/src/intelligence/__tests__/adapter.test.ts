import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KnowledgeGraphAdapter } from '../adapter.js';

// Mock node:child_process
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

// Mock node:fs for writeFileSync / unlinkSync
vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

// Mock node:os for tmpdir
vi.mock('node:os', () => ({
  tmpdir: vi.fn(() => '/tmp'),
}));

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';

/**
 * Build a fake MCP envelope response for a given inner payload.
 * The adapter expects: JSON.parse(stdout) => envelope, then JSON.parse(envelope.content[0].text) => result.
 */
function makeEnvelope(innerPayload: unknown, isError = false): string {
  const envelope = {
    isError,
    content: [{ text: JSON.stringify(innerPayload) }],
  };
  return JSON.stringify(envelope);
}

/**
 * Helper: configure the mocked exec to call back with a given stdout string.
 * The adapter calls exec(cmd, (err, stdout) => ...) — 2 args.
 */
function mockExecSuccess(stdout: string): void {
  vi.mocked(childProcess.exec).mockImplementation((_cmd: string, callback: unknown) => {
    (callback as (err: null, stdout: string) => void)(null, stdout);
    return {} as ReturnType<typeof childProcess.exec>;
  });
}

function mockExecError(errorMsg: string): void {
  vi.mocked(childProcess.exec).mockImplementation((_cmd: string, callback: unknown) => {
    (callback as (err: Error, stdout: string) => void)(new Error(errorMsg), '');
    return {} as ReturnType<typeof childProcess.exec>;
  });
}

describe('KnowledgeGraphAdapter', () => {
  const repoPath = '/Users/zakkeown/Code/cauldron';
  let adapter: KnowledgeGraphAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new KnowledgeGraphAdapter(repoPath, 'codebase-memory-mcp');
  });

  // -------------------------------------------------------------------------
  // Project name derivation
  // -------------------------------------------------------------------------
  it('derives project name from repo path by replacing slashes with dashes and stripping leading dash', () => {
    const a = new KnowledgeGraphAdapter('/Users/zakkeown/Code/cauldron');
    // access via Object.defineProperty or via public getter — use type cast for test access
    expect((a as unknown as { projectName: string }).projectName).toBe(
      'Users-zakkeown-Code-cauldron'
    );
  });

  it('derives project name for a path without leading slash correctly', () => {
    const a = new KnowledgeGraphAdapter('myrepo');
    expect((a as unknown as { projectName: string }).projectName).toBe('myrepo');
  });

  // -------------------------------------------------------------------------
  // indexRepository
  // -------------------------------------------------------------------------
  it('indexRepository calls codebase-memory-mcp cli index_repository and parses envelope', async () => {
    const expected = { project: 'Users-zakkeown-Code-cauldron', status: 'ok', nodes: 1200, edges: 3400 };
    mockExecSuccess(makeEnvelope(expected));

    const result = await adapter.indexRepository();

    expect(result).toEqual(expected);
    // Verify exec was called
    expect(childProcess.exec).toHaveBeenCalledOnce();
    const [cmd] = vi.mocked(childProcess.exec).mock.calls[0]!;
    expect(cmd).toContain('codebase-memory-mcp');
    expect(cmd).toContain('index_repository');
  });

  it('indexRepository includes project param in args written to tmp file', async () => {
    const expected = { project: 'Users-zakkeown-Code-cauldron', status: 'ok', nodes: 10, edges: 20 };
    mockExecSuccess(makeEnvelope(expected));

    await adapter.indexRepository();

    // The adapter should have written JSON to a temp file containing project and repo_path
    expect(fs.writeFileSync).toHaveBeenCalledOnce();
    const [, content] = vi.mocked(fs.writeFileSync).mock.calls[0]!;
    const written = JSON.parse(content as string) as Record<string, unknown>;
    expect(written['project']).toBe('Users-zakkeown-Code-cauldron');
    expect(written['repo_path']).toBe(repoPath);
  });

  // -------------------------------------------------------------------------
  // searchGraph
  // -------------------------------------------------------------------------
  it('searchGraph passes label, name_pattern, file_pattern params and returns typed result', async () => {
    const expected = {
      total: 5,
      results: [
        { name: 'MyClass', qualified_name: 'src/my.ts::MyClass', label: 'class', file_path: 'src/my.ts', in_degree: 2, out_degree: 3 },
      ],
      has_more: false,
    };
    mockExecSuccess(makeEnvelope(expected));

    const result = await adapter.searchGraph({ label: 'class', name_pattern: 'My.*', file_pattern: 'src/**' });

    expect(result).toEqual(expected);
    const [, content] = vi.mocked(fs.writeFileSync).mock.calls[0]!;
    const written = JSON.parse(content as string) as Record<string, unknown>;
    expect(written['label']).toBe('class');
    expect(written['name_pattern']).toBe('My.*');
    expect(written['file_pattern']).toBe('src/**');
  });

  // -------------------------------------------------------------------------
  // traceCallPath
  // -------------------------------------------------------------------------
  it('traceCallPath passes function_name and direction and returns typed result', async () => {
    const expected = {
      function: 'runDecomposition',
      direction: 'both',
      callers: [{ name: 'main', qualified_name: 'src/index.ts::main', hop: 1 }],
      callees: [{ name: 'decompose', qualified_name: 'src/decomposer.ts::decompose', hop: 1 }],
    };
    mockExecSuccess(makeEnvelope(expected));

    const result = await adapter.traceCallPath('runDecomposition', 'both');

    expect(result).toEqual(expected);
    const [, content] = vi.mocked(fs.writeFileSync).mock.calls[0]!;
    const written = JSON.parse(content as string) as Record<string, unknown>;
    expect(written['function_name']).toBe('runDecomposition');
    expect(written['direction']).toBe('both');
  });

  it('traceCallPath defaults direction to "both" when not specified', async () => {
    const expected = { function: 'foo', direction: 'both', callers: [], callees: [] };
    mockExecSuccess(makeEnvelope(expected));

    await adapter.traceCallPath('foo');

    const [, content] = vi.mocked(fs.writeFileSync).mock.calls[0]!;
    const written = JSON.parse(content as string) as Record<string, unknown>;
    expect(written['direction']).toBe('both');
  });

  // -------------------------------------------------------------------------
  // getCodeSnippet
  // -------------------------------------------------------------------------
  it('getCodeSnippet passes qualified_name and returns parsed result', async () => {
    const expected = {
      name: 'KnowledgeGraphAdapter',
      qualified_name: 'src/intelligence/adapter.ts::KnowledgeGraphAdapter',
      code: 'export class KnowledgeGraphAdapter { ... }',
      file_path: 'src/intelligence/adapter.ts',
      start_line: 1,
      end_line: 50,
    };
    mockExecSuccess(makeEnvelope(expected));

    const result = await adapter.getCodeSnippet('src/intelligence/adapter.ts::KnowledgeGraphAdapter');

    expect(result).toEqual(expected);
    const [, content] = vi.mocked(fs.writeFileSync).mock.calls[0]!;
    const written = JSON.parse(content as string) as Record<string, unknown>;
    expect(written['qualified_name']).toBe('src/intelligence/adapter.ts::KnowledgeGraphAdapter');
  });

  // -------------------------------------------------------------------------
  // detectChanges
  // -------------------------------------------------------------------------
  it('detectChanges returns changed_files, changed_count, impacted_symbols', async () => {
    const expected = {
      changed_files: ['src/intelligence/adapter.ts'],
      changed_count: 1,
      impacted_symbols: [{ name: 'KnowledgeGraphAdapter', label: 'class', file: 'src/intelligence/adapter.ts' }],
    };
    mockExecSuccess(makeEnvelope(expected));

    const result = await adapter.detectChanges();

    expect(result).toEqual(expected);
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------
  it('throws when MCP envelope has isError: true', async () => {
    const errorEnvelope = JSON.stringify({
      isError: true,
      content: [{ text: JSON.stringify({ message: 'Tool not found' }) }],
    });
    mockExecSuccess(errorEnvelope);

    await expect(adapter.indexRepository()).rejects.toThrow();
  });

  it('throws when exec itself errors', async () => {
    mockExecError('binary not found');

    await expect(adapter.indexRepository()).rejects.toThrow('binary not found');
  });
});
