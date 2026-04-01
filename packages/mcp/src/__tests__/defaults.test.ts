import { describe, it, expect } from 'vitest';
import { getDefaultsForUse, composePrompt } from '../defaults.js';
import type { IntendedUse } from '../types.js';

describe('getDefaultsForUse', () => {
  it('returns 512x512, 30 steps for icon', () => {
    const defaults = getDefaultsForUse('icon');
    expect(defaults).toEqual({ width: 512, height: 512, steps: 30 });
  });

  it('returns 512x512, 25 steps for avatar', () => {
    const defaults = getDefaultsForUse('avatar');
    expect(defaults).toEqual({ width: 512, height: 512, steps: 25 });
  });

  it('returns 1024x1024, 25 steps for texture', () => {
    const defaults = getDefaultsForUse('texture');
    expect(defaults).toEqual({ width: 1024, height: 1024, steps: 25 });
  });

  it('returns 1024x768, 20 steps for hero-image', () => {
    const defaults = getDefaultsForUse('hero-image');
    expect(defaults).toEqual({ width: 1024, height: 768, steps: 20 });
  });

  it('returns 1920x1080, 20 steps for background', () => {
    const defaults = getDefaultsForUse('background');
    expect(defaults).toEqual({ width: 1920, height: 1080, steps: 20 });
  });

  it('returns 1024x1024, 20 steps for other', () => {
    const defaults = getDefaultsForUse('other');
    expect(defaults).toEqual({ width: 1024, height: 1024, steps: 20 });
  });

  it('returns 1024x1024, 20 steps for undefined', () => {
    const defaults = getDefaultsForUse(undefined);
    expect(defaults).toEqual({ width: 1024, height: 1024, steps: 20 });
  });

  it('covers all INTENDED_USES values', () => {
    const uses: Array<IntendedUse | undefined> = ['hero-image', 'icon', 'texture', 'avatar', 'background', 'other', undefined];
    for (const use of uses) {
      const d = getDefaultsForUse(use);
      expect(d.width).toBeGreaterThan(0);
      expect(d.height).toBeGreaterThan(0);
      expect(d.steps).toBeGreaterThan(0);
    }
  });
});

describe('composePrompt', () => {
  it('returns prompt unchanged when no styleGuidance', () => {
    expect(composePrompt('a cat')).toBe('a cat');
  });

  it('returns prompt unchanged when styleGuidance is empty string', () => {
    expect(composePrompt('a cat', '')).toBe('a cat');
  });

  it('prepends styleGuidance with separator when provided', () => {
    expect(composePrompt('a cat', 'photorealistic')).toBe('photorealistic. a cat');
  });

  it('handles multi-word styleGuidance', () => {
    expect(composePrompt('a hero banner', 'dark fantasy, oil painting')).toBe('dark fantasy, oil painting. a hero banner');
  });
});
