import * as childProcess from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import type { MergeQueueEntry, TestRunnerConfig } from './types.js';
import type { WorktreeManager } from './worktree-manager.js';
import type { KnowledgeGraphAdapter } from '../intelligence/adapter.js';
import type { LLMGateway } from '../gateway/gateway.js';
import type { DbClient } from '@get-cauldron/shared';
import { appendEvent } from '@get-cauldron/shared';

export type MergeStatus = 'merged' | 'conflict_resolved' | 'escalated' | 'reverted' | 'failed';

export interface MergeOutcome {
  beadId: string;
  status: MergeStatus;
  conflicts?: string[];
  error?: string;
}

/**
 * Promise wrapper around child_process.exec that is mock-friendly.
 * We avoid promisify() because the real exec has a util.promisify.custom symbol
 * that changes the resolution shape ({stdout, stderr}) — but mocked exec does not.
 */
function execPromise(cmd: string, cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    childProcess.exec(cmd, { cwd }, (err, stdout, stderr) => {
      if (err) {
        reject(Object.assign(err, { stdout: stdout ?? '', stderr: stderr ?? '' }));
      } else {
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    });
  });
}

/**
 * Serializes completed bead worktrees back to main in DAG topological order.
 *
 * Key behaviors (as specified in 06-04-PLAN.md):
 * - D-15: Processes in topological order (not FIFO)
 * - D-14: LLM-assisted conflict resolution with human escalation fallback
 * - D-16: Post-merge test re-run with automatic revert on failure
 * - D-05 / CODE-03: Knowledge graph re-indexed after each successful merge
 * - D-18: Worktree cleaned up on success, retained on failure
 */
export class MergeQueue {
  private queue: MergeQueueEntry[] = [];

  constructor(
    private readonly worktreeManager: WorktreeManager,
    private readonly knowledgeGraph: KnowledgeGraphAdapter,
    private readonly gateway: LLMGateway,
    private readonly db: DbClient,
    private readonly projectRoot: string
  ) {}

  /**
   * Add an entry to the queue, maintaining sort by topologicalOrder ascending (D-15).
   */
  enqueue(entry: MergeQueueEntry): void {
    this.queue.push(entry);
    this.queue.sort((a, b) => a.topologicalOrder - b.topologicalOrder);
  }

  /** Returns the number of entries waiting to be processed. */
  size(): number {
    return this.queue.length;
  }

  /**
   * Process the next entry (lowest topological order).
   * Returns null if the queue is empty.
   */
  async processNext(testRunner: TestRunnerConfig): Promise<MergeOutcome | null> {
    const entry = this.queue.shift();
    if (!entry) {
      return null;
    }
    return this.processMerge(entry, testRunner);
  }

  /**
   * Process all queued entries sequentially in topological order.
   */
  async processAll(testRunner: TestRunnerConfig): Promise<MergeOutcome[]> {
    const outcomes: MergeOutcome[] = [];
    while (this.queue.length > 0) {
      const outcome = await this.processNext(testRunner);
      if (outcome) {
        outcomes.push(outcome);
      }
    }
    return outcomes;
  }

  /**
   * Full merge lifecycle for a single bead entry.
   */
  private async processMerge(
    entry: MergeQueueEntry,
    testRunner: TestRunnerConfig
  ): Promise<MergeOutcome> {
    // Step 1: Attempt merge
    let mergeResult = await this.worktreeManager.mergeWorktreeToMain(
      entry.beadId,
      entry.branch
    );

    // Step 2: Handle conflicts
    if (mergeResult.conflicted) {
      const resolution = await this.resolveConflict(entry, mergeResult.conflicts ?? []);

      if (resolution.confidence === 'high') {
        // Resolution committed — retry the merge
        mergeResult = await this.worktreeManager.mergeWorktreeToMain(
          entry.beadId,
          entry.branch
        );
        if (!mergeResult.success || mergeResult.conflicted) {
          // Retry still failed — escalate
          await this.emitEscalationEvent(entry, mergeResult.conflicts ?? []);
          return {
            beadId: entry.beadId,
            status: 'escalated',
            conflicts: mergeResult.conflicts,
          };
        }
        // Fall through to post-merge tests with conflict_resolved status
        const { passed, errors } = await this.runPostMergeTests(testRunner);
        if (!passed) {
          await this.revertMerge(entry, errors);
          return { beadId: entry.beadId, status: 'reverted', error: errors.join('\n') };
        }
        await this.onMergeSuccess(entry);
        return { beadId: entry.beadId, status: 'conflict_resolved' };
      } else {
        // Low confidence — abort and escalate
        await this.emitEscalationEvent(entry, mergeResult.conflicts ?? []);
        return {
          beadId: entry.beadId,
          status: 'escalated',
          conflicts: mergeResult.conflicts ?? [],
        };
      }
    }

    // Step 3: Post-merge tests (no conflict path)
    const { passed, errors } = await this.runPostMergeTests(testRunner);
    if (!passed) {
      await this.revertMerge(entry, errors);
      return { beadId: entry.beadId, status: 'reverted', error: errors.join('\n') };
    }

    await this.onMergeSuccess(entry);
    return { beadId: entry.beadId, status: 'merged' };
  }

  /**
   * Attempt LLM-assisted conflict resolution (D-14).
   *
   * Reads conflict markers from conflicted files, sends them to the gateway
   * with stage='conflict_resolution', and writes resolved content if confidence is high.
   */
  private async resolveConflict(
    entry: MergeQueueEntry,
    conflicts: string[]
  ): Promise<{ resolved: boolean; confidence: 'high' | 'low' }> {
    // Read conflicted file contents for the prompt
    const conflictDetails: string[] = [];
    for (const file of conflicts) {
      try {
        const content = readFileSync(join(this.projectRoot, file), 'utf-8');
        conflictDetails.push(`=== ${file} ===\n${content}`);
      } catch {
        conflictDetails.push(`=== ${file} === (could not read file)`);
      }
    }

    const prompt = [
      `Bead ID: ${entry.beadId}`,
      `Project ID: ${entry.projectId}`,
      `Conflicted files:`,
      ...conflictDetails,
      '',
      'Resolve each conflict. If you cannot resolve confidently, include "confidence": "low" in your response.',
      'Otherwise, include "confidence": "high" and provide the resolved file contents.',
    ].join('\n');

    const result = await this.gateway.generateText({
      stage: 'conflict_resolution',
      prompt,
      projectId: entry.projectId,
      beadId: entry.beadId,
    });

    const responseText: string = result?.text ?? '';
    const isLowConfidence =
      responseText.includes('"confidence": "low"') ||
      responseText.includes("confidence: 'low'") ||
      responseText.includes('confidence: low');

    if (isLowConfidence) {
      // Abort merge to leave working tree clean
      const git = simpleGit(this.projectRoot);
      try {
        await git.raw(['merge', '--abort']);
      } catch {
        // merge --abort may fail if there's nothing to abort; ignore
      }
      return { resolved: false, confidence: 'low' };
    }

    // High confidence — write resolved files
    for (const file of conflicts) {
      try {
        // The LLM response is used as-is for the resolved content.
        // In production, a more structured extraction would parse per-file blocks.
        writeFileSync(join(this.projectRoot, file), responseText, 'utf-8');
      } catch {
        // If write fails, fall back to low confidence behavior
        const git = simpleGit(this.projectRoot);
        try {
          await git.raw(['merge', '--abort']);
        } catch {
          // ignore
        }
        return { resolved: false, confidence: 'low' };
      }
    }

    // Stage resolved files
    const git = simpleGit(this.projectRoot);
    for (const file of conflicts) {
      await git.add(file);
    }

    return { resolved: true, confidence: 'high' };
  }

  /**
   * Run the full post-merge test suite (typecheck + unit + integration).
   * Returns pass/fail with accumulated error output (D-16).
   */
  private async runPostMergeTests(
    testRunner: TestRunnerConfig
  ): Promise<{ passed: boolean; errors: string[] }> {
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
        await execPromise(cmd, this.projectRoot);
      } catch (err: unknown) {
        const e = err as { stderr?: string; message?: string };
        errors.push(e.stderr ?? e.message ?? String(err));
        // Stop on first failure to avoid noise
        break;
      }
    }

    return { passed: errors.length === 0, errors };
  }

  /**
   * Revert a failed post-merge commit (D-16) and emit a merge_reverted event.
   * Worktree is intentionally NOT removed (D-18).
   */
  private async revertMerge(entry: MergeQueueEntry, errors: string[]): Promise<void> {
    const git = simpleGit(this.projectRoot);
    await git.raw(['reset', '--hard', 'HEAD~1']);

    // D-18: Worktree is intentionally retained on failure so the developer can
    // inspect the failing state. removeWorktree is only called on success (onMergeSuccess).

    await appendEvent(this.db, {
      projectId: entry.projectId,
      seedId: entry.seedId,
      beadId: entry.beadId,
      type: 'merge_reverted',
      payload: {
        beadId: entry.beadId,
        errors,
        reason: 'post_merge_test_failure',
      },
    });
  }

  /**
   * Called after a successful merge + passing tests.
   * Triggers re-index (D-05, CODE-03), cleans up worktree (D-18), and emits bead_merged.
   */
  private async onMergeSuccess(entry: MergeQueueEntry): Promise<void> {
    // Re-index knowledge graph (D-05, CODE-03)
    await this.knowledgeGraph.indexRepository();

    // Clean up worktree (D-18: success path only)
    await this.worktreeManager.removeWorktree(entry.beadId);

    // Emit event
    await appendEvent(this.db, {
      projectId: entry.projectId,
      seedId: entry.seedId,
      beadId: entry.beadId,
      type: 'bead_merged',
      payload: { beadId: entry.beadId },
    });
  }

  /**
   * Emit the merge_escalation_needed event (D-14 human escalation fallback).
   */
  private async emitEscalationEvent(
    entry: MergeQueueEntry,
    conflicts: string[]
  ): Promise<void> {
    await appendEvent(this.db, {
      projectId: entry.projectId,
      seedId: entry.seedId,
      beadId: entry.beadId,
      type: 'merge_escalation_needed',
      payload: {
        beadId: entry.beadId,
        conflicts,
        reason: 'llm_confidence_low',
      },
    });
  }
}
