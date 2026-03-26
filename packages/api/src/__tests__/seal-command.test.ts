import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

// Mock @cauldron/shared to prevent DATABASE_URL error at import time
vi.mock('@cauldron/shared', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  holdoutVault: {},
  eq: vi.fn(),
  seeds: {},
}));

// Mock @cauldron/engine
vi.mock('@cauldron/engine', () => ({
  generateHoldoutScenarios: vi.fn(),
  createVault: vi.fn(),
  approveScenarios: vi.fn(),
  sealVault: vi.fn(),
  loadConfig: vi.fn(),
  LLMGateway: vi.fn(function () { return {}; }),
  inngest: {},
  configureSchedulerDeps: vi.fn(),
  configureVaultDeps: vi.fn(),
}));

// Mock pino
vi.mock('pino', () => ({
  default: vi.fn(() => ({ level: 'info', info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
}));

// Mock bootstrap
vi.mock('../bootstrap.js', () => ({
  bootstrap: vi.fn(),
}));

// Do NOT mock holdout-writer — let it use real fs via tempDir

describe('sealCommand', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env['HOLDOUT_ENCRYPTION_KEY'] = Buffer.alloc(32).toString('base64');
    tempDir = join(tmpdir(), `cauldron-seal-test-${randomBytes(8).toString('hex')}`);
    mkdirSync(tempDir, { recursive: true });
    process.argv = ['node', 'cli.ts', 'seal', '--seed-id', 'seed-111', '--project-root', tempDir];
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('Test 2: reads holdout draft and calls approveScenarios then sealVault when draft exists', async () => {
    const { approveScenarios, sealVault } = await import('@cauldron/engine');
    const { bootstrap } = await import('../bootstrap.js');

    // Create the draft file in the temp directory
    const reviewDir = join(tempDir, '.cauldron', 'review');
    mkdirSync(reviewDir, { recursive: true });
    const draftScenarios = [
      { id: 'sc-1', title: 'Scenario 1', given: 'G', when: 'W', then: 'T', category: 'happy_path', acceptanceCriterionRef: 'AC-01', severity: 'critical', approved: true },
      { id: 'sc-2', title: 'Scenario 2', given: 'G', when: 'W', then: 'T', category: 'happy_path', acceptanceCriterionRef: 'AC-02', severity: 'major', approved: true },
      { id: 'sc-3', title: 'Scenario 3', given: 'G', when: 'W', then: 'T', category: 'edge_case', acceptanceCriterionRef: 'AC-01', severity: 'minor', approved: true },
      { id: 'sc-4', title: 'Scenario 4', given: 'G', when: 'W', then: 'T', category: 'error_handling', acceptanceCriterionRef: 'AC-03', severity: 'major', approved: true },
      { id: 'sc-5', title: 'Scenario 5', given: 'G', when: 'W', then: 'T', category: 'error_handling', acceptanceCriterionRef: 'AC-04', severity: 'major', approved: true },
    ];
    writeFileSync(join(reviewDir, 'holdout-draft-seed-111.json'), JSON.stringify(draftScenarios), 'utf-8');

    const mockVault = { id: 'vault-xyz-789', seedId: 'seed-111', status: 'pending_review' };
    const mockSeed = { id: 'seed-111', projectId: 'project-xyz' };

    const mockVaultDbQuery = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockVault]),
    };

    const mockSeedDbQuery = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockSeed]),
    };

    const mockDb = {
      select: vi.fn()
        .mockReturnValueOnce(mockVaultDbQuery)
        .mockReturnValueOnce(mockSeedDbQuery),
    };

    (bootstrap as ReturnType<typeof vi.fn>).mockResolvedValue({
      db: mockDb,
      gateway: {},
      config: {},
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      inngest: {},
    });

    (approveScenarios as ReturnType<typeof vi.fn>).mockResolvedValue({ approved: 5 });
    (sealVault as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { sealCommand } = await import('../commands/seal.js');
    await sealCommand();

    expect(approveScenarios).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ vaultId: 'vault-xyz-789' })
    );
    expect(sealVault).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ vaultId: 'vault-xyz-789' })
    );

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('Test 3: generates holdout scenarios and writes draft when --generate flag is set', async () => {
    process.argv = ['node', 'cli.ts', 'seal', '--seed-id', 'seed-222', '--generate', '--project-root', tempDir];

    const { generateHoldoutScenarios, createVault } = await import('@cauldron/engine');
    const { bootstrap } = await import('../bootstrap.js');

    const mockSeed = {
      id: 'seed-222',
      projectId: 'project-abc',
      goal: 'Build a rename tool',
      status: 'crystallized',
    };

    const mockSeedDbQuery = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockSeed]),
    };

    const mockDb = {
      select: vi.fn().mockReturnValue(mockSeedDbQuery),
    };

    const mockScenarios = [
      { id: 'sc-a', title: 'Scenario A', given: 'G', when: 'W', then: 'T', category: 'happy_path', acceptanceCriterionRef: 'AC-01', severity: 'critical' },
      { id: 'sc-b', title: 'Scenario B', given: 'G', when: 'W', then: 'T', category: 'edge_case', acceptanceCriterionRef: 'AC-02', severity: 'major' },
    ];

    (generateHoldoutScenarios as ReturnType<typeof vi.fn>).mockResolvedValue(mockScenarios);
    (createVault as ReturnType<typeof vi.fn>).mockResolvedValue('vault-new-123');

    (bootstrap as ReturnType<typeof vi.fn>).mockResolvedValue({
      db: mockDb,
      gateway: { generateObject: vi.fn() },
      config: {},
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      inngest: {},
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { sealCommand } = await import('../commands/seal.js');
    await sealCommand();

    expect(generateHoldoutScenarios).toHaveBeenCalled();
    expect(createVault).toHaveBeenCalled();

    const logCalls = (consoleSpy.mock.calls as string[][]).map(c => String(c[0]));
    expect(logCalls.some(line => line.toLowerCase().includes('draft') || line.includes('review'))).toBe(true);

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('Test 4: exits with error when no scenarios are approved', async () => {
    const { bootstrap } = await import('../bootstrap.js');

    // Create draft with all-rejected scenarios
    const reviewDir = join(tempDir, '.cauldron', 'review');
    mkdirSync(reviewDir, { recursive: true });
    const rejectedScenarios = [
      { id: 'sc-1', title: 'Scenario 1', approved: false },
      { id: 'sc-2', title: 'Scenario 2', approved: false },
    ];
    writeFileSync(join(reviewDir, 'holdout-draft-seed-111.json'), JSON.stringify(rejectedScenarios), 'utf-8');

    const mockVault = { id: 'vault-rejected', seedId: 'seed-111', status: 'pending_review' };
    const mockDbQuery = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockVault]),
    };

    const mockDb = {
      select: vi.fn().mockReturnValue(mockDbQuery),
    };

    (bootstrap as ReturnType<typeof vi.fn>).mockResolvedValue({
      db: mockDb,
      gateway: {},
      config: {},
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      inngest: {},
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { sealCommand } = await import('../commands/seal.js');
    await sealCommand();

    expect(process.exit).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
