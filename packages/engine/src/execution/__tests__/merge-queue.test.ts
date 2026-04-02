import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock simple-git before any imports
// ---------------------------------------------------------------------------
const mockRaw = vi.fn();
const mockAdd = vi.fn();
const mockStatus = vi.fn();

const mockGitInstance = {
  raw: mockRaw,
  add: mockAdd,
  status: mockStatus,
};

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGitInstance),
}));

// ---------------------------------------------------------------------------
// Mock node:fs
// ---------------------------------------------------------------------------
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock node:child_process
// ---------------------------------------------------------------------------
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock @get-cauldron/shared (prevents DATABASE_URL error at import time)
// Use vi.hoisted so the variable is available at mock-factory evaluation time.
// ---------------------------------------------------------------------------
const { mockAppendEvent } = vi.hoisted(() => ({
  mockAppendEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@get-cauldron/shared', () => ({
  appendEvent: mockAppendEvent,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { MergeQueue } from '../merge-queue.js';
import type { MergeQueueEntry, TestRunnerConfig } from '../types.js';
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeEntry(overrides: Partial<MergeQueueEntry> = {}): MergeQueueEntry {
  return {
    beadId: 'bead-001',
    seedId: 'seed-001',
    projectId: 'proj-001',
    branch: 'cauldron/bead-bead-001',
    worktreePath: '/project/.cauldron/worktrees/bead-001',
    topologicalOrder: 1,
    ...overrides,
  };
}

const testRunner: TestRunnerConfig = {
  unitCommand: 'vitest run',
  integrationCommand: 'vitest run --config vitest.integration.config.ts',
  typecheckCommand: 'tsc --noEmit',
};

/** Minimal LanguageModelUsage-conforming value for mocks.
 * inputTokenDetails and outputTokenDetails are required objects (their sub-fields are optional). */
const mockUsage = {
  inputTokens: 100,
  outputTokens: 50,
  totalTokens: undefined,
  inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
  outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
} as const;

const mockUsageZero = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: undefined,
  inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
  outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
} as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('MergeQueue', () => {
  let worktreeManager: {
    mergeWorktreeToMain: ReturnType<typeof vi.fn>;
    removeWorktree: ReturnType<typeof vi.fn>;
    commitWorktreeChanges: ReturnType<typeof vi.fn>;
    createWorktree: ReturnType<typeof vi.fn>;
  };
  let knowledgeGraph: { indexRepository: ReturnType<typeof vi.fn> };
  let gateway: { generateObject: ReturnType<typeof vi.fn> };
  let db: object;
  let queue: MergeQueue;
  const projectRoot = '/project';

  beforeEach(() => {
    vi.clearAllMocks();

    worktreeManager = {
      mergeWorktreeToMain: vi.fn(),
      removeWorktree: vi.fn().mockResolvedValue(undefined),
      commitWorktreeChanges: vi.fn().mockResolvedValue('abc1234'),
      createWorktree: vi.fn(),
    };

    knowledgeGraph = {
      indexRepository: vi.fn().mockResolvedValue({ nodes: 100, edges: 50 }),
    };

    gateway = {
      generateObject: vi.fn(),
    };

    db = {};

    queue = new MergeQueue(
      worktreeManager as any,
      knowledgeGraph as any,
      gateway as any,
      db as any,
      projectRoot
    );

    // Default: successful merge, no conflicts
    worktreeManager.mergeWorktreeToMain.mockResolvedValue({
      success: true,
      conflicted: false,
    });

    // Default: exec runs commands successfully
    // exec(cmd, options, callback) — options object is second arg, callback is third
    (childProcess.exec as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_cmd: string, _opts: unknown, callback: (err: null, stdout: string, stderr: string) => void) => {
        callback(null, '', '');
      }
    );

    mockRaw.mockResolvedValue('');
    mockAdd.mockResolvedValue({});
  });

  // -------------------------------------------------------------------------
  // enqueue / ordering
  // -------------------------------------------------------------------------
  it('enqueue adds entry to queue sorted by topologicalOrder', () => {
    const e3 = makeEntry({ beadId: 'bead-003', topologicalOrder: 3 });
    const e1 = makeEntry({ beadId: 'bead-001', topologicalOrder: 1 });
    const e2 = makeEntry({ beadId: 'bead-002', topologicalOrder: 2 });

    queue.enqueue(e3);
    queue.enqueue(e1);
    queue.enqueue(e2);

    expect(queue.size()).toBe(3);
  });

  it('processNext picks the entry with lowest topologicalOrder', async () => {
    const e3 = makeEntry({ beadId: 'bead-003', topologicalOrder: 3 });
    const e1 = makeEntry({ beadId: 'bead-001', topologicalOrder: 1 });
    const e2 = makeEntry({ beadId: 'bead-002', topologicalOrder: 2 });

    queue.enqueue(e3);
    queue.enqueue(e1);
    queue.enqueue(e2);

    const outcome = await queue.processNext(testRunner);
    expect(outcome?.beadId).toBe('bead-001');
    expect(worktreeManager.mergeWorktreeToMain).toHaveBeenCalledWith('bead-001', e1.branch);
  });

  it('processNext returns null when queue is empty', async () => {
    const result = await queue.processNext(testRunner);
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Successful merge flow
  // -------------------------------------------------------------------------
  it('on successful merge with passing post-merge tests, triggers knowledgeGraph.indexRepository', async () => {
    queue.enqueue(makeEntry());

    const outcome = await queue.processNext(testRunner);

    expect(outcome?.status).toBe('merged');
    expect(knowledgeGraph.indexRepository).toHaveBeenCalledOnce();
  });

  it('on successful merge with passing post-merge tests, calls worktreeManager.removeWorktree (D-18)', async () => {
    queue.enqueue(makeEntry());

    await queue.processNext(testRunner);

    expect(worktreeManager.removeWorktree).toHaveBeenCalledWith('bead-001');
  });

  it('on successful merge, emits bead_merged event via appendEvent', async () => {
    queue.enqueue(makeEntry());

    await queue.processNext(testRunner);

    expect(mockAppendEvent).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'bead_merged' })
    );
  });

  // -------------------------------------------------------------------------
  // Conflict — LLM resolution (high confidence)
  // -------------------------------------------------------------------------
  it('on merge conflict, attempts LLM-assisted resolution via conflict_resolution stage (D-14)', async () => {
    worktreeManager.mergeWorktreeToMain
      .mockResolvedValueOnce({
        success: false,
        conflicted: true,
        conflicts: ['src/index.ts'],
      })
      .mockResolvedValueOnce({ success: true, conflicted: false });

    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      '<<<<<<< HEAD\nconst a = 1;\n=======\nconst a = 2;\n>>>>>>> branch\n'
    );

    gateway.generateObject.mockResolvedValue({
      object: {
        confidence: 'high',
        files: [{ path: 'src/index.ts', resolved_content: 'const a = 1; // resolved\n' }],
      },
      usage: mockUsage,
    });

    queue.enqueue(makeEntry());
    await queue.processNext(testRunner);

    expect(gateway.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'conflict_resolution' })
    );
  });

  it('if LLM resolution confidence is high, applies resolution, commits, and retries merge', async () => {
    worktreeManager.mergeWorktreeToMain
      .mockResolvedValueOnce({
        success: false,
        conflicted: true,
        conflicts: ['src/index.ts'],
      })
      .mockResolvedValueOnce({ success: true, conflicted: false });

    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      '<<<<<<< HEAD\nconst a = 1;\n=======\nconst a = 2;\n>>>>>>> branch\n'
    );

    gateway.generateObject.mockResolvedValue({
      object: {
        confidence: 'high',
        files: [{ path: 'src/index.ts', resolved_content: 'const a = 1; // resolved\n' }],
      },
      usage: mockUsage,
    });

    queue.enqueue(makeEntry());
    const outcome = await queue.processNext(testRunner);

    expect(outcome?.status).toBe('conflict_resolved');
    // mergeWorktreeToMain called twice: once for conflict, once for retry
    expect(worktreeManager.mergeWorktreeToMain).toHaveBeenCalledTimes(2);
    // writeFileSync uses structured resolved_content, not raw prose
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('src/index.ts'),
      'const a = 1; // resolved\n',
      'utf-8'
    );
  });

  it('if LLM resolution confidence is low, emits human_escalation event and returns escalated status', async () => {
    worktreeManager.mergeWorktreeToMain.mockResolvedValue({
      success: false,
      conflicted: true,
      conflicts: ['src/index.ts'],
    });

    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      '<<<<<<< HEAD\nconst a = 1;\n=======\nconst a = 2;\n>>>>>>> branch\n'
    );

    gateway.generateObject.mockResolvedValue({
      object: {
        confidence: 'low',
        files: [],
      },
      usage: mockUsage,
    });

    queue.enqueue(makeEntry());
    const outcome = await queue.processNext(testRunner);

    expect(outcome?.status).toBe('escalated');
    expect(mockAppendEvent).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'merge_escalation_needed' })
    );
    // worktree NOT removed on escalation
    expect(worktreeManager.removeWorktree).not.toHaveBeenCalled();
  });

  it('if generateObject throws NoObjectGeneratedError, merge fails explicitly (CONC-05)', async () => {
    const { NoObjectGeneratedError } = await import('ai');

    worktreeManager.mergeWorktreeToMain.mockResolvedValue({
      success: false,
      conflicted: true,
      conflicts: ['src/index.ts'],
    });

    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      '<<<<<<< HEAD\nconst a = 1;\n=======\nconst a = 2;\n>>>>>>> branch\n'
    );

    gateway.generateObject.mockRejectedValue(
      new NoObjectGeneratedError({
        message: 'Failed to generate valid object',
        text: undefined,
        response: { id: 'test', timestamp: new Date(), modelId: 'test-model' },
        usage: mockUsageZero,
        finishReason: 'error',
      })
    );

    queue.enqueue(makeEntry());
    await expect(queue.processNext(testRunner)).rejects.toThrow(NoObjectGeneratedError);
  });

  // -------------------------------------------------------------------------
  // Post-merge test failure
  // -------------------------------------------------------------------------
  it('if post-merge tests fail, reverts merge (git reset --hard HEAD~1) and flags bead (D-16)', async () => {
    // Make exec fail for the test command (exec(cmd, opts, callback) signature)
    (childProcess.exec as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_cmd: string, _opts: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
        callback(new Error('test failed'), '', 'Tests failed: 3 errors');
      }
    );

    queue.enqueue(makeEntry());
    const outcome = await queue.processNext(testRunner);

    expect(outcome?.status).toBe('reverted');
    // git reset --hard HEAD~1 called
    expect(mockRaw).toHaveBeenCalledWith(['reset', '--hard', 'HEAD~1']);
  });

  it('failed merges retain worktree — removeWorktree NOT called (D-18)', async () => {
    // Make exec fail for the test command
    (childProcess.exec as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_cmd: string, _opts: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
        callback(new Error('test failed'), '', 'Tests failed');
      }
    );

    queue.enqueue(makeEntry());
    await queue.processNext(testRunner);

    expect(worktreeManager.removeWorktree).not.toHaveBeenCalled();
  });

  it('on post-merge test failure, emits merge_reverted event', async () => {
    (childProcess.exec as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_cmd: string, _opts: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
        callback(new Error('test failed'), '', 'Tests failed');
      }
    );

    queue.enqueue(makeEntry());
    await queue.processNext(testRunner);

    expect(mockAppendEvent).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'merge_reverted' })
    );
  });

  // -------------------------------------------------------------------------
  // processAll
  // -------------------------------------------------------------------------
  it('processAll processes all entries in topological order sequentially', async () => {
    const e2 = makeEntry({ beadId: 'bead-002', topologicalOrder: 2 });
    const e1 = makeEntry({ beadId: 'bead-001', topologicalOrder: 1 });
    const e3 = makeEntry({ beadId: 'bead-003', topologicalOrder: 3 });

    queue.enqueue(e2);
    queue.enqueue(e1);
    queue.enqueue(e3);

    const outcomes = await queue.processAll(testRunner);

    expect(outcomes).toHaveLength(3);
    expect(outcomes[0]!.beadId).toBe('bead-001');
    expect(outcomes[1]!.beadId).toBe('bead-002');
    expect(outcomes[2]!.beadId).toBe('bead-003');
  });
});
