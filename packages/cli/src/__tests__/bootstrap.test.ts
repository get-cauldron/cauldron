import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @get-cauldron/shared to prevent DATABASE_URL error
vi.mock('@get-cauldron/shared', () => ({
  db: { insert: vi.fn(), select: vi.fn(), execute: vi.fn() },
  ensureMigrations: vi.fn().mockResolvedValue(undefined),
}));

// Mock @get-cauldron/engine — LLMGateway must be a class-compatible mock
vi.mock('@get-cauldron/engine', () => {
  const mockInstance = { streamText: vi.fn() };
  const MockLLMGateway = vi.fn(function () {
    return mockInstance;
  }) as ReturnType<typeof vi.fn> & { create: ReturnType<typeof vi.fn> };
  MockLLMGateway.create = vi.fn().mockResolvedValue(mockInstance);
  return {
    loadConfig: vi.fn(),
    LLMGateway: MockLLMGateway,
    inngest: {},
    configureSchedulerDeps: vi.fn(),
    configureVaultDeps: vi.fn(),
    configureEvolutionDeps: vi.fn(),
    createComfyUIExecutor: vi.fn().mockReturnValue({ generate: vi.fn() }),
    configureAssetDeps: vi.fn(),
  };
});

// Mock pino
vi.mock('pino', () => ({
  default: vi.fn(() => ({ level: 'info', info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
}));

describe('bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 4: returns object with db, gateway, inngest, logger, config keys', async () => {
    const { loadConfig, LLMGateway, configureSchedulerDeps, configureVaultDeps, configureEvolutionDeps } =
      await import('@get-cauldron/engine');

    const mockConfig = { models: {}, budget: { defaultLimitCents: 500 } };
    const mockGateway = { streamText: vi.fn() };

    (loadConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockConfig);

    const { bootstrap } = await import('../bootstrap.js');
    const result = await bootstrap('/fake/root');

    expect(result).toHaveProperty('db');
    expect(result).toHaveProperty('gateway');
    expect(result).toHaveProperty('inngest');
    expect(result).toHaveProperty('logger');
    expect(result).toHaveProperty('config');

    expect(loadConfig).toHaveBeenCalledWith('/fake/root');
    expect(configureSchedulerDeps).toHaveBeenCalledWith(
      expect.objectContaining({ db: expect.anything(), gateway: expect.anything(), projectRoot: '/fake/root' })
    );
    expect(configureVaultDeps).toHaveBeenCalledWith(
      expect.objectContaining({ db: expect.anything(), gateway: expect.anything() })
    );
    expect(configureEvolutionDeps).toHaveBeenCalledWith(
      expect.objectContaining({ db: expect.anything(), gateway: expect.anything() })
    );
  });
});
