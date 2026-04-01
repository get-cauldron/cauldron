/**
 * Smart defaults for image generation based on intendedUse.
 * Maps semantic use cases to concrete width/height/steps values per D-16.
 */

import type { IntendedUse } from './types.js';

export interface ImageDefaults {
  width: number;
  height: number;
  steps: number;
}

/**
 * Returns sensible image generation defaults for a given intendedUse.
 * When intendedUse is undefined or 'other', returns safe general defaults.
 */
export function getDefaultsForUse(intendedUse: IntendedUse | undefined): ImageDefaults {
  switch (intendedUse) {
    case 'icon':
      return { width: 512, height: 512, steps: 30 };
    case 'avatar':
      return { width: 512, height: 512, steps: 25 };
    case 'texture':
      return { width: 1024, height: 1024, steps: 25 };
    case 'hero-image':
      return { width: 1024, height: 768, steps: 20 };
    case 'background':
      return { width: 1920, height: 1080, steps: 20 };
    case 'other':
    case undefined:
    default:
      return { width: 1024, height: 1024, steps: 20 };
  }
}

/**
 * Composes the final prompt by prepending styleGuidance when provided.
 * Per D-15: style guidance is prepended as a stylistic prefix to the generation prompt.
 */
export function composePrompt(prompt: string, styleGuidance?: string): string {
  if (styleGuidance) {
    return `${styleGuidance}. ${prompt}`;
  }
  return prompt;
}
