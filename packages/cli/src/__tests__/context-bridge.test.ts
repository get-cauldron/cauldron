import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPlanningArtifacts, extractRequirementIds } from '../context-bridge.js';

function makeTempDir(): string {
  const dir = join(tmpdir(), `cauldron-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('readPlanningArtifacts', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('Test 1: reads PROJECT.md, REQUIREMENTS.md, and phase CONTEXT.md and returns concatenated string', async () => {
    // Create .planning directory structure
    mkdirSync(join(tmpDir, '.planning'), { recursive: true });
    mkdirSync(join(tmpDir, '.planning', 'phases', '06.1-dogfooding'), { recursive: true });

    writeFileSync(join(tmpDir, '.planning', 'PROJECT.md'), '# Project Cauldron\n\nAI-powered dev platform.');
    writeFileSync(join(tmpDir, '.planning', 'REQUIREMENTS.md'), '## Requirements\n\n- EVOL-01: Evolutionary loop\n- WEB-03: Dashboard');
    writeFileSync(join(tmpDir, '.planning', 'phases', '06.1-dogfooding', '06.1-CONTEXT.md'), '## Phase Decisions\n\nUse brownfield mode.');

    const result = await readPlanningArtifacts(tmpDir, '06.1');

    expect(result).toContain('Project Cauldron');
    expect(result).toContain('AI-powered dev platform');
    expect(result).toContain('Requirements');
    expect(result).toContain('EVOL-01');
    expect(result).toContain('Phase Decisions');
    expect(result).toContain('Use brownfield mode');
  });

  it('Test 2: returns empty string when .planning/ directory does not exist', async () => {
    const result = await readPlanningArtifacts(join(tmpDir, 'nonexistent-project'));
    expect(result).toBe('');
  });

  it('Test 3: includes requirement IDs in output per D-10', async () => {
    mkdirSync(join(tmpDir, '.planning'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.planning', 'REQUIREMENTS.md'),
      '# Requirements\n\n## EVOL-01\nEvolutionary loop\n\n## AUTH-03\nAuth flow\n\n## D-07\nContext bridge',
    );

    const result = await readPlanningArtifacts(tmpDir);

    expect(result).toContain('EVOL-01');
    expect(result).toContain('AUTH-03');
    expect(result).toContain('D-07');
  });
});

describe('extractRequirementIds', () => {
  it('extracts IDs matching [A-Z]+-\\d+ pattern from a string', () => {
    const content = '## EVOL-01\nEvolutionary loop\n\n## WEB-03\nDashboard\n\n- AUTH-12 required';
    const ids = extractRequirementIds(content);
    expect(ids).toContain('EVOL-01');
    expect(ids).toContain('WEB-03');
    expect(ids).toContain('AUTH-12');
  });

  it('returns empty array when no IDs found', () => {
    const ids = extractRequirementIds('No requirements here');
    expect(ids).toEqual([]);
  });
});
