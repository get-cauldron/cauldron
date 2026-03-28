import type { MockGatewayCall } from '../gateway.js';

/**
 * Default mock ambiguity scores (below threshold).
 * Override `overallClarity` to control whether threshold is met.
 */
export interface InterviewTurnOptions {
  /** Overall clarity score (0-1). Default 0.5. Set >= 0.8 to trigger phase transition. */
  overallClarity?: number;
  /** Custom per-dimension scores. Defaults to overallClarity for all dimensions. */
  goalClarity?: number;
  constraintClarity?: number;
  successCriteriaClarity?: number;
}

/**
 * Builds a 5-call gateway script for one interview turn:
 *   1. scoreTranscript → ambiguity scores
 *   2-4. runActivePerspectives → 3 perspective candidates (researcher, simplifier, breadth-keeper)
 *   5. rankCandidates → selected index + MC options
 *
 * This matches the real call sequence in InterviewFSM.submitAnswer().
 */
export function interviewTurnScript(options?: InterviewTurnOptions): MockGatewayCall[] {
  const overall = options?.overallClarity ?? 0.5;
  const goalClarity = options?.goalClarity ?? overall;
  const constraintClarity = options?.constraintClarity ?? overall;
  const successCriteriaClarity = options?.successCriteriaClarity ?? overall;

  return [
    // Call 1: scorer
    {
      stage: 'interview',
      returns: {
        goalClarity,
        constraintClarity,
        successCriteriaClarity,
        reasoning: 'Mock scoring result for wiring test',
      },
    },
    // Call 2: researcher perspective
    {
      stage: 'interview',
      returns: {
        question: 'What is the primary goal of this project?',
        rationale: 'Exploring the core objective from a research perspective.',
      },
    },
    // Call 3: simplifier perspective
    {
      stage: 'interview',
      returns: {
        question: 'What is the simplest version of this that would be useful?',
        rationale: 'Identifying the MVP scope.',
      },
    },
    // Call 4: breadth-keeper perspective
    {
      stage: 'interview',
      returns: {
        question: 'What edge cases or error scenarios should we consider?',
        rationale: 'Ensuring breadth of requirement coverage.',
      },
    },
    // Call 5: ranker
    {
      stage: 'interview',
      returns: {
        selectedIndex: 0,
        mcOptions: [
          'Option A: Keep it simple',
          'Option B: Add more detail',
          'Option C: Explore alternatives',
        ],
        selectionRationale: 'This question best reduces ambiguity at this stage.',
      },
    },
  ];
}
