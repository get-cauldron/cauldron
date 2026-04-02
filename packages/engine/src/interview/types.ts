export type PerspectiveName = 'researcher' | 'simplifier' | 'architect' | 'breadth-keeper' | 'seed-closer';

export type InterviewPhase = 'gathering' | 'reviewing' | 'approved' | 'crystallized';

export type InterviewMode = 'greenfield' | 'brownfield';

// Per D-07: turn-based transcript structure
export interface InterviewTurn {
  turnNumber: number;
  perspective: PerspectiveName;
  question: string;
  mcOptions: string[];
  userAnswer: string;
  freeformText?: string;
  ambiguityScoreSnapshot: AmbiguityScores;
  model: string; // D-08: model ID used for this turn's winning question
  allCandidates: PerspectiveCandidate[]; // D-14: all 5 candidate questions
  timestamp: string; // ISO 8601
}

// Per D-16: greenfield 3 dimensions, brownfield adds contextClarity
export interface AmbiguityScores {
  goalClarity: number;       // [0, 1]
  constraintClarity: number; // [0, 1]
  successCriteriaClarity: number; // [0, 1]
  contextClarity?: number;   // [0, 1] — only present in brownfield mode
  overall: number;           // weighted score
  reasoning: string;         // brief LLM rationale
}

export interface PerspectiveCandidate {
  perspective: PerspectiveName;
  question: string;
  rationale: string; // D-13: why this question matters
  model: string;     // D-08/D-10: which model generated this
}

// D-11: ranker output — selected question + MC options
export interface RankedQuestion {
  selectedCandidate: PerspectiveCandidate;
  mcOptions: string[];  // 3-4 options per D-11
  selectionRationale: string; // D-13: shown to user
}

// D-22: seed summary structure matching seeds table columns
export interface SeedSummary {
  goal: string;
  constraints: unknown[];
  acceptanceCriteria: unknown[];
  ontologySchema: OntologySchema; // D-24
  evaluationPrinciples: unknown[];
  exitConditions: Array<{ condition: string; description: string }> | Record<string, unknown>;
}

// D-24: domain entity map
export interface OntologySchema {
  entities: OntologyEntity[];
}

export interface OntologyEntity {
  name: string;
  attributes: string[];
  relations: Array<{ to: string; type: string }>;
}

// Result of a single turn cycle
export interface TurnResult {
  turn: InterviewTurn;
  scores: AmbiguityScores;
  nextQuestion: RankedQuestion | null; // null when threshold met → transition to reviewing
  thresholdMet: boolean;
}

// D-06: early crystallization warning
export interface EarlyCrystallizationWarning {
  currentScore: number;
  threshold: number;
  gap: number;
  weakestDimensions: Array<{ dimension: string; score: number }>;
  message: string;
}

// D-12: perspective activation config
export interface PerspectiveActivation {
  name: PerspectiveName;
  activeWhen: (scores: AmbiguityScores | null, turnCount: number) => boolean;
}

// Cousin Eddie: contrarian analysis framing
// NOTE: ContrarianFraming is NOT a PerspectiveName — it is a separate analytical layer
// that feeds INTO the primary interviewer as context, not a perspective in the panel.
export interface ContrarianFraming {
  hypothesis: string;    // The user statement reframed as a testable hypothesis
  alternative: string;   // An orthogonal alternative framing from a perpendicular dimension
  reasoning: string;     // Why this alternative is worth considering
}
