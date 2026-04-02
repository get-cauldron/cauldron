import { generateText, APICallError } from 'ai';
import { resolveModel, getProviderFamily } from './providers.js';
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
 * Ollama family is validated via HTTP health check at /api/tags instead of generateText.
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
    let family: ProviderFamily;
    try { family = getProviderFamily(modelId); } catch { continue; }
    if (!families.has(family)) {
      families.add(family);
      modelsToCheck.push({ modelId, family });
    }
  }

  const results: ValidationResult[] = [];
  for (const { modelId, family } of modelsToCheck) {
    if (family === 'ollama') {
      try {
        const ollamaHost = process.env['OLLAMA_HOST'] ?? 'http://localhost:11434';
        const res = await fetch(`${ollamaHost}/api/tags`, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) throw new Error(`Ollama returned HTTP ${res.status}`);
        results.push({ provider: 'ollama', valid: true });
        logger.info({ provider: 'ollama' }, 'Ollama reachable');
      } catch (error) {
        results.push({ provider: 'ollama', valid: false, error: `Ollama not reachable: ${String(error)}` });
        logger.error({ provider: 'ollama', err: error }, 'Ollama validation failed');
      }
      continue;
    }

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
