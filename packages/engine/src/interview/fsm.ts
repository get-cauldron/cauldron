import { execSync } from 'node:child_process';
import { eq, desc } from 'drizzle-orm';
import type { Logger } from 'pino';
import { interviews, seeds } from '@get-cauldron/shared';
import { appendEvent } from '@get-cauldron/shared';
import type { DbClient } from '@get-cauldron/shared';
import type { Interview } from '@get-cauldron/shared';
import type { LLMGateway } from '../gateway/gateway.js';
import type { GatewayConfig } from '../gateway/config.js';
import { scoreTranscript } from './scorer.js';
import { runActivePerspectives } from './perspectives.js';
import { runContrarianAnalysis } from './contrarian.js';
import { rankCandidates } from './ranker.js';
import { synthesizeFromTranscript } from './synthesizer.js';
import { crystallizeSeed, ImmutableSeedError } from './crystallizer.js';
import { formatScoreBreakdown } from './format.js';
import type {
  InterviewPhase,
  InterviewMode,
  InterviewTurn,
  AmbiguityScores,
  SeedSummary,
  TurnResult,
  EarlyCrystallizationWarning,
} from './types.js';

// D-02: Valid FSM phase transitions
export const VALID_TRANSITIONS: Record<InterviewPhase, InterviewPhase[]> = {
  gathering: ['reviewing', 'gathering'], // gathering loops on each turn, transitions to reviewing when threshold met
  reviewing: ['approved'],
  approved: ['crystallized'],
  crystallized: [], // terminal
};

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  active: ['paused', 'completed', 'abandoned'],
  paused: ['active', 'abandoned'],
  completed: [],
  abandoned: [],
};

/**
 * Assert that a phase transition is valid. Exported for testability.
 */
export function assertValidTransition(from: InterviewPhase, to: InterviewPhase): void {
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Invalid FSM transition: ${from} -> ${to}`);
  }
}

/**
 * D-04: Detect interview mode from project context.
 * Checks for git history as a signal of existing codebase.
 * Returns 'brownfield' if git commits exist, 'greenfield' otherwise.
 * User can override via explicit mode parameter.
 */
export function detectInterviewMode(projectPath?: string): InterviewMode {
  try {
    const cwd = projectPath ?? process.cwd();
    // Check for git history — presence of commits indicates existing codebase
    const result = execSync('git rev-list --count HEAD 2>/dev/null', {
      cwd,
      encoding: 'utf-8',
      timeout: 5000,
    });
    const commitCount = parseInt(result.trim(), 10);
    return commitCount > 0 ? 'brownfield' : 'greenfield';
  } catch {
    // No git repo or no commits — greenfield
    return 'greenfield';
  }
}

// D-05, D-06: Threshold for auto-transition to reviewing
const CLARITY_THRESHOLD = 0.8; // weighted clarity >= 80%

/**
 * InterviewFSM orchestrates the full interview lifecycle:
 * start/resume → submit answers (parallel score + perspectives) → review → approve → crystallize
 *
 * Satisfies: D-02 (FSM transitions), D-03 (resume), D-04 (brownfield detection),
 * D-05 (threshold termination), D-06 (early crystallization), D-07 (turn structure),
 * D-21 (parallel scoring + perspectives), D-22/D-23 (synthesis + approval)
 */
export class InterviewFSM {
  constructor(
    private readonly db: DbClient,
    private readonly gateway: LLMGateway,
    private readonly config: GatewayConfig,
    private readonly logger: Logger,
  ) {}

  /**
   * Start a new interview or resume an existing active/paused one.
   * D-03: Resumes paused interviews by setting status back to active.
   * D-04: Auto-detects brownfield/greenfield from git history if mode not provided.
   */
  async startOrResume(
    projectId: string,
    options?: { mode?: InterviewMode; projectPath?: string },
  ): Promise<Interview> {
    // Check for existing active/paused interview
    const [existing] = await this.db
      .select()
      .from(interviews)
      .where(eq(interviews.projectId, projectId))
      .orderBy(desc(interviews.createdAt))
      .limit(1);

    if (existing && (existing.status === 'active' || existing.status === 'paused')) {
      if (existing.status === 'paused') {
        await this.db
          .update(interviews)
          .set({ status: 'active' })
          .where(eq(interviews.id, existing.id));
      }
      return { ...existing, status: 'active' };
    }

    // D-04: Auto-detect mode from git history only when a projectPath is
    // explicitly provided. Without it, detectInterviewMode falls back to
    // process.cwd() which is the server directory — not the user's project.
    const mode = options?.mode
      ?? (options?.projectPath ? detectInterviewMode(options.projectPath) : 'greenfield');

    const [interview] = await this.db
      .insert(interviews)
      .values({
        projectId,
        mode,
        status: 'active',
        phase: 'gathering',
      })
      .returning();

    await appendEvent(this.db, {
      projectId,
      type: 'interview_started',
      payload: { interviewId: interview!.id, mode },
    });

    this.logger.info({ projectId, interviewId: interview!.id, mode }, 'Interview started');

    return interview!;
  }

  /**
   * Submit the user's answer to the current question.
   * D-07: Records turn structure. D-21: Scores + perspectives run in parallel.
   * D-05: Auto-transitions to reviewing when clarity >= 0.8.
   */
  async submitAnswer(
    interviewId: string,
    projectId: string,
    answer: { userAnswer: string; freeformText?: string },
  ): Promise<TurnResult> {
    const [interview] = await this.db
      .select()
      .from(interviews)
      .where(eq(interviews.id, interviewId));

    if (!interview) {
      throw new Error(`Interview ${interviewId} not found`);
    }

    if (interview.phase !== 'gathering') {
      throw new Error(`Cannot submit answer: interview is in phase '${interview.phase}', expected 'gathering'`);
    }

    const currentTranscript = (interview.transcript as InterviewTurn[]) ?? [];
    const previousScores = (interview.currentAmbiguityScore as AmbiguityScores | null) ?? null;
    const mode = interview.mode as InterviewMode;
    const turnCount = interview.turnCount;

    // Build a transcript that includes the current answer so scoring and perspectives see it.
    // The full turn record (with perspective, model, etc.) is built after scoring completes,
    // but a partial turn with the user's answer is needed for context-aware question generation.
    const transcriptWithCurrentAnswer: InterviewTurn[] = [
      ...currentTranscript,
      {
        turnNumber: turnCount + 1,
        perspective: 'user' as InterviewTurn['perspective'],
        question: currentTranscript.length > 0
          ? currentTranscript[currentTranscript.length - 1]!.question
          : '(opening turn)',
        mcOptions: [],
        userAnswer: answer.userAnswer,
        freeformText: answer.freeformText,
        ambiguityScoreSnapshot: previousScores ?? { goalClarity: 0, constraintClarity: 0, successCriteriaClarity: 0, overall: 0, reasoning: 'Interview not started' },
        model: 'user-input',
        allCandidates: [],
        timestamp: new Date().toISOString(),
      },
    ];

    // D-21: Run scoring + perspectives in parallel — using transcript that includes current answer
    const [scores, candidates] = await Promise.all([
      scoreTranscript(this.gateway, transcriptWithCurrentAnswer, mode, projectId, previousScores, this.config),
      runActivePerspectives(this.gateway, transcriptWithCurrentAnswer, previousScores, projectId, turnCount, this.config),
    ]);

    // Rank candidates to get the next question
    const rankedQuestion = await rankCandidates(this.gateway, candidates, currentTranscript, projectId);

    // D-07: Build the turn record
    const turn: InterviewTurn = {
      turnNumber: turnCount + 1,
      perspective: rankedQuestion.selectedCandidate.perspective,
      question: rankedQuestion.selectedCandidate.question,
      mcOptions: rankedQuestion.mcOptions,
      userAnswer: answer.userAnswer,
      freeformText: answer.freeformText,
      ambiguityScoreSnapshot: scores,
      model: rankedQuestion.selectedCandidate.model,
      allCandidates: candidates,
      timestamp: new Date().toISOString(),
    };

    const updatedTranscript = [...currentTranscript, turn];
    const updatedScoresHistory = [
      ...((interview.ambiguityScoresHistory as AmbiguityScores[]) ?? []),
      scores,
    ];

    // D-05: Check if threshold met (clarity >= 0.8 === ambiguity <= 0.2)
    const thresholdMet = scores.overall >= CLARITY_THRESHOLD;
    let newPhase: InterviewPhase = 'gathering';

    if (thresholdMet) {
      assertValidTransition('gathering', 'reviewing');
      newPhase = 'reviewing';
      this.logger.info({ interviewId, score: scores.overall }, 'Ambiguity threshold met, transitioning to reviewing');
    }

    // Update interview with new turn data
    await this.db
      .update(interviews)
      .set({
        transcript: updatedTranscript,
        ambiguityScoresHistory: updatedScoresHistory,
        currentAmbiguityScore: scores,
        turnCount: turnCount + 1,
        phase: newPhase,
      })
      .where(eq(interviews.id, interviewId));

    return {
      turn,
      scores,
      nextQuestion: thresholdMet ? null : rankedQuestion,
      thresholdMet,
    };
  }

  /**
   * D-06: Allow early crystallization with a warning showing score, gap, and weakest dimensions.
   * Transitions to reviewing even if threshold is not met.
   */
  async requestEarlyCrystallization(
    interviewId: string,
  ): Promise<EarlyCrystallizationWarning> {
    const [interview] = await this.db
      .select()
      .from(interviews)
      .where(eq(interviews.id, interviewId));

    if (!interview) {
      throw new Error(`Interview ${interviewId} not found`);
    }

    if (interview.phase !== 'gathering') {
      throw new Error(`Cannot request early crystallization: interview is in phase '${interview.phase}'`);
    }

    const currentScore = (interview.currentAmbiguityScore as AmbiguityScores | null)?.overall ?? 0;
    const mode = interview.mode as InterviewMode;
    const scores = interview.currentAmbiguityScore as AmbiguityScores | null;

    const gap = CLARITY_THRESHOLD - currentScore;

    // Get dimension breakdown for weakest dimensions
    const breakdown = scores
      ? formatScoreBreakdown(scores, mode)
      : {
          dimensions: [
            { dimension: 'goalClarity', label: 'Goal', score: 0 },
            { dimension: 'constraintClarity', label: 'Constraints', score: 0 },
            { dimension: 'successCriteriaClarity', label: 'Success criteria', score: 0 },
          ],
          weakestDimension: { dimension: 'goalClarity', score: 0 },
          formatted: '',
        };

    // Sort dimensions to find weakest (bottom 2)
    const sortedDimensions = [...breakdown.dimensions].sort((a, b) => a.score - b.score);
    const weakestDimensions = sortedDimensions.slice(0, 2).map((d) => ({
      dimension: d.dimension,
      score: d.score,
    }));

    // Transition to reviewing
    assertValidTransition('gathering', 'reviewing');
    await this.db
      .update(interviews)
      .set({ phase: 'reviewing' })
      .where(eq(interviews.id, interviewId));

    const warning: EarlyCrystallizationWarning = {
      currentScore,
      threshold: CLARITY_THRESHOLD,
      gap,
      weakestDimensions,
      message: `Warning: Interview score ${(currentScore * 100).toFixed(0)}% is below the ${(CLARITY_THRESHOLD * 100).toFixed(0)}% threshold (gap: ${(gap * 100).toFixed(0)}%). Weakest areas: ${weakestDimensions.map((d) => d.dimension).join(', ')}.`,
    };

    this.logger.warn({ interviewId, currentScore, gap }, 'Early crystallization requested');

    return warning;
  }

  /**
   * D-22, INTV-06: Generate a seed summary from the full interview transcript.
   * Returns the SeedSummary for human review before approval.
   */
  async generateSummary(
    interviewId: string,
    projectId: string,
  ): Promise<SeedSummary> {
    const [interview] = await this.db
      .select()
      .from(interviews)
      .where(eq(interviews.id, interviewId));

    if (!interview) {
      throw new Error(`Interview ${interviewId} not found`);
    }

    if (interview.phase !== 'reviewing') {
      throw new Error(`Cannot generate summary: interview is in phase '${interview.phase}', expected 'reviewing'`);
    }

    const transcript = (interview.transcript as InterviewTurn[]) ?? [];
    const summary = await synthesizeFromTranscript(this.gateway, transcript, projectId);

    this.logger.info({ interviewId, projectId }, 'Seed summary generated');

    return summary;
  }

  /**
   * D-23, INTV-07, SEED-01, SEED-02: Approve summary and crystallize the seed.
   * Requires interview to be in 'reviewing' phase.
   * Transitions: reviewing -> approved -> crystallized.
   */
  async approveAndCrystallize(
    interviewId: string,
    projectId: string,
    summary: SeedSummary,
    parentSeedId?: string,
  ): Promise<typeof seeds.$inferSelect> {
    const [interview] = await this.db
      .select()
      .from(interviews)
      .where(eq(interviews.id, interviewId));

    if (!interview) {
      throw new Error(`Interview ${interviewId} not found`);
    }

    if (interview.phase !== 'reviewing') {
      throw new Error(`Cannot crystallize: interview is in phase '${interview.phase}', expected 'reviewing'`);
    }

    // Transition reviewing -> approved
    assertValidTransition('reviewing', 'approved');
    await this.db
      .update(interviews)
      .set({ phase: 'approved' })
      .where(eq(interviews.id, interviewId));

    const ambiguityScore = (interview.currentAmbiguityScore as AmbiguityScores | null)?.overall ?? 0;

    // Crystallize seed (also transitions interview to crystallized)
    // crystallizeSeed handles the approved -> crystallized transition internally
    const seed = await crystallizeSeed(
      this.db,
      interviewId,
      projectId,
      summary,
      ambiguityScore,
      parentSeedId,
    );

    this.logger.info({ interviewId, seedId: seed.id, version: seed.version }, 'Seed crystallized');

    return seed;
  }

  /**
   * D-03: Pause an active interview for later resumption.
   */
  async pause(interviewId: string): Promise<void> {
    const [interview] = await this.db
      .select()
      .from(interviews)
      .where(eq(interviews.id, interviewId));

    if (!interview) {
      throw new Error(`Interview ${interviewId} not found`);
    }

    if (interview.status !== 'active') {
      throw new Error(`Cannot pause interview in status '${interview.status}': must be 'active'`);
    }

    if (!VALID_STATUS_TRANSITIONS['active']?.includes('paused')) {
      throw new Error(`Invalid status transition: active -> paused`);
    }

    await this.db
      .update(interviews)
      .set({ status: 'paused' })
      .where(eq(interviews.id, interviewId));

    this.logger.info({ interviewId }, 'Interview paused');
  }

  /**
   * Abandon an interview (no further actions possible).
   */
  async abandon(interviewId: string): Promise<void> {
    const [interview] = await this.db
      .select()
      .from(interviews)
      .where(eq(interviews.id, interviewId));

    if (!interview) {
      throw new Error(`Interview ${interviewId} not found`);
    }

    const validFromStatuses = ['active', 'paused'] as const;
    if (!validFromStatuses.includes(interview.status as 'active' | 'paused')) {
      throw new Error(`Cannot abandon interview in status '${interview.status}'`);
    }

    await this.db
      .update(interviews)
      .set({ status: 'abandoned' })
      .where(eq(interviews.id, interviewId));

    this.logger.info({ interviewId }, 'Interview abandoned');
  }
}
