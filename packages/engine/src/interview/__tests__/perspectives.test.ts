import { describe, it, expect } from 'vitest';
import {
  PERSPECTIVE_PROMPTS,
  perspectiveCandidateSchema,
  selectActivePerspectives,
  buildPerspectivePrompt,
} from '../perspectives.js';
import type { AmbiguityScores, PerspectiveName, InterviewTurn, ContrarianFraming } from '../types.js';

// ─── PERSPECTIVE_PROMPTS ──────────────────────────────────────────────────────

describe('PERSPECTIVE_PROMPTS', () => {
  it('has exactly 5 keys matching PerspectiveName values', () => {
    const expectedKeys: PerspectiveName[] = [
      'henry-wu',
      'occam',
      'heist-o-tron',
      'hickam',
      'kirk',
    ];
    const actualKeys = Object.keys(PERSPECTIVE_PROMPTS);
    expect(actualKeys).toHaveLength(5);
    for (const key of expectedKeys) {
      expect(PERSPECTIVE_PROMPTS).toHaveProperty(key);
      expect(typeof PERSPECTIVE_PROMPTS[key]).toBe('string');
      expect(PERSPECTIVE_PROMPTS[key].length).toBeGreaterThan(0);
    }
  });
});

// ─── perspectiveCandidateSchema ───────────────────────────────────────────────

describe('perspectiveCandidateSchema', () => {
  it('validates a valid candidate object', () => {
    const result = perspectiveCandidateSchema.safeParse({
      question: 'What is the primary user persona?',
      rationale: 'Understanding who the users are drives UX decisions.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing question', () => {
    const result = perspectiveCandidateSchema.safeParse({
      rationale: 'Some rationale',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing rationale', () => {
    const result = perspectiveCandidateSchema.safeParse({
      question: 'Some question',
    });
    expect(result.success).toBe(false);
  });
});

// ─── selectActivePerspectives ─────────────────────────────────────────────────

function makeScores(overall: number, goalClarity = overall, constraintClarity = overall, successCriteriaClarity = overall): AmbiguityScores {
  return {
    goalClarity,
    constraintClarity,
    successCriteriaClarity,
    overall,
    reasoning: 'test scores',
  };
}

describe('selectActivePerspectives', () => {
  it('returns henry-wu, occam, hickam when no previous scores (first turn)', () => {
    const result = selectActivePerspectives(null, 0);
    expect(result).toEqual(['henry-wu', 'occam', 'hickam']);
  });

  it('returns henry-wu, occam, hickam when turnCount is 0 regardless of scores', () => {
    const scores = makeScores(0.8);
    const result = selectActivePerspectives(scores, 0);
    expect(result).toEqual(['henry-wu', 'occam', 'hickam']);
  });

  it('returns early perspectives when overall < 0.4', () => {
    const scores = makeScores(0.3);
    const result = selectActivePerspectives(scores, 2);
    expect(result).toEqual(['henry-wu', 'occam', 'hickam']);
  });

  it('includes heist-o-tron and hickam in mid-range (0.4 <= overall < 0.7)', () => {
    const scores = makeScores(0.5);
    const result = selectActivePerspectives(scores, 5);
    expect(result).toContain('heist-o-tron');
    expect(result).toContain('hickam');
    expect(result).toHaveLength(3);
  });

  it('returns kirk and heist-o-tron when overall >= 0.7', () => {
    const scores = makeScores(0.8);
    const result = selectActivePerspectives(scores, 10);
    expect(result).toEqual(['kirk', 'heist-o-tron']);
  });

  it('includes henry-wu in mid-range when goalClarity is weakest dimension', () => {
    const scores = makeScores(0.5, 0.3, 0.6, 0.7); // goalClarity is lowest
    const result = selectActivePerspectives(scores, 5);
    expect(result).toContain('henry-wu');
    expect(result).not.toContain('occam');
  });

  it('includes occam in mid-range when goal is NOT weakest dimension', () => {
    const scores = makeScores(0.5, 0.7, 0.3, 0.6); // constraintClarity is lowest
    const result = selectActivePerspectives(scores, 5);
    expect(result).toContain('occam');
    expect(result).not.toContain('henry-wu');
  });

  it('returns exactly 2 perspectives in late turns', () => {
    const scores = makeScores(0.75);
    const result = selectActivePerspectives(scores, 8);
    expect(result).toHaveLength(2);
  });

  it('returns exactly 3 perspectives in mid turns', () => {
    const scores = makeScores(0.5);
    const result = selectActivePerspectives(scores, 5);
    expect(result).toHaveLength(3);
  });

  // ─── Dimension-aware convergence pressure tests ────────────────────────────

  it('mid-turn: low constraintClarity targets hickam', () => {
    const scores = makeScores(0.5, 0.8, 0.2, 0.7); // constraintClarity=0.2 is lowest and < 0.5
    const result = selectActivePerspectives(scores, 5);
    expect(result).toContain('hickam');
  });

  it('mid-turn: low successCriteriaClarity targets kirk', () => {
    const scores = makeScores(0.5, 0.7, 0.8, 0.15); // successCriteriaClarity=0.15 is lowest and < 0.5
    const result = selectActivePerspectives(scores, 5);
    expect(result).toContain('kirk');
  });

  it('mid-turn: all dimensions above 0.5 defaults to heist-o-tron+hickam+occam', () => {
    const scores = makeScores(0.55, 0.6, 0.55, 0.5); // no dimension < 0.5
    const result = selectActivePerspectives(scores, 5);
    expect(result).toEqual(['heist-o-tron', 'hickam', 'occam']);
  });

  it('late-turn: low constraintClarity adds hickam as third perspective', () => {
    const scores = makeScores(0.75, 0.9, 0.3, 0.8); // constraintClarity=0.3 < 0.5
    const result = selectActivePerspectives(scores, 10);
    expect(result).toContain('hickam');
    expect(result).toContain('kirk');
    expect(result).toContain('heist-o-tron');
  });

  it('early-turn unchanged: overall=0.2 still returns henry-wu+occam+hickam', () => {
    const scores = makeScores(0.2, 0.2, 0.1, 0.3);
    const result = selectActivePerspectives(scores, 3);
    expect(result).toEqual(['henry-wu', 'occam', 'hickam']);
  });
});

// ─── buildPerspectivePrompt ───────────────────────────────────────────────────

function makeTurn(question: string, userAnswer: string, turnNumber = 1): InterviewTurn {
  return {
    turnNumber,
    perspective: 'henry-wu',
    question,
    mcOptions: [],
    userAnswer,
    ambiguityScoreSnapshot: makeScores(0.5),
    model: 'test-model',
    allCandidates: [],
    timestamp: new Date().toISOString(),
  };
}

describe('buildPerspectivePrompt', () => {
  it('without contrarianFramings produces the base prompt (backward compatible)', () => {
    const transcript = [makeTurn('What are you building?', 'A task manager')];
    const result = buildPerspectivePrompt(transcript);
    expect(result).toContain('Interview transcript so far:');
    expect(result).toContain('ask one helpful clarifying question');
    expect(result).not.toContain('Alternative framings to consider');
  });

  it('with undefined contrarianFramings produces the same output as without', () => {
    const transcript = [makeTurn('What are you building?', 'A task manager')];
    const withUndefined = buildPerspectivePrompt(transcript, undefined);
    const withoutParam = buildPerspectivePrompt(transcript);
    expect(withUndefined).toBe(withoutParam);
  });

  it('with empty contrarianFramings array produces the same output as without', () => {
    const transcript = [makeTurn('What are you building?', 'A task manager')];
    const withEmpty = buildPerspectivePrompt(transcript, []);
    const withoutParam = buildPerspectivePrompt(transcript);
    expect(withEmpty).toBe(withoutParam);
  });

  it('with contrarianFramings includes "Alternative framings to consider" section', () => {
    const transcript = [makeTurn('What are you building?', 'A real-time dashboard')];
    const framings: ContrarianFraming[] = [
      {
        hypothesis: 'Users want real-time updates',
        alternative: 'Users want accurate final results',
        reasoning: 'Real-time can add noise',
      },
    ];
    const result = buildPerspectivePrompt(transcript, framings);
    expect(result).toContain('Alternative framings to consider');
    expect(result).toContain('Users want real-time updates');
    expect(result).toContain('Users want accurate final results');
    expect(result).toContain('Real-time can add noise');
  });

  it('with contrarianFramings the contrarian section appears BEFORE the question instruction', () => {
    const transcript = [makeTurn('What are you building?', 'A real-time dashboard')];
    const framings: ContrarianFraming[] = [
      {
        hypothesis: 'H',
        alternative: 'A',
        reasoning: 'R',
      },
    ];
    const result = buildPerspectivePrompt(transcript, framings);
    const contrarianIdx = result.indexOf('Alternative framings to consider');
    const questionIdx = result.indexOf('ask one helpful clarifying question');
    expect(contrarianIdx).toBeGreaterThan(-1);
    expect(questionIdx).toBeGreaterThan(-1);
    expect(contrarianIdx).toBeLessThan(questionIdx);
  });

  it('with contrarianFramings on empty transcript still includes the section', () => {
    const framings: ContrarianFraming[] = [
      {
        hypothesis: 'H',
        alternative: 'A',
        reasoning: 'R',
      },
    ];
    const result = buildPerspectivePrompt([], framings);
    expect(result).toContain('Alternative framings to consider');
    expect(result).toContain('The user has just started');
  });

  it('instructs perspective not to mention framings directly to the user', () => {
    const transcript = [makeTurn('What are you building?', 'A task manager')];
    const framings: ContrarianFraming[] = [
      {
        hypothesis: 'H',
        alternative: 'A',
        reasoning: 'R',
      },
    ];
    const result = buildPerspectivePrompt(transcript, framings);
    expect(result).toContain('Do not mention these framings directly to the user');
  });
});
