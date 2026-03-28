import { projects, interviews, seeds } from '@get-cauldron/shared';
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
        })
        .returning();
      return row!;
    },
  };
}
