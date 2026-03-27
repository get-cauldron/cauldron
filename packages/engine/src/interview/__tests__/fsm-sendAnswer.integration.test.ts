/**
 * Integration test: InterviewFSM.submitAnswer with real PostgreSQL.
 * Proves the full sendAnswer path:
 *   answer submitted to real DB interview row
 *   -> FSM scores via mocked LLM gateway (no real API calls)
 *   -> next question generated and returned as TurnResult
 *   -> DB state updated (turnCount, transcript, currentAmbiguityScore)
 *
 * IMPORTANT: Database is NOT mocked. Uses real Postgres (test DB, port 5433).
 * InterviewFSM is NOT mocked. Only the LLM gateway generateObject is mocked.
 */
import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, runMigrations, truncateAll } from '../../__tests__/setup.js';
import * as schema from '@get-cauldron/shared';
import { InterviewFSM } from '../fsm.js';
import type { LLMGateway } from '../../gateway/gateway.js';
import type { GatewayConfig } from '../../gateway/config.js';

// ─── DB setup ─────────────────────────────────────────────────────────────────

let testDb: ReturnType<typeof createTestDb>;

beforeAll(async () => {
  testDb = createTestDb();
  await runMigrations(testDb.db);
});

afterEach(async () => {
  await truncateAll(testDb.db);
  vi.clearAllMocks();
});

afterAll(async () => {
  await testDb.client.end();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createTestProject(name = 'Integration Test') {
  const [project] = await testDb.db
    .insert(schema.projects)
    .values({ name })
    .returning();
  return project!;
}

async function createTestInterview(projectId: string) {
  const [interview] = await testDb.db
    .insert(schema.interviews)
    .values({
      projectId,
      mode: 'greenfield',
      phase: 'gathering',
      transcript: [],
      turnCount: 0,
    })
    .returning();
  return interview!;
}

// ─── Mock config and logger ───────────────────────────────────────────────────

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
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as any;

// ─── Mock gateway builder ─────────────────────────────────────────────────────

/**
 * Builds a mock LLMGateway where generateObject returns responses matching the
 * call sequence that submitAnswer drives:
 *   1. scoreTranscript → generateObject (scorer prompt)
 *   2. runActivePerspectives → generateObject x3 (one per perspective: researcher, simplifier, breadth-keeper)
 *   3. rankCandidates → generateObject (ranker prompt)
 *
 * All calls return { object: ... } following Vercel AI SDK pattern.
 */
function buildMockGateway(overallScore = 0.5): Pick<LLMGateway, 'generateObject'> {
  const generateObject = vi.fn();

  // Call 1: scorer → returns greenfield scores
  generateObject.mockResolvedValueOnce({
    object: {
      goalClarity: overallScore,
      constraintClarity: overallScore,
      successCriteriaClarity: overallScore,
      reasoning: 'Test scoring result',
    },
  });

  // Calls 2-4: three perspective calls (researcher, simplifier, breadth-keeper for turn 0)
  const perspectiveResponse = (name: string) => ({
    object: {
      question: `What is the primary goal of your ${name} requirement?`,
      rationale: `This question explores the ${name} dimension of the project.`,
    },
  });

  generateObject.mockResolvedValueOnce(perspectiveResponse('researcher'));
  generateObject.mockResolvedValueOnce(perspectiveResponse('simplifier'));
  generateObject.mockResolvedValueOnce(perspectiveResponse('breadth-keeper'));

  // Call 5: ranker → selects first candidate (index 0)
  generateObject.mockResolvedValueOnce({
    object: {
      selectedIndex: 0,
      mcOptions: ['Option A: Simple approach', 'Option B: Standard approach', 'Option C: Advanced approach'],
      selectionRationale: 'This question best reduces ambiguity at this stage.',
    },
  });

  return { generateObject } as unknown as Pick<LLMGateway, 'generateObject'>;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('InterviewFSM.submitAnswer with real DB', () => {
  it('inserts turn and returns TurnResult with nextQuestion when threshold not met', async () => {
    const project = await createTestProject();
    const interview = await createTestInterview(project.id);

    const mockGateway = buildMockGateway(0.5); // below 0.8 threshold
    const fsm = new InterviewFSM(
      testDb.db as any,
      mockGateway as any,
      mockConfig,
      mockLogger,
    );

    const result = await fsm.submitAnswer(interview.id, project.id, {
      userAnswer: 'Build a CLI tool for bulk file renaming',
    });

    // Assert TurnResult shape
    expect(result.turn.turnNumber).toBe(1);
    expect(typeof result.scores.goalClarity).toBe('number');
    expect(typeof result.scores.constraintClarity).toBe('number');
    expect(typeof result.scores.successCriteriaClarity).toBe('number');
    expect(typeof result.scores.overall).toBe('number');
    expect(result.nextQuestion).not.toBeNull();
    expect(result.thresholdMet).toBe(false);

    // Assert next question has expected shape
    expect(result.nextQuestion!.selectedCandidate).toBeDefined();
    expect(typeof result.nextQuestion!.selectedCandidate.question).toBe('string');
    expect(Array.isArray(result.nextQuestion!.mcOptions)).toBe(true);
    expect(result.nextQuestion!.mcOptions.length).toBeGreaterThan(0);

    // Assert DB state changed
    const [updated] = await testDb.db
      .select()
      .from(schema.interviews)
      .where(eq(schema.interviews.id, interview.id));

    expect(updated).toBeDefined();
    expect(updated!.turnCount).toBe(1);
    expect(updated!.currentAmbiguityScore).not.toBeNull();
    expect((updated!.transcript as unknown[]).length).toBe(1);

    // Verify gateway was called the expected number of times:
    // 1 scorer + 3 perspective + 1 ranker = 5
    expect(mockGateway.generateObject).toHaveBeenCalledTimes(5);
  });

  it('transitions interview to reviewing phase when clarity threshold is met', async () => {
    const project = await createTestProject();
    const interview = await createTestInterview(project.id);

    const mockGateway = buildMockGateway(0.9); // well above 0.8 threshold
    const fsm = new InterviewFSM(
      testDb.db as any,
      mockGateway as any,
      mockConfig,
      mockLogger,
    );

    const result = await fsm.submitAnswer(interview.id, project.id, {
      userAnswer: 'Build a TypeScript CLI tool that renames files using regex patterns, runs on Unix/macOS, and must complete under 5 seconds for 10,000 files',
    });

    // Assert threshold was met
    expect(result.thresholdMet).toBe(true);
    expect(result.nextQuestion).toBeNull();

    // Assert DB state: interview transitioned to reviewing
    const [updated] = await testDb.db
      .select()
      .from(schema.interviews)
      .where(eq(schema.interviews.id, interview.id));

    expect(updated).toBeDefined();
    expect(updated!.phase).toBe('reviewing');
    expect(updated!.turnCount).toBe(1);
    expect(updated!.currentAmbiguityScore).not.toBeNull();
    expect((updated!.transcript as unknown[]).length).toBe(1);
  });
});
