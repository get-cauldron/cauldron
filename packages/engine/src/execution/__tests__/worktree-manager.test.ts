import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock simple-git before imports
const mockRaw = vi.fn();
const mockAdd = vi.fn();
const mockCommit = vi.fn();
const mockCheckout = vi.fn();
const mockMerge = vi.fn();
const mockStatus = vi.fn();
const mockDeleteLocalBranch = vi.fn();

const mockGitInstance = {
  raw: mockRaw,
  add: mockAdd,
  commit: mockCommit,
  checkout: mockCheckout,
  merge: mockMerge,
  status: mockStatus,
  deleteLocalBranch: mockDeleteLocalBranch,
};

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGitInstance),
}));

// Mock node:fs for existsSync
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { WorktreeManager } from '../worktree-manager.js';
import { detectTestRunner } from '../test-detector.js';
import * as fs from 'node:fs';
import { simpleGit } from 'simple-git';

describe('WorktreeManager', () => {
  let manager: WorktreeManager;
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new WorktreeManager(projectRoot);
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
    mockRaw.mockResolvedValue('');
    mockAdd.mockResolvedValue({});
    mockCommit.mockResolvedValue({ commit: 'abc1234' });
    mockCheckout.mockResolvedValue('');
    mockMerge.mockResolvedValue({});
    mockStatus.mockResolvedValue({ conflicted: ['file.ts'] });
    mockDeleteLocalBranch.mockResolvedValue({});
  });

  it('createWorktree returns correct path, branch, and beadId', async () => {
    const beadId = 'bead-1234-5678-abcd-efgh';
    const result = await manager.createWorktree(beadId);

    expect(result.beadId).toBe(beadId);
    expect(result.path).toBe(`${projectRoot}/.cauldron/worktrees/${beadId}`);
    expect(result.branch).toBe(`cauldron/bead-${beadId.slice(0, 8)}`);
  });

  it('createWorktree calls git.raw with worktree add -b', async () => {
    const beadId = 'bead-1234-5678-abcd-efgh';
    await manager.createWorktree(beadId);

    expect(mockRaw).toHaveBeenCalledWith([
      'worktree',
      'add',
      '-b',
      `cauldron/bead-${beadId.slice(0, 8)}`,
      `${projectRoot}/.cauldron/worktrees/${beadId}`,
    ]);
  });

  it('createWorktree is idempotent — returns cached result if path exists', async () => {
    const beadId = 'bead-1234-5678-abcd-efgh';
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const result = await manager.createWorktree(beadId);

    expect(mockRaw).not.toHaveBeenCalledWith(
      expect.arrayContaining(['worktree', 'add'])
    );
    expect(result.path).toBe(`${projectRoot}/.cauldron/worktrees/${beadId}`);
    expect(result.beadId).toBe(beadId);
  });

  it('removeWorktree calls worktree remove --force then prune then deleteLocalBranch', async () => {
    const beadId = 'bead-1234-5678-abcd-efgh';
    await manager.removeWorktree(beadId);

    expect(mockRaw).toHaveBeenCalledWith([
      'worktree',
      'remove',
      '--force',
      `${projectRoot}/.cauldron/worktrees/${beadId}`,
    ]);
    expect(mockRaw).toHaveBeenCalledWith(['worktree', 'prune']);
    expect(mockDeleteLocalBranch).toHaveBeenCalledWith(
      `cauldron/bead-${beadId.slice(0, 8)}`,
      true
    );
  });

  it('commitWorktreeChanges calls git.add and git.commit scoped to worktree path', async () => {
    const worktreePath = '/test/project/.cauldron/worktrees/bead-1234';
    const message = 'feat: implement feature';

    const commitHash = await manager.commitWorktreeChanges(worktreePath, message);

    expect(simpleGit).toHaveBeenCalledWith(worktreePath);
    expect(mockAdd).toHaveBeenCalledWith('.');
    expect(mockCommit).toHaveBeenCalledWith(message);
    expect(commitHash).toBe('abc1234');
  });

  it('mergeWorktreeToMain checks out main and merges with --no-ff on success', async () => {
    const beadId = 'bead-1234';
    const branch = 'cauldron/bead-bead-123';

    const result = await manager.mergeWorktreeToMain(beadId, branch);

    expect(mockCheckout).toHaveBeenCalledWith('main');
    expect(mockMerge).toHaveBeenCalledWith([
      branch,
      '--no-ff',
      '-m',
      `Merge bead ${beadId}`,
    ]);
    expect(result).toEqual({ success: true, conflicted: false });
  });

  it('mergeWorktreeToMain returns conflict info on merge failure', async () => {
    const beadId = 'bead-1234';
    const branch = 'cauldron/bead-bead-123';
    mockMerge.mockRejectedValue(new Error('CONFLICTS'));
    mockStatus.mockResolvedValue({ conflicted: ['src/file.ts'] });

    const result = await manager.mergeWorktreeToMain(beadId, branch);

    expect(result.success).toBe(false);
    expect(result.conflicted).toBe(true);
    expect(result.conflicts).toEqual(['src/file.ts']);
  });
});

describe('detectTestRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('{}');
  });

  it('detects vitest from package.json test script', () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(true); // package.json exists
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify({ scripts: { test: 'vitest run' } })
    );
    const config = detectTestRunner('/test/project');
    expect(config.unitCommand).toContain('vitest');
    expect(config.typecheckCommand).toContain('tsc');
  });

  it('detects jest from package.json test script', () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(true); // package.json exists
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify({ scripts: { test: 'jest' } })
    );
    const config = detectTestRunner('/test/project');
    expect(config.unitCommand).toContain('jest');
  });

  it('defaults to vitest when no test runner detected', () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(true); // package.json exists
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify({ scripts: {} })
    );
    const config = detectTestRunner('/test/project');
    expect(config.unitCommand).toContain('vitest');
  });

  it('sets e2eCommand only when playwright config exists', () => {
    // No playwright config: package.json + vitest, all other existsSync = false
    (fs.existsSync as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(true)   // package.json
      .mockReturnValue(false);     // no playwright, no config files
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify({ scripts: { test: 'vitest run' } })
    );

    const configNoE2e = detectTestRunner('/test/project');
    expect(configNoE2e.e2eCommand).toBeUndefined();

    vi.clearAllMocks();

    // With playwright config: package.json exists, playwright.config.ts exists
    (fs.existsSync as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(true)   // package.json
      .mockReturnValueOnce(true);  // playwright.config.ts
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify({ scripts: { test: 'vitest run' } })
    );

    const configWithE2e = detectTestRunner('/test/project');
    expect(configWithE2e.e2eCommand).toBe('npx playwright test');
  });
});
