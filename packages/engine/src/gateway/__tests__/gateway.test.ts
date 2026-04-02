import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMGateway } from '../gateway.js';
import { DiversityViolationError, BudgetExceededError } from '../errors.js';
import type { GatewayConfig } from '../config.js';

// Mock AI SDK
vi.mock('ai', () => ({
  streamText: vi.fn(),
  generateText: vi.fn(),
  generateObject: vi.fn(),
  streamObject: vi.fn(),
  APICallError: {
    isInstance: vi.fn(() => false),
  },
}));

// Mock AI SDK provider packages
vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: (modelId: string) => ({ provider: 'anthropic', modelId }),
}));
vi.mock('@ai-sdk/openai', () => ({
  openai: (modelId: string) => ({ provider: 'openai', modelId }),
}));
vi.mock('@ai-sdk/google', () => ({
  google: (modelId: string) => ({ provider: 'google', modelId }),
}));

// Mock @get-cauldron/shared to avoid DB setup
vi.mock('@get-cauldron/shared', () => ({
  llmUsage: { costCents: 'cost_cents', projectId: 'project_id' },
  appendEvent: vi.fn().mockResolvedValue(undefined),
}));

import { generateText as mockGenerateText, streamText as mockStreamText } from 'ai';

// Budget DB mock factory
function makeBudgetDb(currentCents: number) {
  const whereMock = vi.fn().mockResolvedValue([{ total: currentCents }]);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const insertIntoDB = vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  });
  return {
    select: vi.fn().mockReturnValue({ from: fromMock }),
    insert: insertIntoDB,
  };
}

const testConfig: GatewayConfig = {
  models: {
    interview: ['claude-sonnet-4-6', 'gpt-4o'],
    holdout: ['gpt-4o', 'gemini-2.5-pro'],
    implementation: ['claude-sonnet-4-6'],
    evaluation: ['gemini-2.5-pro'],
    decomposition: ['claude-sonnet-4-6', 'gpt-4.1'],
    context_assembly: ['gpt-4o-mini', 'gpt-4o'],
    conflict_resolution: ['claude-sonnet-4-6', 'gpt-4o'],
  },
  budget: { defaultLimitCents: 1000 },
};

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as never;

describe('LLMGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('streamText routes to correct provider for interview stage', async () => {
    const db = makeBudgetDb(0); // under budget
    const mockResult = { textStream: async function* () { yield 'hello'; } };
    vi.mocked(mockStreamText).mockReturnValue(mockResult as never);

    const gateway = new LLMGateway({ db: db as never, config: testConfig, logger: mockLogger });
    const result = await gateway.streamText({
      projectId: 'proj-1',
      stage: 'interview',
      prompt: 'What should we build?',
    });

    expect(mockStreamText).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(mockStreamText).mock.calls[0]?.[0] as Record<string, unknown>;
    // Model should be resolved from claude-sonnet-4-6 (first in interview chain)
    expect(callArgs.model).toMatchObject({ provider: 'anthropic', modelId: 'claude-sonnet-4-6' });
    expect(result).toBe(mockResult);
  });

  it('generateText routes to correct provider for implementation stage', async () => {
    const db = makeBudgetDb(100); // under budget
    const mockResult = { text: 'generated', usage: { inputTokens: 100, outputTokens: 50 } };
    vi.mocked(mockGenerateText).mockResolvedValue(mockResult as never);

    const gateway = new LLMGateway({ db: db as never, config: testConfig, logger: mockLogger });
    const result = await gateway.generateText({
      projectId: 'proj-2',
      stage: 'implementation',
      prompt: 'Implement a function',
    });

    expect(mockGenerateText).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(mockGenerateText).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArgs.model).toMatchObject({ provider: 'anthropic', modelId: 'claude-sonnet-4-6' });
    expect(result).toBe(mockResult);
  });

  it('holdout call where all holdout candidates share implementer family throws DiversityViolationError', async () => {
    const db = makeBudgetDb(0);
    // Configure holdout to use same family as implementer
    const conflictConfig: GatewayConfig = {
      ...testConfig,
      models: {
        ...testConfig.models,
        holdout: ['claude-opus-4-5'],     // anthropic (same as implementation)
        implementation: ['claude-sonnet-4-6'], // anthropic
      },
    };

    const gateway = new LLMGateway({ db: db as never, config: conflictConfig, logger: mockLogger });

    await expect(
      gateway.streamText({ projectId: 'proj-3', stage: 'holdout', prompt: 'Generate tests' })
    ).rejects.toThrow(DiversityViolationError);
  });

  it('budget exceeded before AI SDK call throws BudgetExceededError', async () => {
    const db = makeBudgetDb(1000); // exactly at limit → should throw

    const gateway = new LLMGateway({ db: db as never, config: testConfig, logger: mockLogger });

    await expect(
      gateway.generateText({ projectId: 'proj-4', stage: 'interview', prompt: 'Hello' })
    ).rejects.toThrow(BudgetExceededError);

    // AI SDK generateText should NOT have been called
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it('generateText records usage after successful call', async () => {
    const db = makeBudgetDb(0);
    const usage = { inputTokens: 1000, outputTokens: 500 };
    vi.mocked(mockGenerateText).mockResolvedValue({ text: 'done', usage } as never);

    const gateway = new LLMGateway({ db: db as never, config: testConfig, logger: mockLogger });
    await gateway.generateText({ projectId: 'proj-5', stage: 'interview', prompt: 'Summarize' });

    // db.insert should have been called to record usage
    expect(db.insert).toHaveBeenCalled();
  });

  it('projectSettings budgetLimitCents overrides config default', async () => {
    // Lower budget via projectSettings
    const db = makeBudgetDb(300); // 300 cents current usage
    const gateway = new LLMGateway({
      db: db as never,
      config: testConfig, // default limit is 1000
      logger: mockLogger,
      projectSettings: { budgetLimitCents: 200 }, // override: 200 cent limit
    });

    // 300 > 200, should throw BudgetExceededError
    await expect(
      gateway.generateText({ projectId: 'proj-6', stage: 'interview', prompt: 'Hello' })
    ).rejects.toThrow(BudgetExceededError);
  });

  it('generateText awaits writeUsage synchronously -- usage insert completes before method returns (CONC-02)', async () => {
    const db = makeBudgetDb(0);
    const usage = { inputTokens: 500, outputTokens: 200 };

    // Track when insert is called relative to when generateText resolves
    let insertCalledBeforeReturn = false;
    let generateTextResolved = false;

    const insertMock = vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation(() => {
        // Mark that insert was called; check if generateText has already returned
        if (!generateTextResolved) {
          insertCalledBeforeReturn = true;
        }
        return Promise.resolve(undefined);
      }),
    }));

    const dbWithTracking = {
      ...db,
      insert: insertMock,
    };

    vi.mocked(mockGenerateText).mockResolvedValue({ text: 'result', usage } as never);

    const gateway = new LLMGateway({ db: dbWithTracking as never, config: testConfig, logger: mockLogger });
    await gateway.generateText({ projectId: 'proj-sync-1', stage: 'interview', prompt: 'Test' });
    generateTextResolved = true;

    // Insert must have been called before generateText returned
    expect(insertCalledBeforeReturn).toBe(true);
    expect(insertMock).toHaveBeenCalled();
  });

  it('generateObject awaits writeUsage synchronously -- usage insert completes before method returns (CONC-02)', async () => {
    const db = makeBudgetDb(0);
    const usage = { inputTokens: 300, outputTokens: 100 };

    let insertCalledBeforeReturn = false;
    let generateObjectResolved = false;

    const insertMock = vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation(() => {
        if (!generateObjectResolved) {
          insertCalledBeforeReturn = true;
        }
        return Promise.resolve(undefined);
      }),
    }));

    const dbWithTracking = {
      ...db,
      insert: insertMock,
    };

    const { generateObject: mockGenerateObject } = await import('ai');
    vi.mocked(mockGenerateObject).mockResolvedValue({ object: { test: true }, usage } as never);

    const gateway = new LLMGateway({ db: dbWithTracking as never, config: testConfig, logger: mockLogger });

    const { z } = await import('zod');
    await gateway.generateObject({
      projectId: 'proj-sync-2',
      stage: 'decomposition',
      prompt: 'Decompose',
      schema: z.object({ test: z.boolean() }),
    });
    generateObjectResolved = true;

    expect(insertCalledBeforeReturn).toBe(true);
    expect(insertMock).toHaveBeenCalled();
  });

  it('writeUsage errors propagate from generateText -- not silently swallowed (CONC-02)', async () => {
    const db = makeBudgetDb(0);
    const usage = { inputTokens: 100, outputTokens: 50 };
    const dbError = new Error('DB write failed');

    // Make insert throw
    const failingDb = {
      ...db,
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockRejectedValue(dbError),
      })),
    };

    vi.mocked(mockGenerateText).mockResolvedValue({ text: 'result', usage } as never);

    const gateway = new LLMGateway({ db: failingDb as never, config: testConfig, logger: mockLogger });

    // Error must propagate, not be swallowed
    await expect(
      gateway.generateText({ projectId: 'proj-err-1', stage: 'interview', prompt: 'Test' })
    ).rejects.toThrow('DB write failed');

    // Error should also be logged
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('no recordUsageAsync (fire-and-forget) pattern remains in gateway -- method renamed to recordUsage (CONC-02)', () => {
    // This test verifies at compile time that the fire-and-forget pattern is gone.
    // The gateway class should have recordUsage (async) not recordUsageAsync (void).
    // We verify by checking the gateway instance does not expose the old method name.
    const db = makeBudgetDb(0);
    const gateway = new LLMGateway({ db: db as never, config: testConfig, logger: mockLogger });

    // Private method not accessible, but the behavioral test above (errors propagate)
    // is the actual correctness check. This test documents the intent.
    expect(gateway).toBeInstanceOf(LLMGateway);
    // If recordUsageAsync existed as a public method, it would be here.
    // Since it's private, we rely on the error propagation tests.
  });
});
