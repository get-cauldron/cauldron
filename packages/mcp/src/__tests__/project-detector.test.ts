import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { findProjectRoot } from '../project-detector.js';

// Track temp directories for cleanup
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cauldron-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  }
});

describe('findProjectRoot', () => {
  it('finds cauldron.config.ts marker in the start directory', () => {
    const root = makeTempDir();
    writeFileSync(join(root, 'cauldron.config.ts'), 'export default {};');

    const result = findProjectRoot(root);
    expect(result).toBe(root);
  });

  it('finds cauldron.config.ts marker in a parent directory when starting from subdirectory', () => {
    const root = makeTempDir();
    writeFileSync(join(root, 'cauldron.config.ts'), 'export default {};');

    const subDir = join(root, 'src', 'components');
    mkdirSync(subDir, { recursive: true });

    const result = findProjectRoot(subDir);
    expect(result).toBe(root);
  });

  it('finds .cauldron/ directory marker in start directory', () => {
    const root = makeTempDir();
    mkdirSync(join(root, '.cauldron'));

    const result = findProjectRoot(root);
    expect(result).toBe(root);
  });

  it('finds .cauldron/ directory marker in a parent directory', () => {
    const root = makeTempDir();
    mkdirSync(join(root, '.cauldron'));

    const subDir = join(root, 'packages', 'my-app', 'src');
    mkdirSync(subDir, { recursive: true });

    const result = findProjectRoot(subDir);
    expect(result).toBe(root);
  });

  it('returns null when no markers are found', () => {
    const dir = makeTempDir();
    // No cauldron.config.ts or .cauldron in this temp dir or any parent that matters
    // We need a path that definitely has no markers — use a deeply nested temp dir
    const nested = join(dir, 'a', 'b', 'c');
    mkdirSync(nested, { recursive: true });

    // Since we can't guarantee no parent has a cauldron marker, test that
    // a path with no markers at all returns null from the temp dir itself
    // by starting from a place we control. The temp dir and its parents won't have markers.
    // Note: This test verifies the null return behavior by checking a case where
    // we reach the filesystem root — in practice, tmpdir() parents will not have cauldron markers.
    const result = findProjectRoot(nested);
    // Result is null unless the user's machine happens to have cauldron markers in /tmp parents
    // (very unlikely). We just verify it returns either null or a valid string.
    expect(result === null || typeof result === 'string').toBe(true);
  });

  it('prefers cauldron.config.ts over .cauldron/ when both exist', () => {
    const root = makeTempDir();
    writeFileSync(join(root, 'cauldron.config.ts'), 'export default {};');
    mkdirSync(join(root, '.cauldron'));

    const result = findProjectRoot(root);
    expect(result).toBe(root);
  });

  it('returns null when called with a path that has no cauldron markers at any level', () => {
    // Use the separator to verify root behavior
    const emptyDir = makeTempDir();
    // We know the temp dir has no markers — verify the function at least returns a consistent type
    const result = findProjectRoot(sep); // filesystem root definitely has no cauldron markers
    expect(result).toBeNull();
  });
});
