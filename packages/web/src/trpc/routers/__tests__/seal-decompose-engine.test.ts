import { describe, it, expect, vi, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// Mocks — hoisted before any imports that transitively touch them
// ────────────────────────────────────────────────────────────────────────────

const mockApproveScenarios = vi.fn();
const mockSealVault = vi.fn();
const mockRunDecomposition = vi.fn();
// The engine inngest client exported from @get-cauldron/engine (id: 'cauldron-engine')
const mockEngineInngest = { id: 'cauldron-engine', send: vi.fn() };

vi.mock('@get-cauldron/engine', () => ({
  approveScenarios: mockApproveScenarios,
  sealVault: mockSealVault,
  runDecomposition: mockRunDecomposition,
  inngest: mockEngineInngest,
  // Keep InterviewFSM stub so that interview.ts can still import it
  InterviewFSM: vi.fn(function (this: unknown) {
    Object.assign(this as object, { submitAnswer: vi.fn() });
  }),
}));

vi.mock('@get-cauldron/shared', () => ({
  db: {},
  interviews: {},
  seeds: { id: 'id', projectId: 'projectId', interviewId: 'interviewId', createdAt: 'createdAt' },
  holdoutVault: { id: 'id', seedId: 'seedId', status: 'status' },
  beads: {},
  beadEdges: {},
  events: {},
  appendEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => `eq(${String(_col)}, ${String(_val)})`),
  desc: vi.fn((col: unknown) => `desc(${String(col)})`),
  inArray: vi.fn((_col: unknown, _vals: unknown) => `inArray(${String(_col)})`),
}));

// ────────────────────────────────────────────────────────────────────────────
// Import routers AFTER mocks
// ────────────────────────────────────────────────────────────────────────────

const { interviewRouter } = await import('../interview.js');
const { executionRouter } = await import('../execution.js');

// ────────────────────────────────────────────────────────────────────────────
// Helper: minimal tRPC context factory
// ────────────────────────────────────────────────────────────────────────────

interface SeedRow {
  id: string;
  projectId: string;
  interviewId?: string | null;
  createdAt?: Date;
}

interface VaultRow {
  id: string;
  seedId: string;
  status: 'pending_review' | 'approved' | 'sealed' | 'unsealed' | 'evaluated';
}

function makeSealCtx(opts: {
  seedRow?: SeedRow | null;
  vaultRows?: VaultRow[];
}) {
  const seedRow = opts.seedRow !== undefined
    ? opts.seedRow
    : { id: 'seed-001', projectId: 'project-abc' };

  const vaultRows: VaultRow[] = opts.vaultRows ?? [
    { id: 'vault-001', seedId: 'seed-001', status: 'approved' },
    { id: 'vault-002', seedId: 'seed-001', status: 'approved' },
  ];

  // DB fluent builder that returns seeds or vault rows depending on which table is queried
  let callCount = 0;
  const makeChainable = (result: unknown[]) => ({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  });

  const seedChainable = makeChainable(seedRow ? [seedRow] : []);
  // Vault select resolves directly (no .limit needed for the full-table select)
  const vaultChainable = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(vaultRows),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(vaultRows),
  };

  const db = {
    select: vi.fn().mockImplementation(() => {
      callCount++;
      // First select is for seeds, subsequent selects are for holdoutVault
      if (callCount === 1) return seedChainable;
      return vaultChainable;
    }),
  };

  const getEngineDeps = vi.fn().mockResolvedValue({
    gateway: {},
    config: {},
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });

  return { db, authenticated: true, getEngineDeps };
}

function makeDecomposeCtx(opts: {
  seedRow?: SeedRow | null;
}) {
  const seedRow = opts.seedRow !== undefined
    ? opts.seedRow
    : { id: 'seed-001', projectId: 'project-abc' };

  const db = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(seedRow ? [seedRow] : []),
    }),
  };

  const getEngineDeps = vi.fn().mockResolvedValue({
    gateway: { callCount: 0 },
    config: {},
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });

  return { db, authenticated: true, getEngineDeps };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callMutation(router: any, name: string, input: unknown, ctx: unknown) {
  const caller = router.createCaller(ctx);
  return caller[name](input);
}

// ────────────────────────────────────────────────────────────────────────────
// Task 1: sealHoldouts wiring tests
// ────────────────────────────────────────────────────────────────────────────

describe('sealHoldouts tRPC mutation — sealVault wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls sealVault (not approveScenarios) for each approved entry', async () => {
    const ctx = makeSealCtx({});
    await callMutation(interviewRouter, 'sealHoldouts', { seedId: 'seed-001' }, ctx);

    // sealHoldouts no longer calls approveScenarios — entries are already
    // approved by the approveHoldout procedure which uses approveScenarios
    expect(mockApproveScenarios).not.toHaveBeenCalled();
    expect(mockSealVault).toHaveBeenCalledTimes(2);
    expect(mockSealVault).toHaveBeenCalledWith(ctx.db, {
      vaultId: 'vault-001',
      projectId: 'project-abc',
    });
    expect(mockSealVault).toHaveBeenCalledWith(ctx.db, {
      vaultId: 'vault-002',
      projectId: 'project-abc',
    });
  });

  it('throws when no approved entries exist for the seed', async () => {
    const ctx = makeSealCtx({
      vaultRows: [
        { id: 'vault-001', seedId: 'seed-001', status: 'pending_review' },
      ],
    });

    await expect(
      callMutation(interviewRouter, 'sealHoldouts', { seedId: 'seed-001' }, ctx),
    ).rejects.toThrow('No approved holdout entries found for seed seed-001');
  });

  it('throws when seed is not found', async () => {
    const ctx = makeSealCtx({ seedRow: null });

    await expect(
      callMutation(interviewRouter, 'sealHoldouts', { seedId: 'seed-missing' }, ctx),
    ).rejects.toThrow('Seed seed-missing not found');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Task 2: triggerDecomposition wiring tests
// Note: triggerDecomposition input schema uses z.string().uuid() — tests must
// use valid UUIDs or Zod v4 will reject inputs before the handler runs.
// ────────────────────────────────────────────────────────────────────────────

const VALID_PROJECT_UUID = '11111111-1111-4111-8111-111111111111';
const VALID_SEED_UUID = '22222222-2222-4222-8222-222222222222';

describe('triggerDecomposition tRPC mutation — runDecomposition wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunDecomposition.mockResolvedValue({
      decomposition: {},
      moleculeDbIds: new Map(),
      beadDbIds: new Map(),
      dispatchedBeadIds: [],
    });
  });

  it('calls runDecomposition with the engine inngest client (id: cauldron-engine)', async () => {
    const ctx = makeDecomposeCtx({
      seedRow: { id: VALID_SEED_UUID, projectId: VALID_PROJECT_UUID },
    });
    await callMutation(executionRouter, 'triggerDecomposition', {
      projectId: VALID_PROJECT_UUID,
      seedId: VALID_SEED_UUID,
    }, ctx);

    expect(mockRunDecomposition).toHaveBeenCalledOnce();
    const callArgs = mockRunDecomposition.mock.calls[0]![0];
    expect(callArgs.inngest).toBe(mockEngineInngest);
    expect(callArgs.inngest.id).toBe('cauldron-engine');
  });

  it('fetches seed by seedId and passes it to runDecomposition', async () => {
    const ctx = makeDecomposeCtx({
      seedRow: { id: VALID_SEED_UUID, projectId: VALID_PROJECT_UUID },
    });
    await callMutation(executionRouter, 'triggerDecomposition', {
      projectId: VALID_PROJECT_UUID,
      seedId: VALID_SEED_UUID,
    }, ctx);

    expect(mockRunDecomposition).toHaveBeenCalledOnce();
    const callArgs = mockRunDecomposition.mock.calls[0]![0];
    expect(callArgs.seed).toMatchObject({ id: VALID_SEED_UUID, projectId: VALID_PROJECT_UUID });
    expect(callArgs.projectId).toBe(VALID_PROJECT_UUID);
  });

  it('throws when seed is not found', async () => {
    const ctx = makeDecomposeCtx({ seedRow: null });

    await expect(
      callMutation(executionRouter, 'triggerDecomposition', {
        projectId: VALID_PROJECT_UUID,
        seedId: VALID_SEED_UUID,
      }, ctx),
    ).rejects.toThrow(`Seed ${VALID_SEED_UUID} not found`);
  });

  it('appends audit event AND calls runDecomposition (both called)', async () => {
    const { appendEvent } = await import('@get-cauldron/shared');
    const ctx = makeDecomposeCtx({
      seedRow: { id: VALID_SEED_UUID, projectId: VALID_PROJECT_UUID },
    });
    await callMutation(executionRouter, 'triggerDecomposition', {
      projectId: VALID_PROJECT_UUID,
      seedId: VALID_SEED_UUID,
    }, ctx);

    expect(appendEvent).toHaveBeenCalled();
    expect(mockRunDecomposition).toHaveBeenCalled();
  });
});
