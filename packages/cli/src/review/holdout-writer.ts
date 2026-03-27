import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HoldoutScenario } from '@get-cauldron/engine';

/**
 * A holdout scenario with an approval flag added for the review draft.
 */
export type HoldoutDraftScenario = HoldoutScenario & { approved: boolean };

/**
 * Write a holdout draft file for human review (D-17).
 *
 * All scenarios default to approved: true.
 * The reviewer sets approved: false for scenarios they want to reject/regenerate.
 *
 * Writes to {projectRoot}/.cauldron/review/holdout-draft-{seedId}.json
 * Returns the file path so the caller can print it.
 */
export async function writeHoldoutDraft(
  projectRoot: string,
  seedId: string,
  scenarios: HoldoutScenario[],
): Promise<string> {
  const dir = join(projectRoot, '.cauldron', 'review');
  mkdirSync(dir, { recursive: true });

  const filePath = join(dir, `holdout-draft-${seedId}.json`);
  const draftScenarios: HoldoutDraftScenario[] = scenarios.map(s => ({ ...s, approved: true }));
  const content = JSON.stringify(draftScenarios, null, 2);
  writeFileSync(filePath, content, 'utf-8');

  return filePath;
}

/**
 * Read a previously written holdout draft for the seal step.
 *
 * Returns each scenario with its approved boolean (from the file).
 * Throws if the file does not exist.
 */
export async function readHoldoutDraft(
  projectRoot: string,
  seedId: string,
): Promise<HoldoutDraftScenario[]> {
  const filePath = join(projectRoot, '.cauldron', 'review', `holdout-draft-${seedId}.json`);
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as HoldoutDraftScenario[];
}
