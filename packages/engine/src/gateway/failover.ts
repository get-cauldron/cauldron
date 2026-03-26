import { APICallError, type LanguageModel } from 'ai';
import { CircuitBreaker } from './circuit-breaker.js';
import { GatewayExhaustedError, type FailoverAttempt } from './errors.js';
import { resolveModel, getProviderFamily } from './providers.js';
import { filterDiverseModels } from './diversity.js';
import type { PipelineStage, ProviderFamily } from './types.js';

type ErrorKind = 'rate_limit' | 'server_error' | 'auth_error' | 'timeout' | 'other';

function classifyError(error: unknown): ErrorKind {
  if (APICallError.isInstance(error)) {
    const code = (error as APICallError).statusCode;
    if (code === 429) return 'rate_limit';
    if (code === 401 || code === 403) return 'auth_error';
    if (code !== undefined && code >= 500) return 'server_error';
  }
  // Check for network timeout codes
  const err = error as { code?: string };
  if (err?.code === 'ETIMEDOUT' || err?.code === 'ECONNABORTED') return 'timeout';
  return 'other';
}

function shouldRetry(kind: ErrorKind): boolean {
  return kind === 'rate_limit' || kind === 'server_error' || kind === 'timeout';
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 8000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ExecuteWithFailoverOptions<T> {
  modelChain: string[];
  stage: PipelineStage;
  circuitBreaker: CircuitBreaker;
  implementerFamily?: ProviderFamily;
  execute: (model: LanguageModel, modelId: string) => Promise<T>;
  onFailover?: (attempt: FailoverAttempt) => void;
}

export async function executeWithFailover<T>(
  options: ExecuteWithFailoverOptions<T>
): Promise<T> {
  const { stage, circuitBreaker, implementerFamily, execute, onFailover } = options;

  // For holdout stage, filter to diverse-only providers
  let chain = options.modelChain;
  if (stage === 'holdout' && implementerFamily !== undefined) {
    chain = filterDiverseModels(chain, implementerFamily);
    if (chain.length === 0) {
      throw new GatewayExhaustedError(stage, [
        {
          model: 'none',
          provider: implementerFamily,
          error: 'all models in chain share family with implementer',
          timestamp: new Date(),
        },
      ]);
    }
  }

  const attempts: FailoverAttempt[] = [];

  for (const modelId of chain) {
    const family = getProviderFamily(modelId);

    // Check circuit breaker
    if (circuitBreaker.isOpen(family)) {
      const attempt: FailoverAttempt = {
        model: modelId,
        provider: family,
        error: 'circuit breaker open',
        timestamp: new Date(),
      };
      attempts.push(attempt);
      onFailover?.(attempt);
      continue;
    }

    const model = resolveModel(modelId);

    // Attempt 1 (index 0)
    let firstError: unknown;
    try {
      const result = await execute(model, modelId);
      circuitBreaker.recordSuccess(family);
      return result;
    } catch (err) {
      firstError = err;
    }

    const kind = classifyError(firstError);

    if (shouldRetry(kind)) {
      // One retry with exponential backoff
      await sleep(backoffMs(0)); // attempt index 0 → 1000ms, max 8000ms
      try {
        const result = await execute(model, modelId);
        circuitBreaker.recordSuccess(family);
        return result;
      } catch (retryErr) {
        // Retry also failed — record failure and move to next provider
        const retryKind = classifyError(retryErr);
        const attempt: FailoverAttempt = {
          model: modelId,
          provider: family,
          error: retryErr instanceof Error ? retryErr.message : String(retryErr),
          statusCode: APICallError.isInstance(retryErr) ? (retryErr as APICallError).statusCode : undefined,
          timestamp: new Date(),
        };
        attempts.push(attempt);
        onFailover?.(attempt);
        // Only record circuit failure for retriable errors on retry — auth errors don't indicate provider health
        if (retryKind !== 'auth_error' && retryKind !== 'other') {
          circuitBreaker.recordFailure(family);
        }
        continue;
      }
    }

    // Non-retryable error — record failure and move on
    const attempt: FailoverAttempt = {
      model: modelId,
      provider: family,
      error: firstError instanceof Error ? firstError.message : String(firstError),
      statusCode: APICallError.isInstance(firstError) ? (firstError as APICallError).statusCode : undefined,
      timestamp: new Date(),
    };
    attempts.push(attempt);
    onFailover?.(attempt);
    if (kind !== 'auth_error' && kind !== 'other') {
      circuitBreaker.recordFailure(family);
    }
  }

  throw new GatewayExhaustedError(stage, attempts);
}
