/**
 * Interview router wiring tests.
 *
 * Real PostgreSQL (test DB :5433) + real engine code + mocked LLM gateway.
 * Tests the full tRPC → engine → database chain.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { createTestContext, type TestContext } from '@get-cauldron/test-harness';
import { interviewTurnScript } from '@get-cauldron/test-harness';
import type { MockGatewayCall } from '@get-cauldron/test-harness';
import { eq } from 'drizzle-orm';
import { interviews } from '@get-cauldron/shared';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a test context with enough gateway script for N interview turns.
 * Each turn consumes 5 gateway calls (1 scorer + 3 perspectives + 1 ranker).
 */
async function contextForTurns(
  turnCount: number,
  options?: { lastTurnClarity?: number },
): Promise<TestContext> {
  const script = [];
  for (let i = 0; i < turnCount; i++) {
    const isLast = i === turnCount - 1;
    const clarity = isLast && options?.lastTurnClarity !== undefined
      ? options.lastTurnClarity
      : 0.5;
    script.push(...interviewTurnScript({ overallClarity: clarity }));
  }
  return createTestContext({ gatewayScript: script });
}

// ─── startInterview ───────────────────────────────────────────────────────────

describe('interview.startInterview wiring', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await ctx.truncate();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('creates a new interview row and returns valid state', async () => {
    const project = await ctx.fixtures.project();

    const result = await ctx.caller.interview.startInterview({
      projectId: project.id,
    });

    expect(result.interviewId).toBeDefined();
    expect(typeof result.interviewId).toBe('string');
    expect(result.status).toBe('active');
    expect(result.phase).toBe('gathering');
    expect(result.mode).toBe('greenfield');

    // Verify DB row exists
    const [dbRow] = await ctx.db
      .select()
      .from(interviews)
      .where(eq(interviews.id, result.interviewId));

    expect(dbRow).toBeDefined();
    expect(dbRow!.projectId).toBe(project.id);
    expect(dbRow!.phase).toBe('gathering');
    expect(dbRow!.turnCount).toBe(0);
  });

  it('resumes an existing active interview', async () => {
    const project = await ctx.fixtures.project();

    const first = await ctx.caller.interview.startInterview({
      projectId: project.id,
    });
    const second = await ctx.caller.interview.startInterview({
      projectId: project.id,
    });

    expect(second.interviewId).toBe(first.interviewId);
  });
});

// ─── sendAnswer ───────────────────────────────────────────────────────────────

describe('interview.sendAnswer wiring', () => {
  let ctx: TestContext;

  afterEach(async () => {
    if (ctx) await ctx.truncate();
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  it('appends turn to transcript and updates scores', async () => {
    ctx = await contextForTurns(1);
    const project = await ctx.fixtures.project();
    await ctx.caller.interview.startInterview({ projectId: project.id });

    const result = await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'Build a task management CLI tool',
    });

    expect(result.turnNumber).toBe(1);
    expect(result.currentScores).toBeDefined();
    expect(typeof result.currentScores.goalClarity).toBe('number');
    expect(typeof result.currentScores.overall).toBe('number');
    expect(result.thresholdMet).toBe(false);
    expect(result.phase).toBe('gathering');
    expect(result.nextQuestion).toBeDefined();
    expect(result.turn).toBeDefined();

    // Verify DB state
    const [dbRow] = await ctx.db
      .select()
      .from(interviews)
      .where(eq(interviews.projectId, project.id));

    expect(dbRow!.turnCount).toBe(1);
    expect((dbRow!.transcript as unknown[]).length).toBe(1);
    expect(dbRow!.currentAmbiguityScore).not.toBeNull();

    ctx.gateway.assertAllConsumed();
  });

  it('auto-transitions to reviewing when clarity >= 0.8', async () => {
    ctx = await contextForTurns(1, { lastTurnClarity: 0.9 });
    const project = await ctx.fixtures.project();
    await ctx.caller.interview.startInterview({ projectId: project.id });

    const result = await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'A TypeScript CLI that renames files using regex patterns, runs on macOS/Linux, must handle 10k files in under 5 seconds',
    });

    expect(result.thresholdMet).toBe(true);
    expect(result.phase).toBe('reviewing');
    expect(result.nextQuestion).toBeNull();

    // Verify DB phase transition
    const [dbRow] = await ctx.db
      .select()
      .from(interviews)
      .where(eq(interviews.projectId, project.id));

    expect(dbRow!.phase).toBe('reviewing');
  });

  it('rejects sendAnswer when interview is not in gathering phase', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    // Create interview already in reviewing phase
    await ctx.fixtures.interview({
      projectId: project.id,
      phase: 'reviewing',
    });

    await expect(
      ctx.caller.interview.sendAnswer({
        projectId: project.id,
        answer: 'This should fail',
      }),
    ).rejects.toThrow(/gathering/);
  });

  it('builds coherent transcript across multiple turns', async () => {
    ctx = await contextForTurns(3);
    const project = await ctx.fixtures.project();
    await ctx.caller.interview.startInterview({ projectId: project.id });

    await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'Build a file renamer',
    });
    await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'It should support regex patterns',
    });
    await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'Needs to run on macOS and Linux',
    });

    // Verify accumulated state
    const [dbRow] = await ctx.db
      .select()
      .from(interviews)
      .where(eq(interviews.projectId, project.id));

    expect(dbRow!.turnCount).toBe(3);
    expect((dbRow!.transcript as unknown[]).length).toBe(3);

    ctx.gateway.assertAllConsumed();
  });
});

// ─── getTranscript ────────────────────────────────────────────────────────────

describe('interview.getTranscript wiring', () => {
  let ctx: TestContext;

  afterEach(async () => {
    if (ctx) await ctx.truncate();
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  it('returns not_started when no interview exists', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();

    const result = await ctx.caller.interview.getTranscript({
      projectId: project.id,
    });

    expect(result.status).toBe('not_started');
    expect(result.transcript).toEqual([]);
    expect(result.currentScores).toBeNull();
  });

  it('returns data consistent with what sendAnswer wrote', async () => {
    ctx = await contextForTurns(1);
    const project = await ctx.fixtures.project();
    await ctx.caller.interview.startInterview({ projectId: project.id });

    const sendResult = await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'Build a todo app',
    });

    const transcript = await ctx.caller.interview.getTranscript({
      projectId: project.id,
    });

    expect(transcript.status).toBe('active');
    expect(transcript.phase).toBe('gathering');
    expect(transcript.transcript.length).toBe(1);
    expect(transcript.currentScores).toBeDefined();
    expect(transcript.currentScores!.overall).toBe(sendResult.currentScores.overall);
  });
});

// ─── getSummary ───────────────────────────────────────────────────────────────

describe('interview.getSummary wiring', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await ctx.truncate();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('returns null summary during gathering phase', async () => {
    const project = await ctx.fixtures.project();
    await ctx.fixtures.interview({ projectId: project.id, phase: 'gathering' });

    const result = await ctx.caller.interview.getSummary({
      projectId: project.id,
    });

    expect(result.summary).toBeNull();
    expect(result.phase).toBe('gathering');
  });

  it('returns seed data when interview is in approved phase', async () => {
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({
      projectId: project.id,
      phase: 'approved',
    });
    await ctx.fixtures.seed({
      projectId: project.id,
      interviewId: interview.id,
      goal: 'Build a task manager',
    });

    const result = await ctx.caller.interview.getSummary({
      projectId: project.id,
    });

    expect(result.summary).toBeDefined();
    expect(result.summary!.goal).toBe('Build a task manager');
    expect(result.phase).toBe('approved');
  });
});

// ─── approveSummary (crystallization) ─────────────────────────────────────────

describe('interview.approveSummary wiring', () => {
  let ctx: TestContext;

  afterEach(async () => {
    if (ctx) await ctx.truncate();
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  const mockSummary = {
    goal: 'Build a task management CLI',
    constraints: ['Must run on Node 22', 'No external DB'],
    acceptanceCriteria: ['Can create tasks', 'Can list tasks', 'Can complete tasks'],
    ontologySchema: {
      entities: [
        { name: 'Task', attributes: ['id', 'title', 'status'], relations: [] },
      ],
    },
    evaluationPrinciples: ['Correctness over performance'],
    exitConditions: [{ condition: 'all_ac_pass', description: 'All acceptance criteria pass' }],
  };

  it('creates seed record and transitions interview to crystallized', async () => {
    // Gateway script: holdout generation needs generateObject calls too
    // approveSummary calls crystallizeSeed (no LLM) then generateHoldoutScenarios (1 LLM call)
    const holdoutScript: MockGatewayCall[] = [
      {
        stage: 'holdout',
        returns: {
          scenarios: Array.from({ length: 5 }, (_, i) => ({
            id: `scenario-${i}`,
            name: `Test scenario ${i + 1}`,
            description: `Given X, when Y, then Z (scenario ${i + 1})`,
            testCode: `expect(true).toBe(true); // scenario ${i + 1}`,
          })),
        },
      },
    ];
    ctx = await createTestContext({ gatewayScript: holdoutScript });

    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({
      projectId: project.id,
      phase: 'reviewing',
      currentAmbiguityScore: { goalClarity: 0.9, constraintClarity: 0.85, successCriteriaClarity: 0.88, overall: 0.88, reasoning: 'Clear' },
    });

    const result = await ctx.caller.interview.approveSummary({
      projectId: project.id,
      summary: mockSummary,
    });

    expect(result.seedId).toBeDefined();
    expect(result.version).toBe(1);

    // Verify interview transitioned
    const [dbInterview] = await ctx.db
      .select()
      .from(interviews)
      .where(eq(interviews.id, interview.id));

    expect(dbInterview!.phase).toBe('crystallized');
    expect(dbInterview!.status).toBe('completed');
  });

  it('rejects if interview is not in reviewing phase', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    await ctx.fixtures.interview({
      projectId: project.id,
      phase: 'gathering',
    });

    await expect(
      ctx.caller.interview.approveSummary({
        projectId: project.id,
        summary: mockSummary,
      }),
    ).rejects.toThrow(/reviewing/);
  });

  it('throws on double crystallization', async () => {
    const holdoutScript: MockGatewayCall[] = [
      {
        stage: 'holdout',
        returns: {
          scenarios: Array.from({ length: 5 }, (_, i) => ({
            id: `scenario-${i}`,
            name: `Scenario ${i + 1}`,
            description: `Test ${i + 1}`,
            testCode: `expect(1).toBe(1);`,
          })),
        },
      },
    ];
    ctx = await createTestContext({ gatewayScript: holdoutScript });

    const project = await ctx.fixtures.project();
    await ctx.fixtures.interview({
      projectId: project.id,
      phase: 'reviewing',
      currentAmbiguityScore: { overall: 0.88 },
    });

    // First crystallization succeeds
    await ctx.caller.interview.approveSummary({
      projectId: project.id,
      summary: mockSummary,
    });

    // Second should fail — interview is now crystallized, so the phase guard catches it
    await expect(
      ctx.caller.interview.approveSummary({
        projectId: project.id,
        summary: mockSummary,
      }),
    ).rejects.toThrow();
  });
});

// ─── rejectSummary ────────────────────────────────────────────────────────────

describe('interview.rejectSummary wiring', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await ctx.truncate();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('transitions interview back to gathering', async () => {
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({
      projectId: project.id,
      phase: 'reviewing',
    });

    const result = await ctx.caller.interview.rejectSummary({
      projectId: project.id,
    });

    expect(result.phase).toBe('gathering');

    // Verify DB
    const [dbRow] = await ctx.db
      .select()
      .from(interviews)
      .where(eq(interviews.id, interview.id));

    expect(dbRow!.phase).toBe('gathering');
  });
});
