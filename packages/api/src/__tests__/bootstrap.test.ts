import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @cauldron/shared to prevent DATABASE_URL error
vi.mock('@cauldron/shared', () => ({
  db: { insert: vi.fn(), select: vi.fn(), execute: vi.fn() },
}));

// Mock @cauldron/engine
vi.mock('@cauldron/engine', () => ({
  loadConfig: vi.fn(),
  LLMGateway: vi.fn(),
  inngest: {},
  configureSchedulerDeps: vi.fn(),
  configureVaultDeps: vi.fn(),
}));

// Mock pino
vi.mock('pino', () => ({
  default: vi.fn(() => ({ level: 'info', info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
}));

describe('bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 4: returns object with db, gateway, inngest, logger, config keys', async () => {
    const { loadConfig, LLMGateway, configureSchedulerDeps, configureVaultDeps } =
      await import('@cauldron/engine');

    const mockConfig = { models: {}, budget: { defaultLimitCents: 500 } };
    const mockGateway = { streamText: vi.fn() };

    (loadConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockConfig);
    (LLMGateway as ReturnType<typeof vi.fn>).mockImplementationOnce(() => mockGateway);

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
  });
});
