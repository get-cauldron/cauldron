import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeWithFailover } from '../failover.js';
import { CircuitBreaker } from '../circuit-breaker.js';
import { GatewayExhaustedError } from '../errors.js';

// Mock AI SDK — only APICallError.isInstance is used during failover classification
vi.mock('ai', () => ({
  APICallError: {
    isInstance: (err: unknown) => {
      return (err as Record<string, unknown>)?._isAPICallError === true;
    },
  },
}));

// Mock providers to control model resolution without real API keys
vi.mock('../providers.js', () => ({
  resolveModel: (modelId: string) => ({ modelId, __mock: true }),
  getProviderFamily: (modelId: string) => {
    const map: Record<string, string> = {
      'claude-sonnet-4-6': 'anthropic',
      'claude-opus-4-5': 'anthropic',
      'gpt-4o': 'openai',
      'gpt-4.1': 'openai',
      'gemini-2.5-pro': 'google',
      'gemini-2.0-flash': 'google',
    };
    const family = map[modelId];
    if (!family) throw new Error(`Unknown model ID: '${modelId}'`);
    return family;
  },
}));

// Helper to create an APICallError-like object
function makeApiError(statusCode: number, message = 'API error') {
  return Object.assign(new Error(message), { _isAPICallError: true, statusCode });
}

describe('executeWithFailover', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker();
    vi.clearAllMocks();
  });

  it('returns result from first model when it succeeds', async () => {
    const execute = vi.fn().mockResolvedValueOnce({ text: 'hello', model: 'claude-sonnet-4-6' });

    const result = await executeWithFailover({
      modelChain: ['claude-sonnet-4-6', 'gpt-4o'],
      stage: 'interview',
      circuitBreaker,
      execute,
    });

    expect(result).toEqual({ text: 'hello', model: 'claude-sonnet-4-6' });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('skips to second model when first returns 429 (rate limit)', async () => {
    const rateLimitErr = makeApiError(429);
    const execute = vi
      .fn()
      .mockRejectedValueOnce(rateLimitErr) // first attempt at model 1
      .mockRejectedValueOnce(rateLimitErr) // retry at model 1
      .mockResolvedValueOnce({ text: 'from gpt-4o' }); // model 2

    const result = await executeWithFailover({
      modelChain: ['claude-sonnet-4-6', 'gpt-4o'],
      stage: 'interview',
      circuitBreaker,
      execute,
    });

    expect(result).toEqual({ text: 'from gpt-4o' });
    // 2 calls for claude-sonnet-4-6 (initial + retry), 1 for gpt-4o
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('retries once on current model before failing over (D-14)', async () => {
    const serverError = makeApiError(503);
    const execute = vi
      .fn()
      .mockRejectedValueOnce(serverError) // initial attempt
      .mockRejectedValueOnce(serverError) // retry
      .mockResolvedValueOnce({ text: 'fallback result' }); // failover model succeeds

    await executeWithFailover({
      modelChain: ['claude-sonnet-4-6', 'gpt-4o'],
      stage: 'implementation',
      circuitBreaker,
      execute,
    });

    // First model was called twice (initial + 1 retry), then failover
    expect(execute).toHaveBeenCalledTimes(3);
    const firstCallModel = (execute.mock.calls[0] as [{ modelId: string }])[0];
    const secondCallModel = (execute.mock.calls[1] as [{ modelId: string }])[0];
    const thirdCallModel = (execute.mock.calls[2] as [{ modelId: string }])[0];
    expect(firstCallModel.modelId).toBe('claude-sonnet-4-6');
    expect(secondCallModel.modelId).toBe('claude-sonnet-4-6');
    expect(thirdCallModel.modelId).toBe('gpt-4o');
  });

  it('throws GatewayExhaustedError when all models fail', async () => {
    const execute = vi.fn().mockRejectedValue(makeApiError(500));

    await expect(
      executeWithFailover({
        modelChain: ['claude-sonnet-4-6', 'gpt-4o'],
        stage: 'interview',
        circuitBreaker,
        execute,
      })
    ).rejects.toThrow(GatewayExhaustedError);
  });

  it('skips models with open circuit breaker', async () => {
    // Open the anthropic circuit
    for (let i = 0; i < 3; i++) {
      circuitBreaker.recordFailure('anthropic');
    }

    const execute = vi.fn().mockResolvedValueOnce({ text: 'from gpt-4o' });

    const result = await executeWithFailover({
      modelChain: ['claude-sonnet-4-6', 'gpt-4o'],
      stage: 'interview',
      circuitBreaker,
      execute,
    });

    expect(result).toEqual({ text: 'from gpt-4o' });
    // execute should only have been called once — for gpt-4o, not claude-sonnet-4-6
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('for holdout stage, filters out models from implementer family', async () => {
    const execute = vi.fn().mockResolvedValueOnce({ text: 'holdout result' });

    const result = await executeWithFailover({
      modelChain: ['claude-sonnet-4-6', 'gpt-4o', 'gemini-2.5-pro'],
      stage: 'holdout',
      circuitBreaker,
      implementerFamily: 'anthropic',
      execute,
    });

    expect(result).toEqual({ text: 'holdout result' });
    // Only gpt-4o or gemini-2.5-pro should have been attempted
    const calledModel = (execute.mock.calls[0] as [{ modelId: string }])[0];
    expect(['gpt-4o', 'gemini-2.5-pro']).toContain(calledModel.modelId);
  });

  it('records FailoverAttempt for each failed model via onFailover callback', async () => {
    const serverErr = makeApiError(500);
    const execute = vi
      .fn()
      .mockRejectedValueOnce(serverErr) // claude initial
      .mockRejectedValueOnce(serverErr) // claude retry
      .mockRejectedValueOnce(serverErr) // gpt-4o initial
      .mockRejectedValueOnce(serverErr); // gpt-4o retry

    const onFailover = vi.fn();

    await expect(
      executeWithFailover({
        modelChain: ['claude-sonnet-4-6', 'gpt-4o'],
        stage: 'interview',
        circuitBreaker,
        execute,
        onFailover,
      })
    ).rejects.toThrow(GatewayExhaustedError);

    // One FailoverAttempt per model after all retries
    expect(onFailover).toHaveBeenCalledTimes(2);
    const firstAttempt = onFailover.mock.calls[0][0];
    const secondAttempt = onFailover.mock.calls[1][0];
    expect(firstAttempt.model).toBe('claude-sonnet-4-6');
    expect(secondAttempt.model).toBe('gpt-4o');
  });

  it('throws GatewayExhaustedError when holdout chain is empty after diversity filter', async () => {
    const execute = vi.fn();

    await expect(
      executeWithFailover({
        modelChain: ['claude-sonnet-4-6', 'claude-opus-4-5'],
        stage: 'holdout',
        circuitBreaker,
        implementerFamily: 'anthropic',
        execute,
      })
    ).rejects.toThrow(GatewayExhaustedError);

    expect(execute).not.toHaveBeenCalled();
  });

  it('handles mixed error types across models in sequence', async () => {
    const execute = vi.fn().mockImplementation(async (_model: unknown, modelId: string) => {
      if (modelId === 'claude-sonnet-4-6') {
        const error = new Error('Rate limited');
        (error as any).status = 429;
        throw error;
      }
      if (modelId === 'gpt-4o') {
        const error = new Error('Auth failed');
        (error as any).status = 401;
        throw error;
      }
      return { text: 'success' };
    });

    await expect(
      executeWithFailover({
        modelChain: ['claude-sonnet-4-6', 'gpt-4o'],
        execute,
        circuitBreaker: new CircuitBreaker(),
        stage: 'interview',
      }),
    ).rejects.toThrow();

    // Both models should have been attempted
    expect(execute.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('does not retry on 401 auth errors (non-retryable)', async () => {
    const execute = vi.fn().mockImplementation(async () => {
      const error = new Error('Auth failed');
      (error as any).status = 401;
      throw error;
    });

    await expect(
      executeWithFailover({
        modelChain: ['claude-sonnet-4-6', 'gpt-4o'],
        execute,
        circuitBreaker: new CircuitBreaker(),
        stage: 'interview',
      }),
    ).rejects.toThrow();

    // 401 is non-retryable, so each model should be tried at most once (no retry)
    // 2 models = at most 2 calls (one per model, no retries)
    expect(execute.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
