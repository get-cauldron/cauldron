import { existsSync } from 'node:fs';
import { simpleGit } from 'simple-git';
import type { WorktreeInfo, MergeResult } from './types.js';

/**
 * Manages git worktrees for parallel bead execution.
 * Each bead gets its own isolated worktree to prevent cross-agent interference.
 */
export class WorktreeManager {
  constructor(private readonly projectRoot: string) {}

  /**
   * Create a worktree for a bead.
   * Idempotent: if the worktree path already exists, returns cached result.
   */
  async createWorktree(beadId: string): Promise<WorktreeInfo> {
    const shortId = beadId.slice(0, 8);
    const branch = `cauldron/bead-${shortId}`;
    const worktreePath = `${this.projectRoot}/.cauldron/worktrees/${beadId}`;

    // Idempotency check per Research Pitfall 8
    if (existsSync(worktreePath)) {
      return { path: worktreePath, branch, beadId };
    }

    const git = simpleGit(this.projectRoot);

    // Branch cleanup per Research Pitfall 3: delete stale branch if it exists before creating worktree
    try {
      await git.deleteLocalBranch(branch, true);
    } catch {
      // Branch doesn't exist — expected on first run, ignore
    }

    await git.raw(['worktree', 'add', '-b', branch, worktreePath]);

    return { path: worktreePath, branch, beadId };
  }

  /**
   * Remove a worktree and clean up the associated branch.
   */
  async removeWorktree(beadId: string): Promise<void> {
    const worktreePath = `${this.projectRoot}/.cauldron/worktrees/${beadId}`;
    const git = simpleGit(this.projectRoot);

    await git.raw(['worktree', 'remove', '--force', worktreePath]);
    await git.raw(['worktree', 'prune']);
    await git.deleteLocalBranch(`cauldron/bead-${beadId.slice(0, 8)}`, true);
  }

  /**
   * Stage and commit all changes within a worktree.
   * Returns the short commit hash.
   */
  async commitWorktreeChanges(worktreePath: string, message: string): Promise<string> {
    const git = simpleGit(worktreePath);
    await git.add('.');
    const result = await git.commit(message);
    return result.commit;
  }

  /**
   * Merge a bead's branch into main.
   * Returns success or conflict info.
   */
  async mergeWorktreeToMain(beadId: string, branch: string): Promise<MergeResult> {
    const git = simpleGit(this.projectRoot);
    await git.checkout('main');

    try {
      await git.merge([branch, '--no-ff', '-m', `Merge bead ${beadId}`]);
      return { success: true, conflicted: false };
    } catch {
      const status = await git.status();
      return {
        success: false,
        conflicted: true,
        conflicts: status.conflicted,
      };
    }
  }
}
