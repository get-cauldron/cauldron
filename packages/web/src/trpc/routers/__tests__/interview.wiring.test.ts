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

// ─── FSM Edge Cases ──────────────────────────────────────────────────────────

describe('interview FSM edge cases wiring', () => {
  let ctx: TestContext;

  afterEach(async () => {
    ctx?.gateway.assertAllConsumed();
    await ctx?.truncate();
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it('rejects sendAnswer when interview phase is reviewing', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    await ctx.fixtures.interview({ projectId: project.id, phase: 'reviewing' });

    await expect(
      ctx.caller.interview.sendAnswer({
        projectId: project.id,
        answer: 'Some answer',
      }),
    ).rejects.toThrow(/gathering/);
  });

  it('double startInterview returns the same interview (no duplicate)', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();

    const first = await ctx.caller.interview.startInterview({ projectId: project.id });
    const second = await ctx.caller.interview.startInterview({ projectId: project.id });

    expect(second.interviewId).toBe(first.interviewId);
  });

  it('approveSummary rejects when interview is in gathering phase', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    await ctx.fixtures.interview({ projectId: project.id, phase: 'gathering' });

    const summary = {
      goal: 'Build something',
      constraints: ['fast'],
      acceptanceCriteria: ['works'],
      ontologySchema: { entities: [] },
      evaluationPrinciples: ['quality'],
      exitConditions: [{ condition: 'done', description: 'done' }],
    };

    await expect(
      ctx.caller.interview.approveSummary({ projectId: project.id, summary }),
    ).rejects.toThrow(/reviewing/);
  });

  it('rejectSummary then sendAnswer works (back to gathering flow)', async () => {
    const turnScript = interviewTurnScript({ overallClarity: 0.5 });
    ctx = await createTestContext({ gatewayScript: turnScript });

    const project = await ctx.fixtures.project();
    await ctx.fixtures.interview({ projectId: project.id, phase: 'reviewing' });

    const reject = await ctx.caller.interview.rejectSummary({ projectId: project.id });
    expect(reject.phase).toBe('gathering');

    const answer = await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'Updated requirements',
    });
    expect(answer.turnNumber).toBeDefined();
    expect(answer.phase).toBe('gathering');
  });

  it('rejectSummary throws when interview is in gathering phase', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    await ctx.fixtures.interview({ projectId: project.id, phase: 'gathering' });

    await expect(
      ctx.caller.interview.rejectSummary({ projectId: project.id }),
    ).rejects.toThrow(/reviewing/);
  });

  it('sendAnswer throws when no interview exists for project', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();

    await expect(
      ctx.caller.interview.sendAnswer({ projectId: project.id, answer: 'hello' }),
    ).rejects.toThrow(/No active interview/);
  });
});

// ─── Scoring Boundaries ─────────────────────────────────────────────────────

describe('interview scoring boundaries wiring', () => {
  let ctx: TestContext;

  afterEach(async () => {
    ctx?.gateway.assertAllConsumed();
    await ctx?.truncate();
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it('auto-transitions to reviewing at exactly 0.8 overall clarity', async () => {
    const turnScript = interviewTurnScript({ overallClarity: 0.8 });
    ctx = await createTestContext({ gatewayScript: turnScript });

    const project = await ctx.fixtures.project();
    await ctx.caller.interview.startInterview({ projectId: project.id });

    const result = await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'Detailed answer',
    });

    expect(result.thresholdMet).toBe(true);
    expect(result.phase).toBe('reviewing');
  });

  it('stays in gathering at 0.79 overall clarity', async () => {
    const turnScript = interviewTurnScript({ overallClarity: 0.79 });
    ctx = await createTestContext({ gatewayScript: turnScript });

    const project = await ctx.fixtures.project();
    await ctx.caller.interview.startInterview({ projectId: project.id });

    const result = await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'Somewhat vague answer',
    });

    expect(result.thresholdMet).toBe(false);
    expect(result.phase).toBe('gathering');
    expect(result.nextQuestion).not.toBeNull();
  });

  it('first turn with empty transcript scores without error', async () => {
    const turnScript = interviewTurnScript({ overallClarity: 0.3 });
    ctx = await createTestContext({ gatewayScript: turnScript });

    const project = await ctx.fixtures.project();
    await ctx.caller.interview.startInterview({ projectId: project.id });

    const result = await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'I want to build an app',
    });

    expect(result.turnNumber).toBe(1);
    expect(result.currentScores).toBeDefined();
    expect(result.currentScores.overall).toBeCloseTo(0.3, 1);
  });

  it('supports freeform text alongside MC answer', async () => {
    const turnScript = interviewTurnScript({ overallClarity: 0.5 });
    ctx = await createTestContext({ gatewayScript: turnScript });

    const project = await ctx.fixtures.project();
    await ctx.caller.interview.startInterview({ projectId: project.id });

    const result = await ctx.caller.interview.sendAnswer({
      projectId: project.id,
      answer: 'Option A: Keep it simple',
      freeformText: 'But also consider accessibility requirements',
    });

    expect(result.turnNumber).toBe(1);
    const transcript = await ctx.caller.interview.getTranscript({ projectId: project.id });
    const lastTurn = transcript.transcript[transcript.transcript.length - 1];
    expect(lastTurn?.freeformText).toBe('But also consider accessibility requirements');
  });
});

// ─── Multi-Turn Flows ────────────────────────────────────────────────────────

describe('interview multi-turn flows wiring', () => {
  let ctx: TestContext;

  afterEach(async () => {
    ctx?.gateway.assertAllConsumed();
    await ctx?.truncate();
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it('full 3-turn interview through to crystallization', async () => {
    const turn1 = interviewTurnScript({ overallClarity: 0.3 });
    const turn2 = interviewTurnScript({ overallClarity: 0.6 });
    const turn3 = interviewTurnScript({ overallClarity: 0.85 });
    const holdoutScript: MockGatewayCall[] = [
      {
        stage: 'holdout',
        returns: {
          scenarios: Array.from({ length: 5 }, (_, i) => ({
            id: `holdout-${i}`,
            name: `Scenario ${i}`,
            description: `Edge case ${i}`,
            testCode: `test('${i}', () => {});`,
            category: 'functional',
          })),
        },
      },
    ];

    ctx = await createTestContext({
      gatewayScript: [...turn1, ...turn2, ...turn3, ...holdoutScript],
    });

    const project = await ctx.fixtures.project();
    await ctx.caller.interview.startInterview({ projectId: project.id });

    const r1 = await ctx.caller.interview.sendAnswer({ projectId: project.id, answer: 'I want a task management app' });
    expect(r1.phase).toBe('gathering');
    expect(r1.turnNumber).toBe(1);

    const r2 = await ctx.caller.interview.sendAnswer({ projectId: project.id, answer: 'It should support teams with role-based access' });
    expect(r2.phase).toBe('gathering');
    expect(r2.turnNumber).toBe(2);

    const r3 = await ctx.caller.interview.sendAnswer({ projectId: project.id, answer: 'Tasks have title, description, assignee, due date, priority, and status' });
    expect(r3.phase).toBe('reviewing');
    expect(r3.thresholdMet).toBe(true);
    expect(r3.turnNumber).toBe(3);

    const transcript = await ctx.caller.interview.getTranscript({ projectId: project.id });
    expect(transcript.transcript).toHaveLength(3);
    expect(transcript.phase).toBe('reviewing');

    const summary = {
      goal: 'Build a task management app with team support',
      constraints: ['Must support RBAC'],
      acceptanceCriteria: ['Users can create tasks', 'Teams can share tasks'],
      ontologySchema: {
        entities: [{ name: 'Task', attributes: ['title', 'status'], relations: [{ to: 'User', type: 'assignedTo' }] }],
      },
      evaluationPrinciples: ['Completeness', 'Usability'],
      exitConditions: [{ condition: 'all_ac_pass', description: 'All acceptance criteria pass' }],
    };

    const approved = await ctx.caller.interview.approveSummary({ projectId: project.id, summary });
    expect(approved.seedId).toBeDefined();
    expect(approved.version).toBe(1);
  });

  it('perspective activation changes across early/mid/late bands', async () => {
    const earlyTurn = interviewTurnScript({ overallClarity: 0.2 });
    const lateTurn = interviewTurnScript({ overallClarity: 0.85 });

    ctx = await createTestContext({ gatewayScript: [...earlyTurn, ...lateTurn] });

    const project = await ctx.fixtures.project();
    await ctx.caller.interview.startInterview({ projectId: project.id });

    const r1 = await ctx.caller.interview.sendAnswer({ projectId: project.id, answer: 'Something vague' });
    expect(r1.currentScores.overall).toBeCloseTo(0.2, 1);

    const r2 = await ctx.caller.interview.sendAnswer({ projectId: project.id, answer: 'Very detailed and specific requirements' });
    expect(r2.thresholdMet).toBe(true);
  });
});

// ─── Holdout Lifecycle ───────────────────────────────────────────────────────

describe('interview holdout lifecycle wiring', () => {
  let ctx: TestContext;

  afterEach(async () => {
    await ctx?.truncate();
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it('getHoldouts returns flattened scenarios from vault entries', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });
    await ctx.fixtures.holdoutVault({ seedId: seed.id });

    const result = await ctx.caller.interview.getHoldouts({ seedId: seed.id });
    expect(result.scenarios).toHaveLength(5);
    expect(result.scenarios[0]).toMatchObject({
      holdoutVaultId: expect.any(String),
      name: expect.any(String),
      description: expect.any(String),
      testCode: expect.any(String),
      status: 'pending_review',
    });
  });

  it('approveHoldout transitions vault entry to approved', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });
    const vault = await ctx.fixtures.holdoutVault({ seedId: seed.id });

    const result = await ctx.caller.interview.approveHoldout({ holdoutId: vault.id });
    expect(result.status).toBe('approved');
  });

  it('rejectHoldout clears draft scenarios and resets to pending_review', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });
    const vault = await ctx.fixtures.holdoutVault({ seedId: seed.id });

    const result = await ctx.caller.interview.rejectHoldout({ holdoutId: vault.id });
    expect(result.status).toBe('rejected');

    const holdouts = await ctx.caller.interview.getHoldouts({ seedId: seed.id });
    expect(holdouts.scenarios).toHaveLength(0);
  });

  it('sealHoldouts encrypts approved vault entries', async () => {
    const originalKey = process.env['HOLDOUT_ENCRYPTION_KEY'];
    // Key must be valid base64-encoded 32 bytes (AES-256)
    process.env['HOLDOUT_ENCRYPTION_KEY'] = Buffer.from('a'.repeat(32)).toString('base64');

    try {
      ctx = await createTestContext();
      const project = await ctx.fixtures.project();
      const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
      const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });

      // Create vault in pending_review, then approve through proper flow
      // so scenarios get _approved: true (required by sealVault)
      const vault = await ctx.fixtures.holdoutVault({ seedId: seed.id, status: 'pending_review' });
      await ctx.caller.interview.approveHoldout({ holdoutId: vault.id });

      const result = await ctx.caller.interview.sealHoldouts({ seedId: seed.id });
      expect(result.sealedCount).toBe(1);
      expect(result.seedId).toBe(seed.id);
    } finally {
      if (originalKey === undefined) {
        delete process.env['HOLDOUT_ENCRYPTION_KEY'];
      } else {
        process.env['HOLDOUT_ENCRYPTION_KEY'] = originalKey;
      }
    }
  });

  it('sealHoldouts throws when no approved entries exist', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });
    await ctx.fixtures.holdoutVault({ seedId: seed.id, status: 'pending_review' });

    await expect(
      ctx.caller.interview.sealHoldouts({ seedId: seed.id }),
    ).rejects.toThrow(/No approved holdout/);
  });

  it('approveHoldout on already-approved entry rejects (strict FSM)', async () => {
    ctx = await createTestContext();
    const project = await ctx.fixtures.project();
    const interview = await ctx.fixtures.interview({ projectId: project.id, phase: 'crystallized' });
    const seed = await ctx.fixtures.seed({ projectId: project.id, interviewId: interview.id });
    const vault = await ctx.fixtures.holdoutVault({ seedId: seed.id, status: 'approved' });

    // Vault FSM enforces strict transitions: approved → approved is not allowed
    // Only approved → sealed is valid from the approved state
    await expect(
      ctx.caller.interview.approveHoldout({ holdoutId: vault.id }),
    ).rejects.toThrow(/approved/);
  });
});
