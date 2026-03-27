import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMGateway } from '../../gateway/gateway.js';
import type { Seed } from '@get-cauldron/shared';
import type { HoldoutScenario } from '../types.js';
import { generateHoldoutScenarios, regenerateRejected } from '../generator.js';

// Mock @get-cauldron/shared to avoid DATABASE_URL requirement
vi.mock('@get-cauldron/shared', () => ({
  db: {},
}));

const makeScenario = (id: string, title: string): HoldoutScenario => ({
  id,
  title,
  given: `Given a system with ${title}`,
  when: `When the action is performed`,
  then: `Then the result should be correct`,
  category: 'edge_case',
  acceptanceCriterionRef: 'AC-1',
  severity: 'major',
});

const FIVE_SCENARIOS: HoldoutScenario[] = [
  makeScenario('00000000-0000-0000-0000-000000000001', 'Scenario 1'),
  makeScenario('00000000-0000-0000-0000-000000000002', 'Scenario 2'),
  makeScenario('00000000-0000-0000-0000-000000000003', 'Scenario 3'),
  makeScenario('00000000-0000-0000-0000-000000000004', 'Scenario 4'),
  makeScenario('00000000-0000-0000-0000-000000000005', 'Scenario 5'),
];

const fakeSeed: Seed = {
  id: 'seed-id-1',
  projectId: 'project-id-1',
  parentId: null,
  interviewId: null,
  version: 1,
  status: 'crystallized',
  goal: 'Build a CLI tool for bulk file renaming with natural language',
  constraints: ['Must run on macOS and Linux', 'Must not modify files in place without --dry-run flag'] as unknown as Seed['constraints'],
  acceptanceCriteria: [
    'Given a directory with files, when I run rename with "add prefix", then all files are prefixed',
    'Given invalid input, when I run the command, then a descriptive error is shown',
  ] as unknown as Seed['acceptanceCriteria'],
  ontologySchema: {} as unknown as Seed['ontologySchema'],
  evaluationPrinciples: [] as unknown as Seed['evaluationPrinciples'],
  exitConditions: {} as unknown as Seed['exitConditions'],
  ambiguityScore: 0.1,
  crystallizedAt: new Date('2026-01-01'),
  createdAt: new Date('2026-01-01'),
  generation: 0,
  evolutionContext: null,
};

describe('generateHoldoutScenarios', () => {
  let mockGateway: { generateObject: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockGateway = {
      generateObject: vi.fn().mockResolvedValue({
        object: { scenarios: FIVE_SCENARIOS },
      }),
    };
  });

  it('Test 1: calls gateway.generateObject with stage "holdout"', async () => {
    await generateHoldoutScenarios({
      gateway: mockGateway as unknown as LLMGateway,
      seed: fakeSeed,
      projectId: 'project-id-1',
    });

    expect(mockGateway.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'holdout' })
    );
  });

  it('Test 2: uses adversarial system prompt with edge case instructions', async () => {
    await generateHoldoutScenarios({
      gateway: mockGateway as unknown as LLMGateway,
      seed: fakeSeed,
      projectId: 'project-id-1',
    });

    const callArg = mockGateway.generateObject.mock.calls[0][0];
    expect(callArg.system).toContain('boundary');
  });

  it('Test 3: validates generated scenarios against HoldoutScenariosSchema (min 5)', async () => {
    const result = await generateHoldoutScenarios({
      gateway: mockGateway as unknown as LLMGateway,
      seed: fakeSeed,
      projectId: 'project-id-1',
    });

    expect(result).toHaveLength(5);
    expect(result[0]).toHaveProperty('id');
    expect(result[0]).toHaveProperty('title');
    expect(result[0]).toHaveProperty('given');
    expect(result[0]).toHaveProperty('when');
    expect(result[0]).toHaveProperty('then');
  });

  it('Test 4: includes seed goal and acceptance criteria in the prompt', async () => {
    await generateHoldoutScenarios({
      gateway: mockGateway as unknown as LLMGateway,
      seed: fakeSeed,
      projectId: 'project-id-1',
    });

    const callArg = mockGateway.generateObject.mock.calls[0][0];
    expect(callArg.prompt).toContain('Build a CLI tool for bulk file renaming');
    expect(callArg.prompt).toContain('add prefix');
  });

  it('Test 5: uses temperature 0.8', async () => {
    await generateHoldoutScenarios({
      gateway: mockGateway as unknown as LLMGateway,
      seed: fakeSeed,
      projectId: 'project-id-1',
    });

    const callArg = mockGateway.generateObject.mock.calls[0][0];
    expect(callArg.temperature).toBe(0.8);
  });

  it('Test 6: uses schema name "HoldoutScenarios"', async () => {
    await generateHoldoutScenarios({
      gateway: mockGateway as unknown as LLMGateway,
      seed: fakeSeed,
      projectId: 'project-id-1',
    });

    const callArg = mockGateway.generateObject.mock.calls[0][0];
    expect(callArg.schemaName).toBe('HoldoutScenarios');
  });
});

describe('regenerateRejected', () => {
  let mockGateway: { generateObject: ReturnType<typeof vi.fn> };
  const approvedScenarios = FIVE_SCENARIOS.slice(0, 3);
  const twoNewScenarios = [
    makeScenario('00000000-0000-0000-0000-000000000006', 'Replacement 1'),
    makeScenario('00000000-0000-0000-0000-000000000007', 'Replacement 2'),
  ];

  beforeEach(() => {
    mockGateway = {
      generateObject: vi.fn().mockResolvedValue({
        object: { scenarios: twoNewScenarios },
      }),
    };
  });

  it('Test 5 (regenerate): only regenerates rejected IDs, preserving approved ones', async () => {
    const result = await regenerateRejected({
      gateway: mockGateway as unknown as LLMGateway,
      seed: fakeSeed,
      projectId: 'project-id-1',
      rejectedIds: [
        '00000000-0000-0000-0000-000000000004',
        '00000000-0000-0000-0000-000000000005',
      ],
      reasons: ['Missing null check', 'Did not handle unicode'],
      existingApproved: approvedScenarios,
    });

    // Should have the 3 approved + 2 newly regenerated
    expect(result).toHaveLength(5);
    expect(result.slice(0, 3)).toEqual(approvedScenarios);
    expect(result.slice(3)).toEqual(twoNewScenarios);
  });

  it('Test 6 (regenerate): includes rejection context in the prompt', async () => {
    await regenerateRejected({
      gateway: mockGateway as unknown as LLMGateway,
      seed: fakeSeed,
      projectId: 'project-id-1',
      rejectedIds: ['00000000-0000-0000-0000-000000000004'],
      reasons: ['Missing null check'],
      existingApproved: approvedScenarios,
    });

    const callArg = mockGateway.generateObject.mock.calls[0][0];
    expect(callArg.prompt).toContain('Missing null check');
    expect(callArg.prompt).toContain('00000000-0000-0000-0000-000000000004');
  });
});
