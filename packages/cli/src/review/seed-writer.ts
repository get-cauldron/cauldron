import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { SeedSummary } from '@cauldron/engine';

/**
 * Write a seed draft file for human review (D-16).
 *
 * Writes to {projectRoot}/.cauldron/review/seed-draft-{projectId}.json
 * Returns the file path so the caller can print it.
 */
export async function writeSeedDraft(
  projectRoot: string,
  projectId: string,
  summary: SeedSummary,
): Promise<string> {
  const dir = join(projectRoot, '.cauldron', 'review');
  mkdirSync(dir, { recursive: true });

  const filePath = join(dir, `seed-draft-${projectId}.json`);
  const content = JSON.stringify(summary, null, 2);
  writeFileSync(filePath, content, 'utf-8');

  return filePath;
}

/**
 * Read a previously written seed draft for crystallization.
 *
 * Reads from {projectRoot}/.cauldron/review/seed-draft-{projectId}.json
 * Throws if the file does not exist.
 */
export async function readSeedDraft(
  projectRoot: string,
  projectId: string,
): Promise<SeedSummary> {
  const filePath = join(projectRoot, '.cauldron', 'review', `seed-draft-${projectId}.json`);
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as SeedSummary;
}
