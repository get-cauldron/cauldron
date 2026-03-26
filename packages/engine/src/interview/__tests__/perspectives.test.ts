import { describe, it, expect } from 'vitest';
import {
  PERSPECTIVE_PROMPTS,
  perspectiveCandidateSchema,
  selectActivePerspectives,
} from '../perspectives.js';
import type { AmbiguityScores, PerspectiveName } from '../types.js';

// ─── PERSPECTIVE_PROMPTS ──────────────────────────────────────────────────────

describe('PERSPECTIVE_PROMPTS', () => {
  it('has exactly 5 keys matching PerspectiveName values', () => {
    const expectedKeys: PerspectiveName[] = [
      'researcher',
      'simplifier',
      'architect',
      'breadth-keeper',
      'seed-closer',
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
  it('returns researcher, simplifier, breadth-keeper when no previous scores (first turn)', () => {
    const result = selectActivePerspectives(null, 0);
    expect(result).toEqual(['researcher', 'simplifier', 'breadth-keeper']);
  });

  it('returns researcher, simplifier, breadth-keeper when turnCount is 0 regardless of scores', () => {
    const scores = makeScores(0.8);
    const result = selectActivePerspectives(scores, 0);
    expect(result).toEqual(['researcher', 'simplifier', 'breadth-keeper']);
  });

  it('returns early perspectives when overall < 0.4', () => {
    const scores = makeScores(0.3);
    const result = selectActivePerspectives(scores, 2);
    expect(result).toEqual(['researcher', 'simplifier', 'breadth-keeper']);
  });

  it('includes architect and breadth-keeper in mid-range (0.4 <= overall < 0.7)', () => {
    const scores = makeScores(0.5);
    const result = selectActivePerspectives(scores, 5);
    expect(result).toContain('architect');
    expect(result).toContain('breadth-keeper');
    expect(result).toHaveLength(3);
  });

  it('returns seed-closer and architect when overall >= 0.7', () => {
    const scores = makeScores(0.8);
    const result = selectActivePerspectives(scores, 10);
    expect(result).toEqual(['seed-closer', 'architect']);
  });

  it('includes researcher in mid-range when goalClarity is weakest dimension', () => {
    const scores = makeScores(0.5, 0.3, 0.6, 0.7); // goalClarity is lowest
    const result = selectActivePerspectives(scores, 5);
    expect(result).toContain('researcher');
    expect(result).not.toContain('simplifier');
  });

  it('includes simplifier in mid-range when goal is NOT weakest dimension', () => {
    const scores = makeScores(0.5, 0.7, 0.3, 0.6); // constraintClarity is lowest
    const result = selectActivePerspectives(scores, 5);
    expect(result).toContain('simplifier');
    expect(result).not.toContain('researcher');
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

  it('mid-turn: low constraintClarity targets breadth-keeper', () => {
    const scores = makeScores(0.5, 0.8, 0.2, 0.7); // constraintClarity=0.2 is lowest and < 0.5
    const result = selectActivePerspectives(scores, 5);
    expect(result).toContain('breadth-keeper');
  });

  it('mid-turn: low successCriteriaClarity targets seed-closer', () => {
    const scores = makeScores(0.5, 0.7, 0.8, 0.15); // successCriteriaClarity=0.15 is lowest and < 0.5
    const result = selectActivePerspectives(scores, 5);
    expect(result).toContain('seed-closer');
  });

  it('mid-turn: all dimensions above 0.5 defaults to architect+breadth-keeper+simplifier', () => {
    const scores = makeScores(0.55, 0.6, 0.55, 0.5); // no dimension < 0.5
    const result = selectActivePerspectives(scores, 5);
    expect(result).toEqual(['architect', 'breadth-keeper', 'simplifier']);
  });

  it('late-turn: low constraintClarity adds breadth-keeper as third perspective', () => {
    const scores = makeScores(0.75, 0.9, 0.3, 0.8); // constraintClarity=0.3 < 0.5
    const result = selectActivePerspectives(scores, 10);
    expect(result).toContain('breadth-keeper');
    expect(result).toContain('seed-closer');
    expect(result).toContain('architect');
  });

  it('early-turn unchanged: overall=0.2 still returns researcher+simplifier+breadth-keeper', () => {
    const scores = makeScores(0.2, 0.2, 0.1, 0.3);
    const result = selectActivePerspectives(scores, 3);
    expect(result).toEqual(['researcher', 'simplifier', 'breadth-keeper']);
  });
});
