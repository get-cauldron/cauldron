import { describe, it, expect, vi } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// Mocks — must be hoisted before any imports that transitively touch them
// ────────────────────────────────────────────────────────────────────────────

vi.mock('@get-cauldron/engine', () => ({
  findReadyBeads: vi.fn(),
  inngest: { send: vi.fn() },
  runDecomposition: vi.fn(),
  InterviewFSM: vi.fn(function (this: unknown) {
    Object.assign(this as object, { startOrResume: vi.fn(), submitAnswer: vi.fn() });
  }),
  crystallizeSeed: vi.fn(),
  generateHoldoutScenarios: vi.fn(),
  createVault: vi.fn(),
  approveScenarios: vi.fn(),
  sealVault: vi.fn(),
  synthesizeFromTranscript: vi.fn(),
  ImmutableSeedError: class ImmutableSeedError extends Error {},
}));

vi.mock('@get-cauldron/shared', () => ({
  db: {},
  appendEvent: vi.fn().mockResolvedValue(undefined),
  beads: {},
  beadEdges: {},
  events: {},
  seeds: {},
  interviews: {},
  holdoutVault: {},
  projects: {},
  llmUsage: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => `eq`),
  desc: vi.fn(() => `desc`),
  inArray: vi.fn(() => `inArray`),
  sql: vi.fn(),
}));

// ────────────────────────────────────────────────────────────────────────────
// Import routers AFTER mocks are registered
// ────────────────────────────────────────────────────────────────────────────

const { projectsRouter } = await import('../projects.js');
const { interviewRouter } = await import('../interview.js');
const { executionRouter } = await import('../execution.js');

// ────────────────────────────────────────────────────────────────────────────
// Unauthenticated context — simulates request with no/invalid API key
// ────────────────────────────────────────────────────────────────────────────

const unauthCtx = {
  db: {} as any,
  authenticated: false,
  getEngineDeps: async () => { throw new Error('should not be called'); },
};

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe('Auth Middleware — SEC-02', () => {
  describe('projects mutations reject when unauthenticated', () => {
    const caller = projectsRouter.createCaller(unauthCtx);

    it('projects.create rejects with UNAUTHORIZED', async () => {
      await expect(
        caller.create({ name: 'blocked' })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('projects.archive rejects with UNAUTHORIZED', async () => {
      await expect(
        caller.archive({ id: '00000000-0000-0000-0000-000000000000' })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('projects.delete rejects with UNAUTHORIZED', async () => {
      await expect(
        caller.delete({ id: '00000000-0000-0000-0000-000000000000' })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('projects.updateSettings rejects with UNAUTHORIZED', async () => {
      await expect(
        caller.updateSettings({
          id: '00000000-0000-0000-0000-000000000000',
          settings: {},
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  describe('interview mutations reject when unauthenticated', () => {
    const caller = interviewRouter.createCaller(unauthCtx);

    it('interview.startInterview rejects with UNAUTHORIZED', async () => {
      await expect(
        caller.startInterview({ projectId: 'test' })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('interview.sendAnswer rejects with UNAUTHORIZED', async () => {
      await expect(
        caller.sendAnswer({ projectId: 'test', answer: 'test' })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('interview.approveSummary rejects with UNAUTHORIZED', async () => {
      await expect(
        caller.approveSummary({
          projectId: 'test',
          summary: {
            goal: 'test',
            constraints: [],
            acceptanceCriteria: [],
            ontologySchema: { entities: [] },
            evaluationPrinciples: [],
            exitConditions: [],
          },
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('interview.rejectSummary rejects with UNAUTHORIZED', async () => {
      await expect(
        caller.rejectSummary({ projectId: 'test' })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('interview.approveHoldout rejects with UNAUTHORIZED', async () => {
      await expect(
        caller.approveHoldout({ holdoutId: '00000000-0000-0000-0000-000000000000' })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('interview.rejectHoldout rejects with UNAUTHORIZED', async () => {
      await expect(
        caller.rejectHoldout({ holdoutId: '00000000-0000-0000-0000-000000000000' })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('interview.sealHoldouts rejects with UNAUTHORIZED', async () => {
      await expect(
        caller.sealHoldouts({ seedId: '00000000-0000-0000-0000-000000000000' })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  describe('execution mutations reject when unauthenticated', () => {
    const caller = executionRouter.createCaller(unauthCtx);

    it('execution.triggerDecomposition rejects with UNAUTHORIZED', async () => {
      await expect(
        caller.triggerDecomposition({
          projectId: '00000000-0000-0000-0000-000000000000',
          seedId: '00000000-0000-0000-0000-000000000000',
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('execution.triggerExecution rejects with UNAUTHORIZED', async () => {
      await expect(
        caller.triggerExecution({
          projectId: '00000000-0000-0000-0000-000000000000',
          seedId: '00000000-0000-0000-0000-000000000000',
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('execution.respondToEscalation rejects with UNAUTHORIZED', async () => {
      await expect(
        caller.respondToEscalation({
          projectId: '00000000-0000-0000-0000-000000000000',
          action: 'retry',
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  describe('queries pass through when unauthenticated', () => {
    // projects.list is a query — it should be accessible without authentication.
    // We use a more explicit mock to simulate the Drizzle builder chain.
    it('projects.list does not reject with UNAUTHORIZED when unauthenticated', async () => {
      // Build a mock that satisfies the LATERAL SQL query path
      const executeResult: unknown[] = [];
      const mockExecute = vi.fn().mockResolvedValue(executeResult);
      const listDb = {
        execute: mockExecute,
      } as any;

      const listCaller = projectsRouter.createCaller({
        ...unauthCtx,
        db: listDb,
      });

      // The call may fail for DB reasons (mock doesn't fully model the query builder)
      // but it must NOT fail with UNAUTHORIZED — that's what we're testing here.
      try {
        await listCaller.list();
      } catch (err: unknown) {
        // Acceptable: DB errors from incomplete mock
        const error = err as { code?: string };
        expect(error.code).not.toBe('UNAUTHORIZED');
      }
    });

    it('interview.getTranscript does not reject with UNAUTHORIZED when unauthenticated', async () => {
      const chainable = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      const queryDb = { select: vi.fn().mockReturnValue(chainable) } as any;

      const queryCaller = interviewRouter.createCaller({
        ...unauthCtx,
        db: queryDb,
      });

      // getTranscript should not throw UNAUTHORIZED (it's a query)
      const result = await queryCaller.getTranscript({ projectId: 'test' });
      expect(result.status).toBe('not_started');
    });
  });
});
