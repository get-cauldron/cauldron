import { execSync } from 'node:child_process';

/**
 * Captures the current git commit hash of the engine at run start.
 * Used for self-build safety: if Cauldron is modifying itself, we need to detect
 * when the running engine changes during a bead execution run.
 *
 * Implements D-12, D-13: engine snapshot for self-build safety.
 */
export function captureEngineSnapshot(projectRoot: string): string {
  const hash = execSync('git rev-parse HEAD', { cwd: projectRoot }).toString().trim();
  return hash;
}

/**
 * Detects whether the engine has changed since the snapshot was taken.
 * Returns true if the current HEAD differs from the snapshot hash.
 *
 * Used to warn users that the running engine changed during a self-build run,
 * which could indicate the new engine code hasn't been restarted.
 */
export function detectEngineChange(snapshotHash: string, projectRoot: string): boolean {
  const currentHash = execSync('git rev-parse HEAD', { cwd: projectRoot }).toString().trim();
  return currentHash !== snapshotHash;
}

/**
 * Checks whether a git diff output contains any migration file paths.
 * Migration files in bead diffs trigger human review escalation (D-12, D-13).
 *
 * A migration file is any path under packages/shared/src/db/migrations/.
 */
export function hasMigrationFiles(diffOutput: string): boolean {
  return diffOutput.includes('packages/shared/src/db/migrations/');
}

/**
 * Gets the diff of a bead's branch vs main, listing changed file paths.
 * Used by the merge queue to detect migration files before merging.
 */
export function getBeadDiff(projectRoot: string, beadBranch: string): string {
  return execSync(`git diff main...${beadBranch} --name-only`, { cwd: projectRoot }).toString();
}
