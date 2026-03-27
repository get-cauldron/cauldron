import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMGateway } from '../../gateway/gateway.js';
import type { Seed } from '@get-cauldron/shared';
import { decomposeSeed } from '../decomposer.js';

// Mock @get-cauldron/shared to avoid DATABASE_URL requirement (established pattern)
vi.mock('@get-cauldron/shared', () => ({
  db: {},
}));

// Minimal fake seed matching Drizzle-inferred Seed type
const fakeSeed: Seed = {
  id: 'seed-id-1',
  projectId: 'project-id-1',
  parentId: null,
  interviewId: null,
  version: 1,
  status: 'crystallized',
  goal: 'Build a CLI tool for bulk file renaming with natural language',
  constraints: ['Must run on macOS'] as unknown as Seed['constraints'],
  acceptanceCriteria: ['AC-1', 'AC-2'] as unknown as Seed['acceptanceCriteria'],
  ontologySchema: { entities: ['FileSystem', 'Rename'] } as unknown as Seed['ontologySchema'],
  evaluationPrinciples: [] as unknown as Seed['evaluationPrinciples'],
  exitConditions: {} as unknown as Seed['exitConditions'],
  ambiguityScore: 0.1,
  crystallizedAt: new Date('2026-01-01'),
  createdAt: new Date('2026-01-01'),
  generation: 0,
  evolutionContext: null,
};

const MOLECULES = [
  {
    id: 'mol-cli',
    title: 'CLI Layer',
    description: 'Command-line interface entry point',
    coversCriteria: ['AC-1'],
  },
  {
    id: 'mol-rename',
    title: 'Rename Engine',
    description: 'Core rename logic',
    coversCriteria: ['AC-2'],
  },
];

const BEADS = [
  {
    id: 'mol-cli/arg-parser',
    moleculeId: 'mol-cli',
    title: 'CLI Argument Parser',
    spec: 'Parse command-line arguments using minimist',
    estimatedTokens: 50_000,
    coversCriteria: ['AC-1'],
    dependsOn: [],
    waitsFor: [],
    conditionalOn: undefined,
  },
  {
    id: 'mol-rename/core',
    moleculeId: 'mol-rename',
    title: 'Rename Core Logic',
    spec: 'Implement file rename logic with pattern matching',
    estimatedTokens: 80_000,
    coversCriteria: ['AC-2'],
    dependsOn: ['mol-cli/arg-parser'],
    waitsFor: [],
    conditionalOn: undefined,
  },
];

describe('decomposeSeed', () => {
  let mockGateway: { generateObject: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    // Default: pass 1 returns molecules, pass 2 returns valid beads
    mockGateway = {
      generateObject: vi.fn()
        .mockResolvedValueOnce({ object: { molecules: MOLECULES } })
        .mockResolvedValueOnce({ object: { beads: BEADS } }),
    };
  });

  it('Test 1: calls gateway.generateObject twice (pass 1 for molecules, pass 2 for beads)', async () => {
    await decomposeSeed({
      gateway: mockGateway as unknown as LLMGateway,
      seed: fakeSeed,
      projectId: 'project-id-1',
    });

    expect(mockGateway.generateObject).toHaveBeenCalledTimes(2);
  });

  it('Test 2: uses stage "decomposition" for both gateway calls', async () => {
    await decomposeSeed({
      gateway: mockGateway as unknown as LLMGateway,
      seed: fakeSeed,
      projectId: 'project-id-1',
    });

    const calls = mockGateway.generateObject.mock.calls;
    expect(calls[0]![0]).toMatchObject({ stage: 'decomposition' });
    expect(calls[1]![0]).toMatchObject({ stage: 'decomposition' });
  });

  it('Test 3: passes seed goal, constraints, acceptanceCriteria, ontologySchema to the LLM', async () => {
    await decomposeSeed({
      gateway: mockGateway as unknown as LLMGateway,
      seed: fakeSeed,
      projectId: 'project-id-1',
    });

    const pass1Prompt = mockGateway.generateObject.mock.calls[0]![0].prompt as string;
    expect(pass1Prompt).toContain('Build a CLI tool');
    expect(pass1Prompt).toContain('AC-1');
  });

  it('Test 4: returns DecompositionResult with molecules and beads', async () => {
    const result = await decomposeSeed({
      gateway: mockGateway as unknown as LLMGateway,
      seed: fakeSeed,
      projectId: 'project-id-1',
    });

    expect(result).toHaveProperty('molecules');
    expect(result).toHaveProperty('beads');
    expect(result.molecules).toEqual(MOLECULES);
    expect(result.beads).toEqual(BEADS);
  });

  it('Test 5: retries on cycle detection failure (up to maxRetries=3)', async () => {
    // Cyclic beads that will fail validation
    const cyclicBeads = [
      { ...BEADS[0]!, dependsOn: ['mol-rename/core'], waitsFor: [] },
      { ...BEADS[1]!, dependsOn: ['mol-cli/arg-parser'], waitsFor: [] },
    ];
    const validBeadsNoCycle = [
      { ...BEADS[0]!, dependsOn: [], waitsFor: [] },
      { ...BEADS[1]!, dependsOn: ['mol-cli/arg-parser'], waitsFor: [] },
    ];

    mockGateway.generateObject = vi.fn()
      .mockResolvedValueOnce({ object: { molecules: MOLECULES } })    // pass 1
      .mockResolvedValueOnce({ object: { beads: cyclicBeads } })      // pass 2 attempt 1 (cycle)
      .mockResolvedValueOnce({ object: { beads: validBeadsNoCycle } }); // pass 2 attempt 2 (valid)

    const result = await decomposeSeed({
      gateway: mockGateway as unknown as LLMGateway,
      seed: fakeSeed,
      projectId: 'project-id-1',
    });

    // Should have called generateObject 3 times total: 1 pass1 + 2 pass2 attempts
    expect(mockGateway.generateObject).toHaveBeenCalledTimes(3);
    expect(result.beads).toEqual(validBeadsNoCycle);
  });

  it('Test 6: retries on oversized bead failure with explicit split instruction in retry prompt', async () => {
    const oversizedBeads = [
      { ...BEADS[0]!, estimatedTokens: 300_000 },
      BEADS[1]!,
    ];

    mockGateway.generateObject = vi.fn()
      .mockResolvedValueOnce({ object: { molecules: MOLECULES } })   // pass 1
      .mockResolvedValueOnce({ object: { beads: oversizedBeads } })  // pass 2 attempt 1 (oversized)
      .mockResolvedValueOnce({ object: { beads: BEADS } });          // pass 2 attempt 2 (valid)

    await decomposeSeed({
      gateway: mockGateway as unknown as LLMGateway,
      seed: fakeSeed,
      projectId: 'project-id-1',
    });

    // The retry prompt for pass 2 attempt 2 should contain split instruction
    const retryPrompt = mockGateway.generateObject.mock.calls[2]![0].prompt as string;
    expect(retryPrompt).toContain('Split each oversized bead');
  });

  it('Test 7: retries on coverage gap failure', async () => {
    const gapBeads = [
      { ...BEADS[0]!, coversCriteria: ['AC-1'] },
      // BEADS[1] missing — AC-2 uncovered
    ];

    mockGateway.generateObject = vi.fn()
      .mockResolvedValueOnce({ object: { molecules: MOLECULES } })  // pass 1
      .mockResolvedValueOnce({ object: { beads: gapBeads } })       // pass 2 attempt 1 (gap)
      .mockResolvedValueOnce({ object: { beads: BEADS } });         // pass 2 attempt 2 (valid)

    const result = await decomposeSeed({
      gateway: mockGateway as unknown as LLMGateway,
      seed: fakeSeed,
      projectId: 'project-id-1',
    });

    expect(mockGateway.generateObject).toHaveBeenCalledTimes(3);
    expect(result.beads).toEqual(BEADS);
  });

  it('Test 8: throws after maxRetries exhausted with the last validation error', async () => {
    // Always returns cyclic beads — will exhaust 3 retries
    const cyclicBeads = [
      { ...BEADS[0]!, dependsOn: ['mol-rename/core'], waitsFor: [] },
      { ...BEADS[1]!, dependsOn: ['mol-cli/arg-parser'], waitsFor: [] },
    ];

    mockGateway.generateObject = vi.fn()
      .mockResolvedValueOnce({ object: { molecules: MOLECULES } }) // pass 1
      .mockResolvedValue({ object: { beads: cyclicBeads } });      // all pass 2 attempts

    await expect(
      decomposeSeed({
        gateway: mockGateway as unknown as LLMGateway,
        seed: fakeSeed,
        projectId: 'project-id-1',
        maxRetries: 3,
      })
    ).rejects.toThrow('Decomposition failed after 3 attempts');
  });

  it('Test 9: sets estimatedTokens on every bead (DAG-02)', async () => {
    const result = await decomposeSeed({
      gateway: mockGateway as unknown as LLMGateway,
      seed: fakeSeed,
      projectId: 'project-id-1',
    });

    for (const bead of result.beads) {
      expect(typeof bead.estimatedTokens).toBe('number');
      expect(bead.estimatedTokens).toBeGreaterThan(0);
    }
  });

  it('Test 10: every bead has non-empty coversCriteria (DAG-09 enforcement)', async () => {
    // Beads with empty coversCriteria trigger a coverage_gap error,
    // and they don't cover any AC — so validate that beads returned have coversCriteria
    const result = await decomposeSeed({
      gateway: mockGateway as unknown as LLMGateway,
      seed: fakeSeed,
      projectId: 'project-id-1',
    });

    for (const bead of result.beads) {
      expect(bead.coversCriteria.length).toBeGreaterThan(0);
    }
  });
});
