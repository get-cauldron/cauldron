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

// Mock @cauldron/shared to avoid DB setup
vi.mock('@cauldron/shared', () => ({
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
});
