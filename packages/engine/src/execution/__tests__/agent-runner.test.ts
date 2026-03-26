import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Hoisted mock factories (vi.mock is hoisted to top of file) ----
const { mockExec, mockWriteFileSync, mockMkdirSync } = vi.hoisted(() => ({
  mockExec: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockMkdirSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  exec: mockExec,
}));

vi.mock('node:fs', () => ({
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
}));

import { AgentRunner } from '../agent-runner.js';
import type { LLMGateway } from '../../gateway/gateway.js';
import type { WorktreeManager } from '../worktree-manager.js';
import type { TddLoopOptions, AgentContext, TestRunnerConfig } from '../types.js';

// ---- Helpers ----

function buildTestRunner(overrides: Partial<TestRunnerConfig> = {}): TestRunnerConfig {
  return {
    unitCommand: 'vitest run --testPathPattern=unit',
    integrationCommand: 'vitest run --testPathPattern=integration',
    typecheckCommand: 'tsc --noEmit',
    ...overrides,
  };
}

function buildAgentContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    seedExcerpt: '## Goal\nBuild a renaming tool.',
    beadSpec: 'Implement file rename with regex pattern support.',
    beadTitle: 'File Rename Core',
    codeSnippets: [],
    dependencyOutputs: [],
    testRunner: buildTestRunner(),
    systemPrompt: 'You are an implementation agent. Write tests first.',
    totalTokenEstimate: 5000,
    ...overrides,
  };
}

function buildOptions(overrides: Partial<TddLoopOptions> = {}): TddLoopOptions {
  return {
    agentContext: buildAgentContext(),
    worktreePath: '/test/project/.cauldron/worktrees/bead-abc12345',
    beadId: 'bead-abc12345-full-uuid',
    projectId: 'proj-001',
    seedId: 'seed-001',
    maxIterations: 5,
    ...overrides,
  };
}

// Agent LLM response with a code block
const CODE_BLOCK_RESPONSE = `Here is the test file:

\`\`\`typescript
// src/__tests__/rename.test.ts
import { rename } from '../rename.js';
describe('rename', () => { it('works', () => expect(rename('a', /a/, 'b')).toBe('b')); });
\`\`\`
`;

const IMPL_BLOCK_RESPONSE = `Here is the implementation:

\`\`\`typescript
// src/rename.ts
export function rename(str: string, pattern: RegExp, replacement: string): string {
  return str.replace(pattern, replacement);
}
\`\`\`
`;

// Utility: make exec resolve (pass) for a command
// exec callback signature is (err, stdout: string, stderr: string)
function execSuccess(stdout = '', stderr = '') {
  return (_cmd: string, _opts: unknown, cb: (err: null, stdout: string, stderr: string) => void) => {
    cb(null, stdout, stderr);
  };
}

// Utility: make exec reject (fail) for a command
function execFail(stderr = 'Error: tests failed') {
  return (_cmd: string, _opts: unknown, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
    cb(new Error(stderr), '', stderr);
  };
}

describe('AgentRunner', () => {
  let mockGateway: { generateText: ReturnType<typeof vi.fn> };
  let mockWorktreeManager: { commitWorktreeChanges: ReturnType<typeof vi.fn> };
  let runner: AgentRunner;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGateway = {
      generateText: vi.fn(),
    };

    mockWorktreeManager = {
      commitWorktreeChanges: vi.fn().mockResolvedValue('abc1234'),
    };

    runner = new AgentRunner(
      mockGateway as unknown as LLMGateway,
      mockWorktreeManager as unknown as WorktreeManager
    );

    // Default: generateText returns tests on first call, impl on subsequent
    mockGateway.generateText
      .mockResolvedValueOnce({ text: CODE_BLOCK_RESPONSE })
      .mockResolvedValue({ text: IMPL_BLOCK_RESPONSE });

    // Default: all exec commands succeed
    mockExec.mockImplementation(execSuccess());
  });

  it('iteration 0 calls agentGenerateTests first (TDD — tests before implementation)', async () => {
    const options = buildOptions();
    await runner.runWithTddLoop(options);

    // First gateway call should be the test generation call
    expect(mockGateway.generateText).toHaveBeenCalled();
    const firstCall = mockGateway.generateText.mock.calls[0]![0];
    expect(firstCall.prompt).toMatch(/test|spec/i);
  });

  it('calls agentGenerateImplementation after test generation', async () => {
    const options = buildOptions();
    await runner.runWithTddLoop(options);

    // Should have called generateText at least twice: tests + implementation
    expect(mockGateway.generateText.mock.calls.length).toBeGreaterThanOrEqual(2);
    const secondCall = mockGateway.generateText.mock.calls[1]![0];
    expect(secondCall.prompt).toMatch(/implement|implementation/i);
  });

  it('runs unit tests, integration tests, and typecheck after implementation', async () => {
    const options = buildOptions();
    await runner.runWithTddLoop(options);

    // Check that exec was called with unit, integration, typecheck commands
    const execCalls = mockExec.mock.calls.map((c) => c[0] as string);
    expect(execCalls.some((cmd) => cmd.includes('vitest run --testPathPattern=unit'))).toBe(true);
    expect(execCalls.some((cmd) => cmd.includes('vitest run --testPathPattern=integration'))).toBe(true);
    expect(execCalls.some((cmd) => cmd.includes('tsc --noEmit'))).toBe(true);
  });

  it('does NOT run E2E command when testRunner.e2eCommand is undefined', async () => {
    const options = buildOptions({
      agentContext: buildAgentContext({
        testRunner: buildTestRunner({ e2eCommand: undefined }),
      }),
    });
    await runner.runWithTddLoop(options);

    const execCalls = mockExec.mock.calls.map((c) => c[0] as string);
    expect(execCalls.some((cmd) => cmd.includes('playwright'))).toBe(false);
  });

  it('runs E2E command when testRunner.e2eCommand is defined', async () => {
    const options = buildOptions({
      agentContext: buildAgentContext({
        testRunner: buildTestRunner({ e2eCommand: 'npx playwright test' }),
      }),
    });
    await runner.runWithTddLoop(options);

    const execCalls = mockExec.mock.calls.map((c) => c[0] as string);
    expect(execCalls.some((cmd) => cmd.includes('playwright'))).toBe(true);
  });

  it('returns { success: true, iterations: 1 } when all tests pass on first iteration', async () => {
    const options = buildOptions();
    mockExec.mockImplementation(execSuccess());

    const result = await runner.runWithTddLoop(options);

    expect(result.success).toBe(true);
    expect(result.iterations).toBe(1);
  });

  it('passes error output to next iteration via previousErrors when tests fail', async () => {
    // First verification: fail; second: pass
    let execCallCount = 0;
    mockExec.mockImplementation((_cmd: string, _opts: unknown, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
      execCallCount++;
      // Fail on first verification round (calls 1-3), pass on second round (calls 4+)
      if (execCallCount <= 3) {
        cb(new Error('Test failure'), '', 'FAIL: expected 1 to equal 2');
      } else {
        cb(null, 'All tests passed', '');
      }
    });

    const options = buildOptions();
    const result = await runner.runWithTddLoop(options);

    expect(result.success).toBe(true);
    expect(result.iterations).toBe(2);

    // Second implementation call should include previousErrors
    const implCallOnRetry = mockGateway.generateText.mock.calls[2]; // 0=tests, 1=impl-iter0, 2=impl-iter1
    expect(implCallOnRetry![0].prompt).toMatch(/FAIL|error|fail/i);
  });

  it('returns { success: false, iterations: maxIterations } after max iterations with failures', async () => {
    // All verifications fail
    mockExec.mockImplementation(execFail('Persistent test failures'));

    const options = buildOptions({ maxIterations: 3 });
    const result = await runner.runWithTddLoop(options);

    expect(result.success).toBe(false);
    expect(result.iterations).toBe(3);
    expect(result.finalErrors).toBeDefined();
    expect(result.finalErrors!.length).toBeGreaterThan(0);
  });

  it('system prompt includes anti-mocking directive', async () => {
    const options = buildOptions({
      agentContext: buildAgentContext({
        systemPrompt: 'You are an implementation agent. Prefer real integrations over mocks.',
      }),
    });
    await runner.runWithTddLoop(options);

    const callArgs = mockGateway.generateText.mock.calls[0]![0];
    expect(callArgs.system).toMatch(/mock|real.*integrations/i);
  });

  it('calls commitWorktreeChanges after each successful implementation iteration', async () => {
    const options = buildOptions();
    await runner.runWithTddLoop(options);

    expect(mockWorktreeManager.commitWorktreeChanges).toHaveBeenCalledWith(
      options.worktreePath,
      expect.stringContaining(options.beadId.slice(0, 8))
    );
  });

  it('throws error when agent attempts to write outside worktree scope', async () => {
    // Agent response with path-traversal attempt — use a .ts extension so regex matches
    const ESCAPE_RESPONSE = `
\`\`\`typescript
// ../../etc/malicious.ts
export const evil = true;
\`\`\`
`;
    mockGateway.generateText.mockResolvedValue({ text: ESCAPE_RESPONSE });

    const options = buildOptions();
    await expect(runner.runWithTddLoop(options)).rejects.toThrow(/outside worktree/i);
  });

  it('populates filesModified from git diff output after successful verification', async () => {
    // exec callback is (err, stdout: string, stderr: string) — not (err, {stdout, stderr})
    mockExec.mockImplementation((_cmd: string, _opts: unknown, cb: (err: null | Error, stdout?: string, stderr?: string) => void) => {
      const cmd = _cmd as string;
      if (cmd.includes('git diff')) {
        cb(null, 'src/rename.ts\nsrc/__tests__/rename.test.ts\n', '');
      } else {
        cb(null, '', '');
      }
    });

    const options = buildOptions();
    const result = await runner.runWithTddLoop(options);

    expect(result.success).toBe(true);
    expect(result.filesModified).toBeDefined();
    expect(result.filesModified!).toContain('src/rename.ts');
  });
});
