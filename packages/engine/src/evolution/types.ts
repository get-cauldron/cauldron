export type EvolutionState =
  | 'idle'
  | 'evaluating'
  | 'scoring'
  | 'evolving'
  | 'decomposing'
  | 'executing'
  | 'merging'
  | 'lateral_thinking'
  | 'converged'
  | 'halted';

export type EvolutionTier = 'full' | 'ac_only';

export type ConvergenceSignalType =
  | 'ontology_stability'
  | 'stagnation'
  | 'oscillation'
  | 'repetitive_feedback'
  | 'hard_cap';

export type TerminalReason = 'goal_met' | 'hard_cap' | 'budget_exceeded' | 'escalated';

export interface RubricDimension {
  name: string;
  weight: number;
  description: string;
}

export interface DimensionScore {
  name: string;
  score: number;
  weight: number;
  reasoning: string;
  gapStatement: string;
}

export interface GoalAttainmentResult {
  overallScore: number;
  dimensions: DimensionScore[];
  gapAnalysis: GapAnalysis[];
  tier: EvolutionTier;
}

export interface GapAnalysis {
  dimension: string;
  score: number;
  description: string;
  gapId: string; // SHA-256 hash of dimension + description
}

export interface ConvergenceSignal {
  type: ConvergenceSignalType;
  fired: boolean;
  detail: string;
}

export interface EvolutionContext {
  score: number;
  tier: EvolutionTier;
  gapAnalysis: GapAnalysis[];
  convergenceSignal?: ConvergenceSignalType;
  terminalReason?: TerminalReason;
  parentSeedId: string;
}

export interface LateralThinkingProposal {
  persona: string;
  goal: string;
  constraints: unknown[];
  acceptanceCriteria: unknown[];
  rationale: string;
}

export const SUCCESS_THRESHOLD = 0.95; // D-02
export const FULL_REGEN_THRESHOLD = 0.4; // D-06
export const MAX_GENERATIONS = 30; // D-09/EVOL-09
export const ONTOLOGY_SIMILARITY_THRESHOLD = 0.95; // D-10
export const STAGNATION_WINDOW = 3; // D-09/EVOL-06
export const REPETITIVE_FEEDBACK_THRESHOLD = 0.70; // D-13
