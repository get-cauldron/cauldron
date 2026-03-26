import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb, runMigrations, truncateAll } from './setup.js';
import * as schema from '../schema/index.js';

let testDb: ReturnType<typeof createTestDb>;

beforeAll(async () => {
  testDb = createTestDb();
  await runMigrations(testDb.db);
});

afterEach(async () => {
  await truncateAll(testDb.db);
});

afterAll(async () => {
  await testDb.client.end();
});

async function createTestProject(name = 'Test Project') {
  const [project] = await testDb.db.insert(schema.projects).values({ name }).returning();
  return project!;
}

async function createTestInterview(projectId: string, opts?: Partial<schema.NewInterview>) {
  const [interview] = await testDb.db
    .insert(schema.interviews)
    .values({ projectId, ...opts })
    .returning();
  return interview!;
}

// ─── interviews table ─────────────────────────────────────────────────────────

describe('interviews table', () => {
  it('inserts interview with defaults: status=active, phase=gathering, turnCount=0', async () => {
    const project = await createTestProject();
    const interview = await createTestInterview(project.id);

    expect(interview.id).toBeDefined();
    expect(interview.projectId).toBe(project.id);
    expect(interview.status).toBe('active');
    expect(interview.phase).toBe('gathering');
    expect(interview.turnCount).toBe(0);
    expect(interview.mode).toBe('greenfield');
    expect(interview.transcript).toEqual([]);
    expect(interview.ambiguityScoresHistory).toEqual([]);
    expect(interview.currentAmbiguityScore).toBeNull();
    expect(interview.createdAt).toBeDefined();
    expect(interview.completedAt).toBeNull();
  });

  it('inserts interview with mode=brownfield and stores correctly', async () => {
    const project = await createTestProject();
    const interview = await createTestInterview(project.id, { mode: 'brownfield' });

    expect(interview.mode).toBe('brownfield');
  });

  it('updates interview transcript JSONB and round-trips correctly', async () => {
    const project = await createTestProject();
    const interview = await createTestInterview(project.id);

    const turn = {
      turnNumber: 1,
      perspective: 'researcher',
      question: 'What is the goal?',
      mcOptions: ['Option A', 'Option B'],
      userAnswer: 'Build a CLI renaming tool',
      ambiguityScoreSnapshot: { goalClarity: 0.5, constraintClarity: 0.4, successCriteriaClarity: 0.3, overall: 0.41, reasoning: 'early' },
      model: 'claude-3-5-sonnet-20241022',
      allCandidates: [],
      timestamp: new Date().toISOString(),
    };

    const [updated] = await testDb.db
      .update(schema.interviews)
      .set({ transcript: [turn], turnCount: 1 })
      .where(sql`id = ${interview.id}::uuid`)
      .returning();

    expect(updated!.transcript).toHaveLength(1);
    expect((updated!.transcript as typeof turn[])[0]!.question).toBe('What is the goal?');
    expect((updated!.transcript as typeof turn[])[0]!.userAnswer).toBe('Build a CLI renaming tool');
    expect((updated!.transcript as typeof turn[])[0]!.mcOptions).toEqual(['Option A', 'Option B']);
  });

  it('updates ambiguity scores history JSONB array and round-trips correctly', async () => {
    const project = await createTestProject();
    const interview = await createTestInterview(project.id);

    const scores = [
      { goalClarity: 0.5, constraintClarity: 0.4, successCriteriaClarity: 0.3, overall: 0.41, reasoning: 'turn 1' },
      { goalClarity: 0.7, constraintClarity: 0.6, successCriteriaClarity: 0.5, overall: 0.62, reasoning: 'turn 2' },
    ];

    const [updated] = await testDb.db
      .update(schema.interviews)
      .set({ ambiguityScoresHistory: scores, currentAmbiguityScore: scores[1] })
      .where(sql`id = ${interview.id}::uuid`)
      .returning();

    expect(updated!.ambiguityScoresHistory).toHaveLength(2);
    expect((updated!.currentAmbiguityScore as typeof scores[0])!.overall).toBe(0.62);
  });

  it('enforces projectId FK — insert with non-existent projectId fails', async () => {
    await expect(
      testDb.db.insert(schema.interviews).values({
        projectId: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow();
  });
});

// ─── seed crystallization via DB ──────────────────────────────────────────────

describe('seed crystallization via DB', () => {
  it('inserts seed with status=crystallized and all structured columns round-trip', async () => {
    const project = await createTestProject();
    const interview = await createTestInterview(project.id);

    const constraints = ['TypeScript only', 'No external deps'];
    const acceptanceCriteria = ['Accepts natural language input', 'Handles bulk rename'];
    const ontologySchema = {
      entities: [
        { name: 'File', attributes: ['name', 'path'], relations: [] },
      ],
    };
    const evaluationPrinciples = ['Correctness first', 'Speed second'];
    const exitConditions = { allTestsPass: true, noRegressions: true };

    const [seed] = await testDb.db.insert(schema.seeds).values({
      projectId: project.id,
      interviewId: interview.id,
      status: 'crystallized',
      goal: 'Build a CLI renaming tool',
      constraints,
      acceptanceCriteria,
      ontologySchema,
      evaluationPrinciples,
      exitConditions,
      ambiguityScore: 0.85,
      crystallizedAt: new Date(),
    }).returning();

    expect(seed!.status).toBe('crystallized');
    expect(seed!.goal).toBe('Build a CLI renaming tool');
    expect(seed!.constraints).toEqual(constraints);
    expect(seed!.acceptanceCriteria).toEqual(acceptanceCriteria);
    expect(seed!.ontologySchema).toEqual(ontologySchema);
    expect(seed!.evaluationPrinciples).toEqual(evaluationPrinciples);
    expect(seed!.exitConditions).toEqual(exitConditions);
    expect(seed!.ambiguityScore).toBeCloseTo(0.85, 3);
    expect(seed!.crystallizedAt).toBeDefined();
    expect(seed!.version).toBe(1);
  });

  it('inserts seed with parentId referencing another seed (FK)', async () => {
    const project = await createTestProject();
    const interview1 = await createTestInterview(project.id);
    const interview2 = await createTestInterview(project.id);

    const [seedV1] = await testDb.db.insert(schema.seeds).values({
      projectId: project.id,
      interviewId: interview1.id,
      status: 'crystallized',
      goal: 'Version 1 goal',
      crystallizedAt: new Date(),
    }).returning();

    const [seedV2] = await testDb.db.insert(schema.seeds).values({
      projectId: project.id,
      interviewId: interview2.id,
      parentId: seedV1!.id,
      version: 2,
      status: 'crystallized',
      goal: 'Version 2 goal',
      crystallizedAt: new Date(),
    }).returning();

    expect(seedV2!.parentId).toBe(seedV1!.id);
    expect(seedV2!.version).toBe(2);
  });

  it('enforces interviewId FK — insert with non-existent interviewId fails', async () => {
    const project = await createTestProject();
    await expect(
      testDb.db.insert(schema.seeds).values({
        projectId: project.id,
        interviewId: '00000000-0000-0000-0000-000000000000',
        status: 'crystallized',
        goal: 'Test',
        crystallizedAt: new Date(),
      }),
    ).rejects.toThrow();
  });
});

// ─── seed lineage query ───────────────────────────────────────────────────────

describe('seed lineage query', () => {
  it('creates a 3-seed chain and returns lineage from v3 ordered by version ASC', async () => {
    const project = await createTestProject();
    const interview1 = await createTestInterview(project.id);
    const interview2 = await createTestInterview(project.id);
    const interview3 = await createTestInterview(project.id);

    const [seedV1] = await testDb.db.insert(schema.seeds).values({
      projectId: project.id,
      interviewId: interview1.id,
      version: 1,
      status: 'crystallized',
      goal: 'V1 goal',
      crystallizedAt: new Date(),
    }).returning();

    const [seedV2] = await testDb.db.insert(schema.seeds).values({
      projectId: project.id,
      interviewId: interview2.id,
      parentId: seedV1!.id,
      version: 2,
      status: 'crystallized',
      goal: 'V2 goal',
      crystallizedAt: new Date(),
    }).returning();

    const [seedV3] = await testDb.db.insert(schema.seeds).values({
      projectId: project.id,
      interviewId: interview3.id,
      parentId: seedV2!.id,
      version: 3,
      status: 'crystallized',
      goal: 'V3 goal',
      crystallizedAt: new Date(),
    }).returning();

    // WITH RECURSIVE lineage CTE (same as crystallizer.ts getSeedLineage)
    const lineageRows = await testDb.db.execute(sql`
      WITH RECURSIVE lineage AS (
        SELECT * FROM seeds WHERE id = ${seedV3!.id}::uuid
        UNION ALL
        SELECT s.* FROM seeds s INNER JOIN lineage l ON s.id = l.parent_id
      )
      SELECT * FROM lineage ORDER BY version ASC
    `);

    const rows = lineageRows as unknown as Array<{ id: string; version: number; goal: string }>;
    expect(rows).toHaveLength(3);
    expect(rows[0]!.id).toBe(seedV1!.id);
    expect(rows[1]!.id).toBe(seedV2!.id);
    expect(rows[2]!.id).toBe(seedV3!.id);
    expect(rows[0]!.version).toBe(1);
    expect(rows[1]!.version).toBe(2);
    expect(rows[2]!.version).toBe(3);
  });
});

// ─── interview-seed relationship ──────────────────────────────────────────────

describe('interview-seed relationship', () => {
  it('creates interview, creates seed with interviewId, queries seed by interviewId', async () => {
    const project = await createTestProject();
    const interview = await createTestInterview(project.id);

    const [seed] = await testDb.db.insert(schema.seeds).values({
      projectId: project.id,
      interviewId: interview.id,
      status: 'crystallized',
      goal: 'Linked seed goal',
      crystallizedAt: new Date(),
    }).returning();

    const [found] = await testDb.db
      .select()
      .from(schema.seeds)
      .where(sql`interview_id = ${interview.id}::uuid`);

    expect(found!.id).toBe(seed!.id);
    expect(found!.goal).toBe('Linked seed goal');
  });

  it('creates interview, creates crystallized seed, verifies ambiguityScore stored', async () => {
    const project = await createTestProject();
    const interview = await createTestInterview(project.id);

    const [seed] = await testDb.db.insert(schema.seeds).values({
      projectId: project.id,
      interviewId: interview.id,
      status: 'crystallized',
      goal: 'Scored seed',
      ambiguityScore: 0.87,
      crystallizedAt: new Date(),
    }).returning();

    expect(seed!.ambiguityScore).toBeCloseTo(0.87, 3);
  });
});
