import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process
const mockExecSync = vi.fn();
vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
}));

describe('self-build utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 1: captureEngineSnapshot returns a 40-char hex git hash', async () => {
    const fakeHash = 'a'.repeat(40);
    mockExecSync.mockReturnValue(`${fakeHash}\n`);

    const { captureEngineSnapshot } = await import('../self-build.js');
    const hash = captureEngineSnapshot('/some/project/root');

    expect(hash).toHaveLength(40);
    expect(/^[0-9a-f]{40}$/.test(hash)).toBe(true);
    expect(mockExecSync).toHaveBeenCalledWith('git rev-parse HEAD', expect.objectContaining({ cwd: '/some/project/root' }));
  });

  it('Test 2: detectEngineChange returns false when hash matches HEAD', async () => {
    const fakeHash = 'b'.repeat(40);
    mockExecSync.mockReturnValue(`${fakeHash}\n`);

    const { detectEngineChange } = await import('../self-build.js');
    const changed = detectEngineChange(fakeHash, '/some/project/root');

    expect(changed).toBe(false);
  });

  it('Test 3: detectEngineChange returns true when hash differs from HEAD', async () => {
    const snapshotHash = 'a'.repeat(40);
    const currentHash = 'b'.repeat(40);
    mockExecSync.mockReturnValue(`${currentHash}\n`);

    const { detectEngineChange } = await import('../self-build.js');
    const changed = detectEngineChange(snapshotHash, '/some/project/root');

    expect(changed).toBe(true);
  });

  it('Test 4: hasMigrationFiles returns true when diff contains packages/shared/src/db/migrations/', async () => {
    const { hasMigrationFiles } = await import('../self-build.js');

    const diffOutput = `packages/api/src/commands/execute.ts
packages/shared/src/db/migrations/0008_new_table.sql
packages/engine/src/index.ts`;

    expect(hasMigrationFiles(diffOutput)).toBe(true);
  });

  it('Test 5: hasMigrationFiles returns false when diff has no migration paths', async () => {
    const { hasMigrationFiles } = await import('../self-build.js');

    const diffOutput = `packages/api/src/commands/execute.ts
packages/engine/src/index.ts
packages/shared/src/db/schema/bead.ts`;

    expect(hasMigrationFiles(diffOutput)).toBe(false);
  });
});
