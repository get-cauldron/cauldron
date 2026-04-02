import { describe, it, expect } from 'vitest';
import { enforceDiversity, filterDiverseModels } from '../diversity.js';
import { DiversityViolationError } from '../errors.js';

describe('enforceDiversity', () => {
  it('throws DiversityViolationError when both models are anthropic', () => {
    expect(() => enforceDiversity('claude-sonnet-4-6', 'claude-opus-4-5')).toThrow(
      DiversityViolationError
    );
  });

  it('throws DiversityViolationError when both models are mistral', () => {
    expect(() => enforceDiversity('mistral-large-latest', 'mistral-small-latest')).toThrow(DiversityViolationError);
  });

  it('throws DiversityViolationError when both models are google', () => {
    expect(() => enforceDiversity('gemini-2.5-pro', 'gemini-2.5-flash')).toThrow(
      DiversityViolationError
    );
  });

  it('does not throw when holdout is mistral and implementer is anthropic', () => {
    expect(() => enforceDiversity('mistral-large-latest', 'claude-sonnet-4-6')).not.toThrow();
  });

  it('does not throw when holdout is google and implementer is anthropic', () => {
    expect(() => enforceDiversity('gemini-2.5-pro', 'claude-sonnet-4-6')).not.toThrow();
  });

  it('DiversityViolationError carries correct model and family info', () => {
    let caught: DiversityViolationError | null = null;
    try {
      enforceDiversity('claude-sonnet-4-6', 'claude-opus-4-5');
    } catch (err) {
      caught = err as DiversityViolationError;
    }
    expect(caught).toBeInstanceOf(DiversityViolationError);
    expect(caught?.holdoutModel).toBe('claude-sonnet-4-6');
    expect(caught?.implementerModel).toBe('claude-opus-4-5');
    expect(caught?.family).toBe('anthropic');
  });
});

describe('filterDiverseModels', () => {
  it('removes models from the excluded family', () => {
    const result = filterDiverseModels(
      ['claude-sonnet-4-6', 'mistral-large-latest', 'gemini-2.5-pro'],
      'anthropic'
    );
    expect(result).toEqual(['mistral-large-latest', 'gemini-2.5-pro']);
  });

  it('returns empty array when all models are from the same excluded family', () => {
    const result = filterDiverseModels(
      ['claude-sonnet-4-6', 'claude-opus-4-5'],
      'anthropic'
    );
    expect(result).toEqual([]);
  });

  it('returns all models when none match the excluded family', () => {
    const result = filterDiverseModels(
      ['mistral-large-latest', 'gemini-2.5-pro'],
      'anthropic'
    );
    expect(result).toEqual(['mistral-large-latest', 'gemini-2.5-pro']);
  });

  it('silently skips unknown model IDs', () => {
    const result = filterDiverseModels(
      ['claude-sonnet-4-6', 'unknown-model-xyz', 'mistral-large-latest'],
      'anthropic'
    );
    // unknown-model-xyz has no family, should be skipped
    expect(result).toEqual(['mistral-large-latest']);
  });
});
