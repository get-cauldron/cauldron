import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

// These imports will fail until the modules are created (RED phase)
import { writeSeedDraft, readSeedDraft } from '../review/seed-writer.js';
import { writeHoldoutDraft, readHoldoutDraft } from '../review/holdout-writer.js';
import type { SeedSummary } from '@get-cauldron/engine';
import type { HoldoutScenario } from '@get-cauldron/engine';

function makeTempDir(): string {
  const dir = join(tmpdir(), `cauldron-test-${randomBytes(8).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const sampleSeedSummary: SeedSummary = {
  goal: 'Build a CLI bulk file renaming tool that accepts natural language requests',
  constraints: ['Must run on Node.js 18+', 'No external API calls required'],
  acceptanceCriteria: ['User can rename files with natural language', 'Dry-run mode shows changes without applying'],
  ontologySchema: {
    entities: [
      {
        name: 'File',
        attributes: ['path', 'name', 'extension'],
        relations: [{ to: 'RenameRule', type: 'governed_by' }],
      },
    ],
  },
  evaluationPrinciples: ['Correctness over speed', 'Fail safe on ambiguity'],
  exitConditions: { maxIterations: 5, convergedWhen: 'all acceptance criteria pass' },
};

const sampleScenarios: HoldoutScenario[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    title: 'Rename files by extension',
    given: 'A directory with 3 .txt files',
    when: 'User runs rename "change all .txt to .md"',
    then: 'All 3 files have .md extension',
    category: 'happy_path',
    acceptanceCriterionRef: 'AC-01',
    severity: 'critical',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    title: 'Dry run shows preview',
    given: 'A directory with files',
    when: 'User runs rename --dry-run "rename all files to lowercase"',
    then: 'Output shows proposed changes without modifying files',
    category: 'happy_path',
    acceptanceCriterionRef: 'AC-02',
    severity: 'major',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440003',
    title: 'Empty directory edge case',
    given: 'An empty directory',
    when: 'User runs rename "rename all files to uppercase"',
    then: 'Tool exits cleanly with "no files found" message',
    category: 'edge_case',
    acceptanceCriterionRef: 'AC-01',
    severity: 'minor',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440004',
    title: 'Invalid ambiguous instruction',
    given: 'A directory with files',
    when: 'User runs rename "do something"',
    then: 'Tool reports ambiguity error and exits with code 1',
    category: 'error_handling',
    acceptanceCriterionRef: 'AC-03',
    severity: 'major',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440005',
    title: 'Permission denied handling',
    given: 'A file the user cannot write to',
    when: 'User tries to rename that file',
    then: 'Tool reports permission error and continues with remaining files',
    category: 'error_handling',
    acceptanceCriterionRef: 'AC-04',
    severity: 'major',
  },
];

describe('writeSeedDraft and readSeedDraft', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('Test 1: writeSeedDraft writes a JSON file containing all SeedSummary fields', async () => {
    const projectId = 'proj-abc-123';
    const filePath = await writeSeedDraft(tempDir, projectId, sampleSeedSummary);

    expect(existsSync(filePath)).toBe(true);
    // Should contain key fields
    const { readFileSync } = await import('node:fs');
    const content = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    expect(parsed.goal).toBe(sampleSeedSummary.goal);
    expect(parsed.constraints).toEqual(sampleSeedSummary.constraints);
    expect(parsed.acceptanceCriteria).toEqual(sampleSeedSummary.acceptanceCriteria);
    expect(parsed.ontologySchema).toEqual(sampleSeedSummary.ontologySchema);
    expect(parsed.evaluationPrinciples).toEqual(sampleSeedSummary.evaluationPrinciples);
    expect(parsed.exitConditions).toEqual(sampleSeedSummary.exitConditions);
  });

  it('Test 2: writeSeedDraft creates .cauldron/review/ directory if it does not exist', async () => {
    const projectId = 'proj-dir-creation';
    const reviewDir = join(tempDir, '.cauldron', 'review');

    expect(existsSync(reviewDir)).toBe(false);

    await writeSeedDraft(tempDir, projectId, sampleSeedSummary);

    expect(existsSync(reviewDir)).toBe(true);
  });

  it('Test 3: readSeedDraft parses the JSON file back into a SeedSummary-shaped object', async () => {
    const projectId = 'proj-roundtrip';
    await writeSeedDraft(tempDir, projectId, sampleSeedSummary);

    const parsed = await readSeedDraft(tempDir, projectId);

    expect(parsed.goal).toBe(sampleSeedSummary.goal);
    expect(parsed.constraints).toEqual(sampleSeedSummary.constraints);
    expect(parsed.acceptanceCriteria).toEqual(sampleSeedSummary.acceptanceCriteria);
    expect(parsed.ontologySchema).toEqual(sampleSeedSummary.ontologySchema);
    expect(parsed.evaluationPrinciples).toEqual(sampleSeedSummary.evaluationPrinciples);
    expect(parsed.exitConditions).toEqual(sampleSeedSummary.exitConditions);
  });
});

describe('writeHoldoutDraft and readHoldoutDraft', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('Test 4: writeHoldoutDraft writes a JSON file with each scenario having approved: true default', async () => {
    const seedId = 'seed-xyz-456';
    const filePath = await writeHoldoutDraft(tempDir, seedId, sampleScenarios);

    expect(existsSync(filePath)).toBe(true);
    const { readFileSync } = await import('node:fs');
    const content = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content) as Array<Record<string, unknown>>;

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(sampleScenarios.length);

    // Each scenario should have approved: true
    for (const scenario of parsed) {
      expect(scenario.approved).toBe(true);
    }

    // First scenario should have all original fields preserved
    expect(parsed[0]?.id).toBe(sampleScenarios[0]?.id);
    expect(parsed[0]?.title).toBe(sampleScenarios[0]?.title);
    expect(parsed[0]?.category).toBe(sampleScenarios[0]?.category);
  });

  it('Test 5: readHoldoutDraft parses the JSON file and returns scenarios with approved boolean', async () => {
    const seedId = 'seed-roundtrip';
    await writeHoldoutDraft(tempDir, seedId, sampleScenarios);

    const parsed = await readHoldoutDraft(tempDir, seedId);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(sampleScenarios.length);

    // All should default to approved: true
    for (const scenario of parsed) {
      expect(typeof scenario.approved).toBe('boolean');
      expect(scenario.approved).toBe(true);
    }

    // Fields should match original scenarios
    const first = parsed[0]!;
    expect(first.id).toBe(sampleScenarios[0]?.id);
    expect(first.title).toBe(sampleScenarios[0]?.title);
    expect(first.given).toBe(sampleScenarios[0]?.given);
    expect(first.when).toBe(sampleScenarios[0]?.when);
    expect(first.then).toBe(sampleScenarios[0]?.then);
    expect(first.category).toBe(sampleScenarios[0]?.category);
  });
});
