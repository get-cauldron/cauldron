import { projects, interviews, seeds, beads, beadEdges, holdoutVault, llmUsage } from '@get-cauldron/shared';
import type { DbClient } from '@get-cauldron/shared';

/**
 * Test data factory for wiring tests.
 * Creates real database rows with sensible defaults.
 * Each method returns the inserted row.
 */
export function fixtures(db: DbClient) {
  return {
    /**
     * Create a project. Returns the full row.
     */
    async project(overrides?: { name?: string; description?: string }) {
      const [row] = await db
        .insert(projects)
        .values({
          name: overrides?.name ?? 'Test Project',
          description: overrides?.description ?? 'Created by test-harness fixtures',
        })
        .returning();
      return row!;
    },

    /**
     * Create an interview linked to a project.
     * Defaults to greenfield mode, gathering phase, empty transcript.
     */
    async interview(opts: {
      projectId: string;
      phase?: 'gathering' | 'reviewing' | 'approved' | 'crystallized';
      mode?: 'greenfield' | 'brownfield';
      turnCount?: number;
      transcript?: unknown[];
      currentAmbiguityScore?: unknown;
    }) {
      const [row] = await db
        .insert(interviews)
        .values({
          projectId: opts.projectId,
          mode: opts.mode ?? 'greenfield',
          phase: opts.phase ?? 'gathering',
          turnCount: opts.turnCount ?? 0,
          transcript: opts.transcript ?? [],
          currentAmbiguityScore: opts.currentAmbiguityScore ?? null,
        })
        .returning();
      return row!;
    },

    /**
     * Create a seed linked to a project and interview.
     * Defaults to crystallized status with placeholder summary fields.
     */
    async seed(opts: {
      projectId: string;
      interviewId: string;
      goal?: string;
      constraints?: unknown[];
      acceptanceCriteria?: unknown[];
      ontologySchema?: unknown;
      evaluationPrinciples?: unknown[];
      exitConditions?: unknown;
      ambiguityScore?: number;
      version?: number;
      parentId?: string;
      generation?: number;
    }) {
      const [row] = await db
        .insert(seeds)
        .values({
          projectId: opts.projectId,
          interviewId: opts.interviewId,
          parentId: opts.parentId ?? null,
          version: opts.version ?? 1,
          status: 'crystallized',
          goal: opts.goal ?? 'Test goal',
          constraints: opts.constraints ?? ['constraint-1'],
          acceptanceCriteria: opts.acceptanceCriteria ?? ['ac-1', 'ac-2'],
          ontologySchema: opts.ontologySchema ?? { entities: [] },
          evaluationPrinciples: opts.evaluationPrinciples ?? ['principle-1'],
          exitConditions: opts.exitConditions ?? [{ condition: 'done', description: 'done' }],
          ambiguityScore: opts.ambiguityScore ?? 0.85,
          crystallizedAt: new Date(),
          generation: opts.generation ?? 0,
        })
        .returning();
      return row!;
    },

    /**
     * Create a bead linked to a seed.
     * Defaults to pending status with placeholder spec.
     */
    async bead(opts: {
      seedId: string;
      moleculeId?: string | null;
      title?: string;
      spec?: string;
      status?: 'pending' | 'claimed' | 'active' | 'completed' | 'failed';
      estimatedTokens?: number;
      coversCriteria?: string[];
    }) {
      const [row] = await db
        .insert(beads)
        .values({
          seedId: opts.seedId,
          moleculeId: opts.moleculeId ?? null,
          title: opts.title ?? 'Test Bead',
          spec: opts.spec ?? 'Implement test functionality',
          status: opts.status ?? 'pending',
          estimatedTokens: opts.estimatedTokens ?? 5000,
          coversCriteria: opts.coversCriteria ?? [],
        })
        .returning();
      return row!;
    },

    /**
     * Create a bead edge linking two beads.
     * Defaults to 'blocks' edge type.
     */
    async beadEdge(opts: {
      fromBeadId: string;
      toBeadId: string;
      edgeType?: 'blocks' | 'parent_child' | 'conditional_blocks' | 'waits_for';
    }) {
      const [row] = await db
        .insert(beadEdges)
        .values({
          fromBeadId: opts.fromBeadId,
          toBeadId: opts.toBeadId,
          edgeType: opts.edgeType ?? 'blocks',
        })
        .returning();
      return row!;
    },

    /**
     * Create a holdout vault entry linked to a seed.
     * Defaults to pending_review status with 5 generated scenarios.
     */
    async holdoutVault(opts: {
      seedId: string;
      status?: 'pending_review' | 'approved' | 'sealed' | 'unsealed' | 'evaluated';
      draftScenarios?: unknown[];
    }) {
      const defaultScenarios = Array.from({ length: 5 }, (_, i) => ({
        id: `scenario-${i + 1}`,
        name: `Test Scenario ${i + 1}`,
        description: `Holdout scenario ${i + 1} for testing`,
        testCode: `test('scenario ${i + 1}', () => { expect(true).toBe(true); });`,
        category: 'functional',
      }));
      const [row] = await db
        .insert(holdoutVault)
        .values({
          seedId: opts.seedId,
          status: opts.status ?? 'pending_review',
          draftScenarios: opts.draftScenarios ?? defaultScenarios,
        })
        .returning();
      return row!;
    },

    /**
     * Create an LLM usage record linked to a project.
     * Defaults to interview stage with claude-sonnet-4-6 model.
     */
    async llmUsage(opts: {
      projectId: string;
      beadId?: string | null;
      seedId?: string | null;
      evolutionCycle?: number | null;
      stage?: string;
      model?: string;
      promptTokens?: number;
      completionTokens?: number;
      costCents?: number;
    }) {
      const prompt = opts.promptTokens ?? 1000;
      const completion = opts.completionTokens ?? 500;
      const [row] = await db
        .insert(llmUsage)
        .values({
          projectId: opts.projectId,
          beadId: opts.beadId ?? null,
          seedId: opts.seedId ?? null,
          evolutionCycle: opts.evolutionCycle ?? null,
          stage: opts.stage ?? 'interview',
          model: opts.model ?? 'claude-sonnet-4-6',
          promptTokens: prompt,
          completionTokens: completion,
          totalTokens: prompt + completion,
          costCents: opts.costCents ?? 10,
        })
        .returning();
      return row!;
    },

    /**
     * Append an event to the event store linked to a project.
     * Uses the shared appendEvent helper for consistent event sourcing.
     */
    async event(opts: {
      projectId: string;
      seedId?: string | null;
      beadId?: string | null;
      type: string;
      payload?: Record<string, unknown>;
    }) {
      const { appendEvent } = await import('@get-cauldron/shared');
      return appendEvent(db, {
        projectId: opts.projectId,
        seedId: opts.seedId ?? null,
        beadId: opts.beadId ?? null,
        type: opts.type as any,
        payload: opts.payload ?? {},
      });
    },
  };
}
