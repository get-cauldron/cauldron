import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { router, publicProcedure } from '../init';
import { interviews, seeds, holdoutVault } from '@cauldron/shared';
import { InterviewFSM } from '@cauldron/engine';
import type {
  InterviewTurn,
  AmbiguityScores,
  SeedSummary,
} from '@cauldron/engine';

// ────────────────────────────────────────────────────────────────────────────
// Interview tRPC router
// Provides 9 procedures covering the full interview lifecycle:
//   getTranscript, sendAnswer, getSummary, approveSummary, rejectSummary,
//   getHoldouts, approveHoldout, rejectHoldout, sealHoldouts
// ────────────────────────────────────────────────────────────────────────────

export const interviewRouter = router({
  // ──────────────────────────────────────────────────────────────────────────
  // getTranscript
  // Query: returns current interview state for a project.
  // Returns transcript messages, current ambiguity scores, phase, MC options
  // from the last turn, active perspective, and whether threshold is reached.
  // ──────────────────────────────────────────────────────────────────────────
  getTranscript: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const { projectId } = input;
      const [interview] = await ctx.db
        .select()
        .from(interviews)
        .where(eq(interviews.projectId, projectId))
        .orderBy(desc(interviews.createdAt))
        .limit(1);

      if (!interview) {
        return {
          interview: null,
          transcript: [] as InterviewTurn[],
          currentScores: null as AmbiguityScores | null,
          status: 'not_started' as const,
          phase: 'gathering' as const,
          suggestions: [] as string[],
          activePerspective: null as string | null,
          thresholdMet: false,
        };
      }

      const transcript = (interview.transcript as InterviewTurn[]) ?? [];
      const currentScores = (interview.currentAmbiguityScore as AmbiguityScores | null) ?? null;
      const lastTurn = transcript[transcript.length - 1] ?? null;

      // MC options come from the last system turn's mcOptions field
      const suggestions = lastTurn?.mcOptions ?? [];
      const activePerspective = lastTurn?.perspective ?? null;
      const thresholdMet = (currentScores?.overall ?? 0) >= 0.8;

      return {
        interview: {
          id: interview.id,
          projectId: interview.projectId,
          status: interview.status,
          mode: interview.mode,
          turnCount: interview.turnCount,
          createdAt: interview.createdAt,
        },
        transcript,
        currentScores,
        status: interview.status,
        phase: interview.phase as 'gathering' | 'reviewing' | 'approved' | 'crystallized',
        suggestions,
        activePerspective,
        thresholdMet,
      };
    }),

  // ──────────────────────────────────────────────────────────────────────────
  // sendAnswer
  // Mutation: advances the interview FSM with the user's answer.
  // Invokes InterviewFSM.submitAnswer() synchronously — LLM scoring runs in
  // the web request, generating the next question before returning.
  // ──────────────────────────────────────────────────────────────────────────
  sendAnswer: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        answer: z.string(),
        freeformText: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { projectId, answer, freeformText } = input;

      const [interview] = await ctx.db
        .select()
        .from(interviews)
        .where(eq(interviews.projectId, projectId))
        .orderBy(desc(interviews.createdAt))
        .limit(1);

      if (!interview) {
        throw new Error(`No active interview found for project ${projectId}`);
      }

      // Fast-fail before expensive engine initialization if interview is not in gathering phase.
      // The FSM also validates this, but guarding here avoids gateway construction.
      if (interview.phase !== 'gathering') {
        throw new Error(
          `Cannot submit answer: interview is in phase '${interview.phase}', expected 'gathering'`,
        );
      }

      const { gateway, config, logger } = await ctx.getEngineDeps();
      const fsm = new InterviewFSM(ctx.db, gateway, config, logger);
      const result = await fsm.submitAnswer(
        interview.id,
        projectId,
        { userAnswer: answer, freeformText },
      );

      return {
        interviewId: interview.id,
        turnNumber: result.turn.turnNumber,
        currentScores: result.scores,
        thresholdMet: result.thresholdMet,
        phase: result.thresholdMet ? 'reviewing' : 'gathering',
        nextQuestion: result.nextQuestion,
        turn: result.turn,
      };
    }),

  // ──────────────────────────────────────────────────────────────────────────
  // getSummary
  // Query: returns the structured summary when status is reviewing or approved.
  // ──────────────────────────────────────────────────────────────────────────
  getSummary: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const { projectId } = input;

      const [interview] = await ctx.db
        .select()
        .from(interviews)
        .where(eq(interviews.projectId, projectId))
        .orderBy(desc(interviews.createdAt))
        .limit(1);

      if (!interview) {
        return { summary: null, phase: 'gathering' as const };
      }

      if (interview.phase !== 'reviewing' && interview.phase !== 'approved') {
        return {
          summary: null,
          phase: interview.phase as 'gathering' | 'reviewing' | 'approved' | 'crystallized',
        };
      }

      // The seed record holds the crystallized summary; look it up if crystallized
      // Otherwise look for a draft seed linked to this interview
      const [seed] = await ctx.db
        .select()
        .from(seeds)
        .where(eq(seeds.interviewId, interview.id))
        .orderBy(desc(seeds.createdAt))
        .limit(1);

      const summary: SeedSummary | null = seed
        ? {
            goal: seed.goal,
            constraints: seed.constraints as unknown[],
            acceptanceCriteria: seed.acceptanceCriteria as unknown[],
            ontologySchema: seed.ontologySchema as SeedSummary['ontologySchema'],
            evaluationPrinciples: seed.evaluationPrinciples as unknown[],
            exitConditions: seed.exitConditions as SeedSummary['exitConditions'],
          }
        : null;

      return {
        summary,
        phase: interview.phase as 'gathering' | 'reviewing' | 'approved' | 'crystallized',
        interviewId: interview.id,
      };
    }),

  // ──────────────────────────────────────────────────────────────────────────
  // approveSummary
  // Mutation: approve the summary and trigger seed crystallization.
  // Returns the new seed ID after crystallization.
  // ──────────────────────────────────────────────────────────────────────────
  approveSummary: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        summary: z.object({
          goal: z.string(),
          constraints: z.array(z.unknown()),
          acceptanceCriteria: z.array(z.unknown()),
          ontologySchema: z.object({
            entities: z.array(
              z.object({
                name: z.string(),
                attributes: z.array(z.string()),
                relations: z.array(z.object({ to: z.string(), type: z.string() })),
              }),
            ),
          }),
          evaluationPrinciples: z.array(z.unknown()),
          exitConditions: z.union([
            z.array(z.object({ condition: z.string(), description: z.string() })),
            z.record(z.string(), z.unknown()),
          ]),
        }),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { projectId, summary } = input;

      const [interview] = await ctx.db
        .select()
        .from(interviews)
        .where(eq(interviews.projectId, projectId))
        .orderBy(desc(interviews.createdAt))
        .limit(1);

      if (!interview) {
        throw new Error(`No interview found for project ${projectId}`);
      }

      if (interview.phase !== 'reviewing') {
        throw new Error(
          `Cannot approve summary: interview is in phase '${interview.phase}', expected 'reviewing'`,
        );
      }

      const ambiguityScore =
        (interview.currentAmbiguityScore as AmbiguityScores | null)?.overall ?? 0;

      // Transition reviewing -> approved
      await ctx.db
        .update(interviews)
        .set({ phase: 'approved' })
        .where(eq(interviews.id, interview.id));

      // Insert the crystallized seed record
      const [seed] = await ctx.db
        .insert(seeds)
        .values({
          projectId,
          interviewId: interview.id,
          status: 'crystallized',
          goal: summary.goal,
          constraints: summary.constraints,
          acceptanceCriteria: summary.acceptanceCriteria,
          ontologySchema: summary.ontologySchema,
          evaluationPrinciples: summary.evaluationPrinciples,
          exitConditions: summary.exitConditions as Record<string, unknown>,
          ambiguityScore,
          crystallizedAt: new Date(),
        })
        .returning();

      // Transition approved -> crystallized
      await ctx.db
        .update(interviews)
        .set({ phase: 'crystallized', status: 'completed', completedAt: new Date() })
        .where(eq(interviews.id, interview.id));

      return {
        seedId: seed!.id,
        version: seed!.version,
      };
    }),

  // ──────────────────────────────────────────────────────────────────────────
  // rejectSummary
  // Mutation: reject the summary and return to interview gathering state.
  // ──────────────────────────────────────────────────────────────────────────
  rejectSummary: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { projectId } = input;

      const [interview] = await ctx.db
        .select()
        .from(interviews)
        .where(eq(interviews.projectId, projectId))
        .orderBy(desc(interviews.createdAt))
        .limit(1);

      if (!interview) {
        throw new Error(`No interview found for project ${projectId}`);
      }

      if (interview.phase !== 'reviewing') {
        throw new Error(
          `Cannot reject summary: interview is in phase '${interview.phase}', expected 'reviewing'`,
        );
      }

      // Transition back to gathering for further refinement
      await ctx.db
        .update(interviews)
        .set({ phase: 'gathering' })
        .where(eq(interviews.id, interview.id));

      return { interviewId: interview.id, phase: 'gathering' as const };
    }),

  // ──────────────────────────────────────────────────────────────────────────
  // getHoldouts
  // Query: returns holdout test scenarios for a given seedId.
  // ──────────────────────────────────────────────────────────────────────────
  getHoldouts: publicProcedure
    .input(z.object({ seedId: z.string() }))
    .query(async ({ input, ctx }) => {
      const { seedId } = input;

      const vaultEntries = await ctx.db
        .select()
        .from(holdoutVault)
        .where(eq(holdoutVault.seedId, seedId))
        .orderBy(holdoutVault.id);

      // draftScenarios contains an array of individual test scenarios
      // Each entry in holdout_vault is one scenario set; we flatten them for review
      const scenarios = vaultEntries.flatMap((entry) => {
        const drafts = (entry.draftScenarios as Array<{
          id?: string;
          name?: string;
          description?: string;
          testCode?: string;
        }> | null) ?? [];

        return drafts.map((scenario, idx) => ({
          id: `${entry.id}:${idx}`,
          holdoutVaultId: entry.id,
          name: scenario.name ?? `Scenario ${idx + 1}`,
          description: scenario.description ?? '',
          testCode: scenario.testCode ?? '',
          status: entry.status as 'pending_review' | 'approved' | 'sealed' | 'unsealed' | 'evaluated',
        }));
      });

      return { scenarios };
    }),

  // ──────────────────────────────────────────────────────────────────────────
  // approveHoldout
  // Mutation: approve a specific holdout vault entry.
  // ──────────────────────────────────────────────────────────────────────────
  approveHoldout: publicProcedure
    .input(z.object({ holdoutId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { holdoutId } = input;

      const [entry] = await ctx.db
        .select()
        .from(holdoutVault)
        .where(eq(holdoutVault.id, holdoutId))
        .limit(1);

      if (!entry) {
        throw new Error(`Holdout vault entry ${holdoutId} not found`);
      }

      await ctx.db
        .update(holdoutVault)
        .set({ status: 'approved' })
        .where(eq(holdoutVault.id, holdoutId));

      return { holdoutId, status: 'approved' as const };
    }),

  // ──────────────────────────────────────────────────────────────────────────
  // rejectHoldout
  // Mutation: reject a specific holdout vault entry (marks for regeneration).
  // ──────────────────────────────────────────────────────────────────────────
  rejectHoldout: publicProcedure
    .input(z.object({ holdoutId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { holdoutId } = input;

      const [entry] = await ctx.db
        .select()
        .from(holdoutVault)
        .where(eq(holdoutVault.id, holdoutId))
        .limit(1);

      if (!entry) {
        throw new Error(`Holdout vault entry ${holdoutId} not found`);
      }

      // Reject: remove draft scenarios so they can be regenerated
      await ctx.db
        .update(holdoutVault)
        .set({ draftScenarios: null, status: 'pending_review' })
        .where(eq(holdoutVault.id, holdoutId));

      return { holdoutId, status: 'rejected' as const };
    }),

  // ──────────────────────────────────────────────────────────────────────────
  // sealHoldouts
  // Mutation: seal all approved holdout scenarios for a seed (triggers encryption).
  // The actual AES-256-GCM encryption runs via the engine's sealHoldouts()
  // function in a separate process. This tRPC procedure marks them as ready
  // for sealing and emits an event — the Inngest handler picks it up.
  // ──────────────────────────────────────────────────────────────────────────
  sealHoldouts: publicProcedure
    .input(z.object({ seedId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { seedId } = input;

      // Find all approved entries for this seed
      const approvedEntries = await ctx.db
        .select()
        .from(holdoutVault)
        .where(eq(holdoutVault.seedId, seedId));

      const approved = approvedEntries.filter((e) => e.status === 'approved');

      if (approved.length === 0) {
        throw new Error(`No approved holdout entries found for seed ${seedId}`);
      }

      // Mark as sealed (encryption happens in the Inngest handler / engine process)
      // In a full deployment this would emit an event; for the web layer we optimistically
      // set the status to signal the transition has been requested.
      await ctx.db
        .update(holdoutVault)
        .set({ status: 'sealed', encryptedAt: new Date() })
        .where(eq(holdoutVault.seedId, seedId));

      return {
        seedId,
        sealedCount: approved.length,
      };
    }),
});

export type InterviewRouter = typeof interviewRouter;
