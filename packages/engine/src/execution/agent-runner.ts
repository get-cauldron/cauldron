import { exec } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import type { TddLoopOptions, ExecutionResult, AgentContext, TestRunnerConfig } from './types.js';
import type { LLMGateway } from '../gateway/gateway.js';
import type { WorktreeManager } from './worktree-manager.js';

/** Parsed output from an agent LLM response — a file path and its content */
interface AgentOutput {
  filePath: string;
  content: string;
}

/** Anti-mocking directive injected into every agent system prompt (TEST-04, D-20) */
const ANTI_MOCKING_DIRECTIVE = `
Prefer real integrations over mocks. Only mock true external services (third-party APIs, payment providers, hardware devices).
Do not mock the database, filesystem, or internal modules in integration tests.
`.trim();

/**
 * Wraps node's exec with a promise interface.
 * Uses a manual wrapper (not promisify) because mocked exec in tests may
 * not carry util.promisify.custom, causing destructuring to yield undefined.
 */
function execPromise(
  cmd: string,
  options: { cwd: string }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(cmd, options, (err, stdout, stderr) => {
      if (err) {
        reject(Object.assign(err, { stdout: stdout ?? '', stderr: stderr ?? '' }));
      } else {
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    });
  });
}

/**
 * AgentRunner orchestrates the TDD self-healing loop for a single bead.
 *
 * Loop structure per D-19, D-20, D-22:
 *   iteration 0: generate tests first, then implementation
 *   iteration 1+: regenerate implementation with error feedback
 *   up to maxIterations (default 5) before declaring failure
 */
export class AgentRunner {
  constructor(
    private readonly gateway: LLMGateway,
    private readonly worktreeManager: WorktreeManager
  ) {}

  /**
   * Run the TDD self-healing loop for a bead.
   * Returns ExecutionResult with success flag, iteration count, and modified files.
   */
  async runWithTddLoop(options: TddLoopOptions): Promise<ExecutionResult> {
    const { agentContext, worktreePath, beadId, projectId, maxIterations } = options;
    let currentContext: AgentContext = { ...agentContext };

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // Phase A: Generate tests first on iteration 0 (TDD — D-19)
      if (iteration === 0) {
        const testOutputs = await this.agentGenerateTests(currentContext, worktreePath, projectId);
        await this.writeAgentOutput(testOutputs, worktreePath);
      }

      // Phase B: Generate/update implementation
      const implOutputs = await this.agentGenerateImplementation(
        currentContext,
        worktreePath,
        iteration,
        projectId
      );
      await this.writeAgentOutput(implOutputs, worktreePath);

      // Phase C: Commit current state
      await this.worktreeManager.commitWorktreeChanges(
        worktreePath,
        `bead(${beadId.slice(0, 8)}): iteration ${iteration + 1}`
      );

      // Phase D: Run verification (all test levels + typecheck)
      const verifyResult = await this.runVerification(worktreePath, currentContext.testRunner);

      if (verifyResult.allPassed) {
        const filesModified = await this.getModifiedFiles(worktreePath);
        return { success: true, iterations: iteration + 1, filesModified };
      }

      // Pass errors back to next iteration
      currentContext = { ...currentContext, previousErrors: verifyResult.errors };
    }

    return {
      success: false,
      iterations: maxIterations,
      finalErrors: currentContext.previousErrors,
    };
  }

  /**
   * Phase A: Ask agent to write tests first from the bead spec.
   * Returns parsed code blocks with file paths and content.
   */
  private async agentGenerateTests(
    context: AgentContext,
    _worktreePath: string,
    projectId: string
  ): Promise<AgentOutput[]> {
    const systemWithAntiMock = `${context.systemPrompt}\n\n${ANTI_MOCKING_DIRECTIVE}`;

    const testPrompt = [
      '## Task: Write tests FIRST (TDD)',
      '',
      'Before writing any implementation, write comprehensive tests that capture the bead requirements.',
      'Cover: unit tests for each function, integration tests for wiring, edge cases, and error paths.',
      '',
      '## Seed Excerpt',
      context.seedExcerpt,
      '',
      '## Bead Specification',
      context.beadSpec,
      ...(context.codeSnippets.length > 0
        ? [
            '',
            '## Existing Code Context',
            ...context.codeSnippets.map(
              (s) => `### ${s.qualifiedName} (${s.filePath})\n\`\`\`typescript\n${s.code}\n\`\`\``
            ),
          ]
        : []),
      '',
      'Respond with test files using code blocks prefixed with the file path:',
      '```typescript',
      '// path/to/file.test.ts',
      '// ... test code',
      '```',
    ].join('\n');

    const result = await this.gateway.generateText({
      stage: 'implementation',
      system: systemWithAntiMock,
      prompt: testPrompt,
      projectId,
    });

    return this.parseCodeBlocks(result.text);
  }

  /**
   * Phase B: Ask agent to implement code to make the tests pass.
   * On retry iterations, includes the previous error output.
   */
  private async agentGenerateImplementation(
    context: AgentContext,
    _worktreePath: string,
    iteration: number,
    projectId: string
  ): Promise<AgentOutput[]> {
    const systemWithAntiMock = `${context.systemPrompt}\n\n${ANTI_MOCKING_DIRECTIVE}`;

    const errorSection =
      iteration > 0 && context.previousErrors && context.previousErrors.length > 0
        ? [
            '',
            '## Test/Typecheck Failures from Previous Iteration',
            'The following errors occurred. Read them carefully and fix your implementation:',
            '',
            ...context.previousErrors,
            '',
            'Do NOT modify test files to make them pass — fix the implementation.',
          ].join('\n')
        : '';

    const implPrompt = [
      '## Task: Implement code to make the tests pass',
      '',
      '## Bead Specification',
      context.beadSpec,
      ...(context.codeSnippets.length > 0
        ? [
            '',
            '## Existing Code Context',
            ...context.codeSnippets.map(
              (s) => `### ${s.qualifiedName} (${s.filePath})\n\`\`\`typescript\n${s.code}\n\`\`\``
            ),
          ]
        : []),
      ...(context.dependencyOutputs.length > 0
        ? ['', '## Dependency Outputs', ...context.dependencyOutputs]
        : []),
      errorSection,
      '',
      'Respond with implementation files using code blocks prefixed with the file path:',
      '```typescript',
      '// path/to/implementation.ts',
      '// ... implementation code',
      '```',
    ].join('\n');

    const result = await this.gateway.generateText({
      stage: 'implementation',
      system: systemWithAntiMock,
      prompt: implPrompt,
      projectId,
    });

    return this.parseCodeBlocks(result.text);
  }

  /**
   * Write agent-generated files into the worktree.
   * Validates each path stays within the worktree scope (EXEC-08).
   */
  private async writeAgentOutput(outputs: AgentOutput[], worktreePath: string): Promise<void> {
    const resolvedWorktree = resolve(worktreePath);

    for (const output of outputs) {
      const absolutePath = resolve(join(worktreePath, output.filePath));

      // EXEC-08: Prevent path traversal — file must stay within worktree
      if (!absolutePath.startsWith(resolvedWorktree)) {
        throw new Error(
          `Agent attempted to write outside worktree scope: ${output.filePath}`
        );
      }

      mkdirSync(dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, output.content, 'utf8');
    }
  }

  /**
   * Run all verification steps in order.
   * Collects errors from failed commands and returns aggregate result.
   * E2E tests only run when testRunner.e2eCommand is defined (D-23).
   */
  private async runVerification(
    worktreePath: string,
    testRunner: TestRunnerConfig
  ): Promise<{ allPassed: boolean; errors: string[] }> {
    const commands = [
      testRunner.typecheckCommand,
      testRunner.unitCommand,
      testRunner.integrationCommand,
    ];

    if (testRunner.e2eCommand) {
      commands.push(testRunner.e2eCommand);
    }

    const errors: string[] = [];

    for (const cmd of commands) {
      try {
        await execPromise(cmd, { cwd: worktreePath });
      } catch (err) {
        const error = err as Error & { stdout?: string; stderr?: string };
        const output = [
          `Command failed: ${cmd}`,
          error.stderr ?? '',
          error.stdout ?? '',
          error.message,
        ]
          .filter(Boolean)
          .join('\n');
        errors.push(output);
      }
    }

    return { allPassed: errors.length === 0, errors };
  }

  /**
   * Get list of files modified since the previous commit.
   */
  private async getModifiedFiles(worktreePath: string): Promise<string[]> {
    try {
      const { stdout } = await execPromise('git diff --name-only HEAD~1', { cwd: worktreePath });
      return stdout
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean);
    } catch {
      // On very first commit HEAD~1 doesn't exist — fall back to HEAD
      try {
        const { stdout } = await execPromise('git diff --name-only HEAD', { cwd: worktreePath });
        return stdout
          .split('\n')
          .map((f) => f.trim())
          .filter(Boolean);
      } catch {
        return [];
      }
    }
  }

  /**
   * Parse code blocks from an LLM response.
   * Extracts file paths from the first line comment and content from the block body.
   *
   * Expected format:
   * ```typescript
   * // path/to/file.ts
   * ... code ...
   * ```
   */
  private parseCodeBlocks(text: string): AgentOutput[] {
    const outputs: AgentOutput[] = [];
    // Match fenced code blocks (typescript, ts, or plain)
    const codeBlockRegex = /```(?:typescript|ts|javascript|js)?\n([\s\S]*?)```/g;

    let match: RegExpExecArray | null;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      const blockContent = match[1]!;
      const lines = blockContent.split('\n');
      if (lines.length === 0) continue;

      // First line should be a comment with the file path
      const firstLine = lines[0]!.trim();
      const pathMatch = firstLine.match(/^\/\/\s*(.+\.(?:ts|js|tsx|jsx|json|md|yaml|yml))$/);
      if (!pathMatch) continue;

      const filePath = pathMatch[1]!.trim();
      const content = lines.slice(1).join('\n');

      outputs.push({ filePath, content });
    }

    return outputs;
  }
}
