import { generateText, APICallError } from 'ai';
import { resolveModel, MODEL_FAMILY_MAP } from './providers.js';
import type { ProviderFamily } from './types.js';
import type { Logger } from 'pino';

export interface ValidationResult {
  provider: ProviderFamily;
  valid: boolean;
  error?: string;
}

/**
 * Startup API key validation: pings each configured provider family once
 * with a minimal request (maxOutputTokens: 1) to detect invalid keys early.
 * Satisfies D-12: startup key validation catches config errors before pipeline runs.
 */
export async function validateProviderKeys(
  configuredModels: string[],
  logger: Logger,
): Promise<ValidationResult[]> {
  // Deduplicate by provider family — only ping each family once
  const families = new Set<ProviderFamily>();
  const modelsToCheck: Array<{ modelId: string; family: ProviderFamily }> = [];
  for (const modelId of configuredModels) {
    const family = MODEL_FAMILY_MAP[modelId];
    if (family && !families.has(family)) {
      families.add(family);
      modelsToCheck.push({ modelId, family });
    }
  }

  const results: ValidationResult[] = [];
  for (const { modelId, family } of modelsToCheck) {
    try {
      await generateText({
        model: resolveModel(modelId),
        prompt: 'ping',
        maxOutputTokens: 1,
        maxRetries: 0,
      });
      results.push({ provider: family, valid: true });
      logger.info({ provider: family }, 'API key validated');
    } catch (error) {
      if (APICallError.isInstance(error) && (error.statusCode === 401 || error.statusCode === 403)) {
        results.push({ provider: family, valid: false, error: `Invalid API key: ${error.message}` });
        logger.error({ provider: family, err: error }, 'API key validation failed');
      } else {
        // Network/rate-limit errors don't mean the key is invalid
        results.push({ provider: family, valid: true, error: `Non-auth error (key may be valid): ${String(error)}` });
        logger.warn({ provider: family, err: error }, 'API key validation inconclusive');
      }
    }
  }
  return results;
}
