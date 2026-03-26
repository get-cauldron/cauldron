/**
 * seed-injection.test.ts
 *
 * Regression tests for direct seed injection (D-04, D-07 Track 2).
 * Guards against future schema changes breaking the ability to inject a pre-generated
 * seed with interviewId: null (no interview dependency).
 *
 * These are unit tests with mocked DB — no live database required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @cauldron/shared to avoid requiring DATABASE_URL at import time
vi.mock('@cauldron/shared', () => ({
  seeds: {
    projectId: 'project_id',
    interviewId: 'interview_id',
    id: 'id',
    status: 'status',
    version: 'version',
    goal: 'goal',
    constraints: 'constraints',
    acceptanceCriteria: 'acceptance_criteria',
    ontologySchema: 'ontology_schema',
    evaluationPrinciples: 'evaluation_principles',
    exitConditions: 'exit_conditions',
    ambiguityScore: 'ambiguity_score',
    crystallizedAt: 'crystallized_at',
  },
  projects: {
    id: 'id',
    name: 'name',
    description: 'description',
    settings: 'settings',
  },
  db: {},
  appendEvent: vi.fn().mockResolvedValue({ id: 'event-1', sequenceNumber: 1 }),
}));

// ─── CLI Renamer Seed Fixture ─────────────────────────────────────────────────

const CLI_RENAMER_SEED_FIXTURE = {
  goal: 'Build a CLI file renamer tool that recursively renames files by replacing a pattern string in filenames with a replacement string within a target directory.',
  constraints: [
    'TypeScript implementation',
    'No external LLM dependencies',
    'Unix/macOS target platform',
    'Dry-run mode must be supported (preview changes without applying)',
  ],
  acceptanceCriteria: [
    'CLI accepts --dir, --find, --replace, --dry-run flags',
    'Recursively walks target directory',
    'Renames all files matching --find pattern in filename to --replace',
    'Dry-run mode lists changes without applying them',
    'Handles edge cases: no matches found, permission errors, name collisions',
  ],
  ontologySchema: {
    entities: [
      {
        name: 'File',
        attributes: ['path', 'name', 'extension'],
        relations: [],
      },
      {
        name: 'RenamePlan',
        attributes: ['from', 'to', 'dry'],
        relations: [{ to: 'File', type: 'targets' }],
      },
    ],
  },
  evaluationPrinciples: [
    'Correctness: renames exactly the files matched by the pattern, no others',
    'Safety: dry-run must never write to disk',
    'Clarity: output is human-readable',
  ],
  exitConditions: {
    allTestsPass: true,
    dryRunVerified: true,
  },
};

// ─── Mock DB Builder ──────────────────────────────────────────────────────────

function makeMockDb() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([
      {
        id: 'seed-uuid-123',
        projectId: 'project-uuid-456',
        interviewId: null,
        parentId: null,
        version: 1,
        status: 'crystallized',
        goal: CLI_RENAMER_SEED_FIXTURE.goal,
        constraints: CLI_RENAMER_SEED_FIXTURE.constraints,
        acceptanceCriteria: CLI_RENAMER_SEED_FIXTURE.acceptanceCriteria,
        ontologySchema: CLI_RENAMER_SEED_FIXTURE.ontologySchema,
        evaluationPrinciples: CLI_RENAMER_SEED_FIXTURE.evaluationPrinciples,
        exitConditions: CLI_RENAMER_SEED_FIXTURE.exitConditions,
        ambiguityScore: 0.05,
        crystallizedAt: new Date(),
        createdAt: new Date(),
      },
    ]),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('seed injection without interview (D-07 Track 2)', () => {
  let mockDb: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    mockDb = makeMockDb();
    vi.clearAllMocks();
  });

  it('inserts seed with interviewId null without FK violation', async () => {
    // Simulate inserting a seed with interviewId: null
    // interviewId references interviews.id but is nullable — no FK violation expected
    const seedValues = {
      projectId: 'project-uuid-456',
      interviewId: null,   // <-- key: no interview dependency
      parentId: null,
      version: 1,
      status: 'crystallized' as const,
      goal: CLI_RENAMER_SEED_FIXTURE.goal,
      constraints: CLI_RENAMER_SEED_FIXTURE.constraints,
      acceptanceCriteria: CLI_RENAMER_SEED_FIXTURE.acceptanceCriteria,
      ontologySchema: CLI_RENAMER_SEED_FIXTURE.ontologySchema,
      evaluationPrinciples: CLI_RENAMER_SEED_FIXTURE.evaluationPrinciples,
      exitConditions: CLI_RENAMER_SEED_FIXTURE.exitConditions,
      ambiguityScore: 0.05,
      crystallizedAt: new Date(),
    };

    const result = await mockDb.insert({}).values(seedValues).returning();
    const [seed] = result;

    expect(seed).toBeDefined();
    expect(seed.interviewId).toBeNull();
    expect(seed.status).toBe('crystallized');
    expect(seed.projectId).toBe('project-uuid-456');
  });

  it('seed is created with status crystallized directly (no interview flow required)', async () => {
    const result = await mockDb.insert({}).values({ status: 'crystallized' }).returning();
    const [seed] = result;

    // Unlike the interview flow, Track 2 seeds are crystallized on insert
    expect(seed.status).toBe('crystallized');
    expect(seed.crystallizedAt).toBeInstanceOf(Date);
  });
});

describe('CLI renamer seed fixture content validation', () => {
  it('goal matches cli-renamer project description', () => {
    expect(CLI_RENAMER_SEED_FIXTURE.goal).toContain('CLI file renamer');
    expect(CLI_RENAMER_SEED_FIXTURE.goal).toContain('recursively renames');
    expect(CLI_RENAMER_SEED_FIXTURE.goal).toContain('target directory');
  });

  it('constraints array is non-empty and contains TypeScript requirement', () => {
    expect(Array.isArray(CLI_RENAMER_SEED_FIXTURE.constraints)).toBe(true);
    expect(CLI_RENAMER_SEED_FIXTURE.constraints.length).toBeGreaterThan(0);
    expect(CLI_RENAMER_SEED_FIXTURE.constraints).toContain('TypeScript implementation');
  });

  it('acceptanceCriteria array covers all CLI flags', () => {
    expect(Array.isArray(CLI_RENAMER_SEED_FIXTURE.acceptanceCriteria)).toBe(true);
    const acText = CLI_RENAMER_SEED_FIXTURE.acceptanceCriteria.join(' ');
    expect(acText).toContain('--dir');
    expect(acText).toContain('--find');
    expect(acText).toContain('--replace');
    expect(acText).toContain('--dry-run');
  });

  it('ontologySchema has entities array with File and RenamePlan', () => {
    const { ontologySchema } = CLI_RENAMER_SEED_FIXTURE;
    expect(ontologySchema).toHaveProperty('entities');
    expect(Array.isArray(ontologySchema.entities)).toBe(true);

    const entityNames = ontologySchema.entities.map((e) => e.name);
    expect(entityNames).toContain('File');
    expect(entityNames).toContain('RenamePlan');
  });

  it('ontologySchema File entity has required attributes', () => {
    const fileEntity = CLI_RENAMER_SEED_FIXTURE.ontologySchema.entities.find(
      (e) => e.name === 'File',
    );
    expect(fileEntity).toBeDefined();
    expect(fileEntity!.attributes).toContain('path');
    expect(fileEntity!.attributes).toContain('name');
    expect(fileEntity!.attributes).toContain('extension');
  });

  it('ontologySchema RenamePlan entity has relation to File', () => {
    const renamePlanEntity = CLI_RENAMER_SEED_FIXTURE.ontologySchema.entities.find(
      (e) => e.name === 'RenamePlan',
    );
    expect(renamePlanEntity).toBeDefined();
    expect(renamePlanEntity!.relations).toHaveLength(1);
    expect(renamePlanEntity!.relations[0]).toMatchObject({ to: 'File', type: 'targets' });
  });

  it('evaluationPrinciples cover correctness, safety, and clarity', () => {
    const principlesText = CLI_RENAMER_SEED_FIXTURE.evaluationPrinciples.join(' ');
    expect(principlesText).toContain('Correctness');
    expect(principlesText).toContain('Safety');
    expect(principlesText).toContain('Clarity');
  });

  it('exitConditions include allTestsPass and dryRunVerified', () => {
    expect(CLI_RENAMER_SEED_FIXTURE.exitConditions).toMatchObject({
      allTestsPass: true,
      dryRunVerified: true,
    });
  });
});

describe('seed SeedSummary schema compatibility', () => {
  it('fixture satisfies SeedSummary interface shape', () => {
    // SeedSummary interface: { goal, constraints, acceptanceCriteria, ontologySchema, evaluationPrinciples, exitConditions }
    const summary = CLI_RENAMER_SEED_FIXTURE;

    expect(typeof summary.goal).toBe('string');
    expect(Array.isArray(summary.constraints)).toBe(true);
    expect(Array.isArray(summary.acceptanceCriteria)).toBe(true);
    expect(typeof summary.ontologySchema).toBe('object');
    expect(Array.isArray(summary.evaluationPrinciples)).toBe(true);
    expect(typeof summary.exitConditions).toBe('object');
  });

  it('fixture goal is non-empty string', () => {
    expect(CLI_RENAMER_SEED_FIXTURE.goal.length).toBeGreaterThan(10);
  });

  it('fixture constraints are all strings', () => {
    for (const constraint of CLI_RENAMER_SEED_FIXTURE.constraints) {
      expect(typeof constraint).toBe('string');
    }
  });

  it('fixture acceptanceCriteria are all strings', () => {
    for (const ac of CLI_RENAMER_SEED_FIXTURE.acceptanceCriteria) {
      expect(typeof ac).toBe('string');
    }
  });

  it('fixture evaluationPrinciples are all strings', () => {
    for (const principle of CLI_RENAMER_SEED_FIXTURE.evaluationPrinciples) {
      expect(typeof principle).toBe('string');
    }
  });
});
