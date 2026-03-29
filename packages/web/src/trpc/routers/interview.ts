import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { router, publicProcedure } from '../init';
import { interviews, seeds, holdoutVault } from '@get-cauldron/shared';
import { InterviewFSM, approveScenarios, sealVault, crystallizeSeed, ImmutableSeedError, generateHoldoutScenarios, createVault, synthesizeFromTranscript } from '@get-cauldron/engine';
import { TRPCError } from '@trpc/server';
import type {
  InterviewTurn,
  AmbiguityScores,
  SeedSummary,
} from '@get-cauldron/engine';

// ────────────────────────────────────────────────────────────────────────────
// Interview tRPC router
// Provides 10 procedures covering the full interview lifecycle:
//   startInterview, getTranscript, sendAnswer, getSummary, approveSummary,
//   rejectSummary, getHoldouts, approveHoldout, rejectHoldout, sealHoldouts
// ────────────────────────────────────────────────────────────────────────────

export const interviewRouter = router({
  // ──────────────────────────────────────────────────────────────────────────
  // startInterview
  // Mutation: creates or resumes an interview for the given project.
  // Calls InterviewFSM.startOrResume() to create the DB row and return
  // interview metadata. Must be called before sendAnswer.
  // ──────────────────────────────────────────────────────────────────────────
  startInterview: publicProcedure
    .input(z.object({
      projectId: z.string(),
      mode: z.enum(['greenfield', 'brownfield']).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { projectId, mode } = input;
      const { gateway, config, logger } = await ctx.getEngineDeps();
      const fsm = new InterviewFSM(ctx.db, gateway, config, logger);
      const interview = await fsm.startOrResume(projectId, { mode });
      return {
        interviewId: interview.id,
        mode: interview.mode,
        status: interview.status,
        phase: interview.phase,
      };
    }),

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
        return { summary: null, phase: 'gathering' as const, seedId: null };
      }

      if (interview.phase !== 'reviewing' && interview.phase !== 'approved') {
        // For crystallized phase, still look up the seed to return seedId
        if (interview.phase === 'crystallized') {
          const [existingSeed] = await ctx.db
            .select({ id: seeds.id })
            .from(seeds)
            .where(eq(seeds.interviewId, interview.id))
            .orderBy(desc(seeds.createdAt))
            .limit(1);
          return {
            summary: null,
            phase: interview.phase as 'gathering' | 'reviewing' | 'approved' | 'crystallized',
            seedId: existingSeed?.id ?? null,
          };
        }
        return {
          summary: null,
          phase: interview.phase as 'gathering' | 'reviewing' | 'approved' | 'crystallized',
          seedId: null,
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

      let summary: SeedSummary | null = seed
        ? {
            goal: seed.goal,
            constraints: seed.constraints as unknown[],
            acceptanceCriteria: seed.acceptanceCriteria as unknown[],
            ontologySchema: seed.ontologySchema as SeedSummary['ontologySchema'],
            evaluationPrinciples: seed.evaluationPrinciples as unknown[],
            exitConditions: seed.exitConditions as SeedSummary['exitConditions'],
          }
        : null;

      // Auto-generate summary when in reviewing phase with no seed yet
      if (!summary && interview.phase === 'reviewing') {
        const transcript = (interview.transcript as InterviewTurn[]) ?? [];
        if (transcript.length > 0) {
          try {
            const { gateway } = await ctx.getEngineDeps();
            summary = await synthesizeFromTranscript(gateway, transcript, projectId);
          } catch (err) {
            console.error('[getSummary] Failed to auto-generate seed summary:', err);
          }
        }
      }

      return {
        summary,
        phase: interview.phase as 'gathering' | 'reviewing' | 'approved' | 'crystallized',
        interviewId: interview.id,
        seedId: seed?.id ?? null,
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

      try {
        const seed = await crystallizeSeed(
          ctx.db,
          interview.id,
          projectId,
          summary,
          ambiguityScore,
        );

        // Generate holdout scenarios and create vault entry.
        // Gateway diversity enforcement (LLM-06) is active for stage: 'holdout'.
        // This is a separate try/catch: if holdout generation fails (LLM error,
        // budget exceeded), the seed is already crystallized and should remain.
        // The mutation still returns seedId. The user can retry holdout generation.
        try {
          const { gateway } = await ctx.getEngineDeps();
          const scenarios = await generateHoldoutScenarios({
            gateway,
            seed,
            projectId,
          });
          await createVault(ctx.db, { seedId: seed.id, scenarios });
        } catch (holdoutErr) {
          console.error('[approveSummary] Holdout generation failed:', holdoutErr);
        }

        return { seedId: seed.id, version: seed.version };
      } catch (e) {
        if (e instanceof ImmutableSeedError) {
          throw new TRPCError({ code: 'CONFLICT', message: e.message });
        }
        throw e;
      }
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

      // Guard: only pending_review → approved is valid per vault FSM
      if (entry.status !== 'pending_review') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot approve holdout: status is '${entry.status}', expected 'pending_review'`,
        });
      }

      // Use engine's approveScenarios to properly mark scenarios as _approved
      // and transition vault status through the FSM (raw UPDATE would skip this)
      await approveScenarios(ctx.db, { vaultId: holdoutId, approvedIds: 'all' });

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

      // Guard: only pending_review can be rejected
      if (entry.status !== 'pending_review') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot reject holdout: status is '${entry.status}', expected 'pending_review'`,
        });
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

      // Look up seed to get projectId (needed by sealVault)
      const [seedRow] = await ctx.db
        .select()
        .from(seeds)
        .where(eq(seeds.id, seedId))
        .limit(1);
      if (!seedRow) throw new Error(`Seed ${seedId} not found`);

      // Find all approved vault entries for this seed
      const approvedEntries = await ctx.db
        .select()
        .from(holdoutVault)
        .where(eq(holdoutVault.seedId, seedId));

      const approved = approvedEntries.filter((e) => e.status === 'approved');

      if (approved.length === 0) {
        throw new Error(`No approved holdout entries found for seed ${seedId}`);
      }

      // For each approved entry: seal (encrypt). Skip approveScenarios() since
      // entries are already in 'approved' status from the approveHoldout step.
      for (const entry of approved) {
        await sealVault(ctx.db, { vaultId: entry.id, projectId: seedRow.projectId });
      }

      return {
        seedId,
        sealedCount: approved.length,
      };
    }),
});

export type InterviewRouter = typeof interviewRouter;
