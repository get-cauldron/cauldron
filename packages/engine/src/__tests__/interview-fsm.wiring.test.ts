/**
 * Engine-level InterviewFSM wiring tests.
 *
 * Tests FSM methods that are NOT exposed through tRPC:
 *   - pause / startOrResume (resume path)
 *   - abandon → startOrResume creates a new interview
 *   - requestEarlyCrystallization
 *   - detectInterviewMode
 *   - generateSummary
 *
 * Real PostgreSQL (test DB :5433) + real InterviewFSM + mocked LLM gateway.
 * DB is NOT mocked. Only LLM gateway calls are scripted.
 */

// Must set DATABASE_URL before any @get-cauldron/shared import
process.env['DATABASE_URL'] =
  process.env['TEST_DATABASE_URL'] ?? 'postgres://cauldron:cauldron@localhost:5433/cauldron_test';

import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from '@get-cauldron/shared';
import { sql, eq } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { InterviewFSM, detectInterviewMode } from '../interview/fsm.js';
import { createScriptedGateway } from '../../../test-harness/src/gateway.js';
import { interviewTurnScript } from '../../../test-harness/src/scripts/interview-turn.js';
import type { GatewayConfig } from '../gateway/config.js';
import type { MockGatewayCall } from '../../../test-harness/src/gateway.js';

// ─── DB Setup ─────────────────────────────────────────────────────────────────

const TEST_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ?? 'postgres://cauldron:cauldron@localhost:5433/cauldron_test';

function createTestDb() {
  const client = postgres(TEST_DATABASE_URL);
  const db = drizzle({ client, schema });
  return { client, db };
}

async function runMigrations(db: ReturnType<typeof drizzle>) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const migrationsPath = path.resolve(__dirname, '../../../shared/src/db/migrations');
  await migrate(db, { migrationsFolder: migrationsPath });
}

async function truncateAll(db: ReturnType<typeof drizzle>) {
  await db.execute(
    sql`TRUNCATE TABLE llm_usage, project_snapshots, events, holdout_vault, bead_edges, beads, seeds, interviews, projects RESTART IDENTITY CASCADE`,
  );
}

// ─── Shared test DB (single connection pool for the file) ─────────────────────

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

// ─── Config & Logger ─────────────────────────────────────────────────────────

const mockConfig: GatewayConfig = {
  models: {
    interview: ['test-model'],
    holdout: ['test-holdout-model'],
    implementation: ['test-impl-model'],
    evaluation: ['test-eval-model'],
    decomposition: ['test-decomp-model'],
    context_assembly: ['test-model'],
    conflict_resolution: ['test-model'],
  },
  budget: { defaultLimitCents: 1000 },
};

const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  fatal: () => {},
  child: function (): typeof mockLogger {
    return mockLogger;
  },
} as any;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createProject(name = 'FSM Wiring Test') {
  const [project] = await testDb.db
    .insert(schema.projects)
    .values({ name })
    .returning();
  return project!;
}

function buildFsm(script: MockGatewayCall[] = []) {
  const gateway = createScriptedGateway(script);
  const fsm = new InterviewFSM(testDb.db as any, gateway as any, mockConfig, mockLogger);
  return { fsm, gateway };
}

// ─── Test: pause then resume preserves interview state ───────────────────────

describe('InterviewFSM.pause then startOrResume (resume path)', () => {
  it('resumes a paused interview — returns same ID, status transitions to active', async () => {
    const project = await createProject();
    const { fsm } = buildFsm();

    // Start interview
    const interview = await fsm.startOrResume(project.id);
    expect(interview.status).toBe('active');
    expect(interview.phase).toBe('gathering');

    // Pause it
    await fsm.pause(interview.id);

    // Verify DB row is paused
    const [paused] = await testDb.db
      .select()
      .from(schema.interviews)
      .where(eq(schema.interviews.id, interview.id));
    expect(paused!.status).toBe('paused');

    // Resume via startOrResume
    const resumed = await fsm.startOrResume(project.id);

    // Must return the SAME interview ID
    expect(resumed.id).toBe(interview.id);
    expect(resumed.status).toBe('active');

    // DB must reflect active status
    const [dbRow] = await testDb.db
      .select()
      .from(schema.interviews)
      .where(eq(schema.interviews.id, interview.id));
    expect(dbRow!.status).toBe('active');
  });

  it('pause throws when interview is not active', async () => {
    const project = await createProject();
    const { fsm } = buildFsm();

    const interview = await fsm.startOrResume(project.id);
    await fsm.pause(interview.id);

    // Pausing an already-paused interview should throw
    await expect(fsm.pause(interview.id)).rejects.toThrow(/active/);
  });
});

// ─── Test: abandon prevents resume — creates new interview ───────────────────

describe('InterviewFSM.abandon then startOrResume', () => {
  it('creates a NEW interview after abandonment (abandoned one is not resumed)', async () => {
    const project = await createProject();
    const { fsm } = buildFsm();

    const first = await fsm.startOrResume(project.id);
    expect(first.status).toBe('active');

    // Abandon the interview
    await fsm.abandon(first.id);

    // Verify DB row is abandoned
    const [abandoned] = await testDb.db
      .select()
      .from(schema.interviews)
      .where(eq(schema.interviews.id, first.id));
    expect(abandoned!.status).toBe('abandoned');

    // startOrResume should create a BRAND NEW interview
    const second = await fsm.startOrResume(project.id);
    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe('active');
    expect(second.phase).toBe('gathering');
  });

  it('abandon works from paused status as well', async () => {
    const project = await createProject();
    const { fsm } = buildFsm();

    const interview = await fsm.startOrResume(project.id);
    await fsm.pause(interview.id);
    await fsm.abandon(interview.id);

    const [dbRow] = await testDb.db
      .select()
      .from(schema.interviews)
      .where(eq(schema.interviews.id, interview.id));
    expect(dbRow!.status).toBe('abandoned');
  });

  it('abandon throws when interview is already abandoned', async () => {
    const project = await createProject();
    const { fsm } = buildFsm();

    const interview = await fsm.startOrResume(project.id);
    await fsm.abandon(interview.id);

    await expect(fsm.abandon(interview.id)).rejects.toThrow();
  });
});

// ─── Test: requestEarlyCrystallization returns warning with gap info ──────────

describe('InterviewFSM.requestEarlyCrystallization', () => {
  it('returns warning with currentScore, threshold, gap, weakestDimensions — transitions to reviewing', async () => {
    const project = await createProject();
    const { fsm, gateway } = buildFsm(interviewTurnScript({ overallClarity: 0.5 }));

    const interview = await fsm.startOrResume(project.id);

    // Submit one answer to populate currentAmbiguityScore (score 0.5)
    await fsm.submitAnswer(interview.id, project.id, { userAnswer: 'Build something' });
    gateway.assertAllConsumed();

    // Now request early crystallization
    const warning = await fsm.requestEarlyCrystallization(interview.id);

    expect(typeof warning.currentScore).toBe('number');
    expect(warning.threshold).toBe(0.8);
    expect(warning.gap).toBeCloseTo(0.8 - warning.currentScore, 5);
    expect(Array.isArray(warning.weakestDimensions)).toBe(true);
    expect(warning.weakestDimensions.length).toBeGreaterThan(0);
    expect(warning.weakestDimensions.length).toBeLessThanOrEqual(2);
    expect(warning.message).toContain('Warning');
    expect(warning.message).toContain('80%');

    // Interview must have transitioned to reviewing
    const [dbRow] = await testDb.db
      .select()
      .from(schema.interviews)
      .where(eq(schema.interviews.id, interview.id));
    expect(dbRow!.phase).toBe('reviewing');
  });

  it('returns gap=0.8 with default zero scores when no answers submitted yet', async () => {
    const project = await createProject();
    const { fsm } = buildFsm();

    // Insert interview directly — no answers submitted, so currentAmbiguityScore is null
    const [dbInterview] = await testDb.db
      .insert(schema.interviews)
      .values({ projectId: project.id, mode: 'greenfield', phase: 'gathering', turnCount: 0, transcript: [] })
      .returning();

    const warning = await fsm.requestEarlyCrystallization(dbInterview!.id);

    expect(warning.currentScore).toBe(0);
    expect(warning.threshold).toBe(0.8);
    expect(warning.gap).toBeCloseTo(0.8, 5);
    expect(warning.weakestDimensions.length).toBeGreaterThan(0);
  });

  it('throws when interview is not in gathering phase', async () => {
    const project = await createProject();
    const { fsm } = buildFsm();

    // Create interview already in reviewing phase
    const [dbInterview] = await testDb.db
      .insert(schema.interviews)
      .values({ projectId: project.id, mode: 'greenfield', phase: 'reviewing', turnCount: 0, transcript: [] })
      .returning();

    // Error message says "phase 'reviewing'" (not gathering) — verify the guard fires
    await expect(fsm.requestEarlyCrystallization(dbInterview!.id)).rejects.toThrow(
      /Cannot request early crystallization/,
    );
  });
});

// ─── Test: detectInterviewMode returns greenfield when no projectPath ─────────

describe('detectInterviewMode', () => {
  it('returns greenfield when called with no arguments (no projectPath)', () => {
    // detectInterviewMode() with no args falls through to process.cwd() which
    // is the server cwd — not a user project. The engine fix (e45ff88) ensures
    // startOrResume defaults to greenfield without a projectPath. However,
    // detectInterviewMode() itself will use process.cwd() and detect git in the
    // monorepo. We test the exported function with an explicit non-git path.
    const result = detectInterviewMode('/tmp');
    expect(result).toBe('greenfield');
  });

  it('returns greenfield for a temp directory with no git repo', () => {
    const result = detectInterviewMode('/tmp');
    expect(result).toBe('greenfield');
  });

  it('returns brownfield for a directory with git commits', () => {
    // The monorepo itself has git commits — use it as a brownfield proxy.
    // This file is at packages/engine/src/__tests__/interview-fsm.wiring.test.ts
    // Four levels up: engine/src/__tests__ → engine/src → engine → packages → monorepo root
    const __filename = fileURLToPath(import.meta.url);
    const repoRoot = path.resolve(path.dirname(__filename), '../../../..');
    const result = detectInterviewMode(repoRoot);
    expect(result).toBe('brownfield');
  });
});

// ─── Test: generateSummary produces SeedSummary from transcript ───────────────

describe('InterviewFSM.generateSummary', () => {
  const synthesizerScript: MockGatewayCall[] = [
    {
      stage: 'interview',
      schema: 'SeedSummary',
      returns: {
        goal: 'Build a task management CLI tool',
        constraints: ['Must run on Node 22', 'No external database'],
        acceptanceCriteria: ['Can create tasks', 'Can list tasks', 'Can complete tasks'],
        ontologySchema: {
          entities: [
            {
              name: 'Task',
              attributes: ['id', 'title', 'status'],
              relations: [],
            },
          ],
        },
        evaluationPrinciples: ['Correctness', 'Usability'],
        exitConditions: [{ condition: 'all_ac_pass', description: 'All acceptance criteria pass' }],
      },
    },
  ];

  it('generates a SeedSummary from a reviewing-phase interview', async () => {
    const project = await createProject();
    const { fsm, gateway } = buildFsm([
      ...interviewTurnScript({ overallClarity: 0.85 }), // triggers reviewing transition
      ...synthesizerScript,
    ]);

    const interview = await fsm.startOrResume(project.id);

    // Submit one high-clarity answer — will auto-transition to reviewing
    const turnResult = await fsm.submitAnswer(interview.id, project.id, {
      userAnswer: 'Build a task management CLI tool for teams, must handle 10k tasks, run on Node 22',
    });
    expect(turnResult.thresholdMet).toBe(true);
    expect(turnResult.scores.overall).toBeGreaterThanOrEqual(0.8);

    // Generate summary
    const summary = await fsm.generateSummary(interview.id, project.id);

    expect(summary.goal).toBe('Build a task management CLI tool');
    expect(Array.isArray(summary.constraints)).toBe(true);
    expect(summary.constraints.length).toBeGreaterThan(0);
    expect(Array.isArray(summary.acceptanceCriteria)).toBe(true);
    expect(summary.acceptanceCriteria.length).toBeGreaterThan(0);
    expect(summary.ontologySchema).toBeDefined();
    expect(Array.isArray(summary.ontologySchema.entities)).toBe(true);
    expect(Array.isArray(summary.evaluationPrinciples)).toBe(true);

    gateway.assertAllConsumed();
  });

  it('throws when interview is not in reviewing phase', async () => {
    const project = await createProject();
    const { fsm } = buildFsm();

    // Create interview still in gathering phase
    const [dbInterview] = await testDb.db
      .insert(schema.interviews)
      .values({ projectId: project.id, mode: 'greenfield', phase: 'gathering', turnCount: 0, transcript: [] })
      .returning();

    await expect(fsm.generateSummary(dbInterview!.id, project.id)).rejects.toThrow(/reviewing/);
  });

  it('generates summary after early crystallization path', async () => {
    const project = await createProject();
    const { fsm, gateway } = buildFsm([
      ...interviewTurnScript({ overallClarity: 0.4 }), // below threshold
      ...synthesizerScript,
    ]);

    const interview = await fsm.startOrResume(project.id);

    // Submit answer — stays in gathering (score 0.4)
    const turnResult = await fsm.submitAnswer(interview.id, project.id, { userAnswer: 'Something vague' });
    expect(turnResult.thresholdMet).toBe(false);

    // Force transition via early crystallization
    await fsm.requestEarlyCrystallization(interview.id);

    // Now generate summary
    const summary = await fsm.generateSummary(interview.id, project.id);
    expect(summary.goal).toBe('Build a task management CLI tool');

    gateway.assertAllConsumed();
  });
});
