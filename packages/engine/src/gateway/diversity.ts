import { getProviderFamily } from './providers.js';
import { DiversityViolationError } from './errors.js';
import type { ProviderFamily } from './types.js';

/**
 * Enforce cross-model diversity for holdout stage.
 * Throws DiversityViolationError if holdout and implementer share the same provider family.
 */
export function enforceDiversity(holdoutModelId: string, implementerModelId: string): void {
  const holdoutFamily = getProviderFamily(holdoutModelId);
  const implementerFamily = getProviderFamily(implementerModelId);
  if (holdoutFamily === implementerFamily) {
    throw new DiversityViolationError(holdoutModelId, implementerModelId, holdoutFamily);
  }
}

/**
 * Filter a model chain to only include models from a different family than excludeFamily.
 * Used during holdout-stage failover to skip same-family providers.
 */
export function filterDiverseModels(modelChain: string[], excludeFamily: ProviderFamily): string[] {
  return modelChain.filter((modelId) => {
    try {
      return getProviderFamily(modelId) !== excludeFamily;
    } catch {
      // Unknown model — skip it rather than crash
      return false;
    }
  });
}
