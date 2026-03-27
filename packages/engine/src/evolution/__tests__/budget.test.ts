import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @get-cauldron/shared to prevent DATABASE_URL error at import time
vi.mock('@get-cauldron/shared', () => ({
  llmUsage: { seedId: 'seedId', costCents: 'costCents' },
}));

// Mock drizzle-orm inArray/sql
vi.mock('drizzle-orm', () => ({
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    _sql: true,
    strings,
    values,
  })),
  inArray: vi.fn((col: unknown, arr: unknown[]) => ({ _inArray: true, col, arr })),
}));

// Mock crystallizer
vi.mock('../../interview/crystallizer.js', () => ({
  getSeedLineage: vi.fn(),
}));

// Mock the errors module for BudgetExceededError
vi.mock('../../gateway/errors.js', () => ({
  BudgetExceededError: class BudgetExceededError extends Error {
    projectId: string;
    limitCents: number;
    currentCents: number;
    constructor(projectId: string, limitCents: number, currentCents: number) {
      super(`Budget exceeded: ${currentCents} of ${limitCents}`);
      this.name = 'BudgetExceededError';
      this.projectId = projectId;
      this.limitCents = limitCents;
      this.currentCents = currentCents;
    }
  },
}));

import { checkLineageBudget } from '../budget.js';
import { getSeedLineage } from '../../interview/crystallizer.js';

const mockGetSeedLineage = getSeedLineage as ReturnType<typeof vi.fn>;

function makeMockDb(totalCents: number) {
  const whereMock = vi.fn().mockResolvedValue([{ total: totalCents }]);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });
  return { select: selectMock, _where: whereMock, _from: fromMock };
}

function makeSeed(id: string) {
  return { id, version: 1 };
}

describe('checkLineageBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not throw when lineage total 500 cents and limit 1000 cents', async () => {
    const lineage = [makeSeed('s1'), makeSeed('s2')];
    mockGetSeedLineage.mockResolvedValue(lineage);
    const db = makeMockDb(500);

    await expect(
      checkLineageBudget(db as never, 's2', 1000)
    ).resolves.toBeUndefined();
  });

  it('throws BudgetExceededError when lineage total equals limit (1000 === 1000)', async () => {
    const lineage = [makeSeed('s1'), makeSeed('s2')];
    mockGetSeedLineage.mockResolvedValue(lineage);
    const db = makeMockDb(1000);

    const error = await checkLineageBudget(db as never, 's2', 1000).catch((e: unknown) => e);
    expect((error as Error).name).toBe('BudgetExceededError');
  });

  it('throws BudgetExceededError when lineage total exceeds limit (1500 > 1000)', async () => {
    const lineage = [makeSeed('s1'), makeSeed('s2')];
    mockGetSeedLineage.mockResolvedValue(lineage);
    const db = makeMockDb(1500);

    const error = await checkLineageBudget(db as never, 's2', 1000).catch((e: unknown) => e);
    expect((error as Error).name).toBe('BudgetExceededError');
    expect((error as { limitCents: number }).limitCents).toBe(1000);
    expect((error as { currentCents: number }).currentCents).toBe(1500);
  });

  it('does not throw when no llm_usage records (total 0)', async () => {
    const lineage = [makeSeed('s1')];
    mockGetSeedLineage.mockResolvedValue(lineage);
    const db = makeMockDb(0);

    await expect(
      checkLineageBudget(db as never, 's1', 1000)
    ).resolves.toBeUndefined();
  });

  it('does not throw when lineage is empty', async () => {
    mockGetSeedLineage.mockResolvedValue([]);
    const db = makeMockDb(0);

    await expect(
      checkLineageBudget(db as never, 'orphan', 1000)
    ).resolves.toBeUndefined();

    // No DB call should be made for empty lineage
    expect(db.select).not.toHaveBeenCalled();
  });

  it('aggregates across all seeds in lineage (not just current)', async () => {
    const lineage = [
      makeSeed('ancestor-1'),
      makeSeed('ancestor-2'),
      makeSeed('current-seed'),
    ];
    mockGetSeedLineage.mockResolvedValue(lineage);
    const db = makeMockDb(800);

    await expect(
      checkLineageBudget(db as never, 'current-seed', 1000)
    ).resolves.toBeUndefined();

    // Verify it called getSeedLineage with the right seed ID
    expect(mockGetSeedLineage).toHaveBeenCalledWith(expect.anything(), 'current-seed');

    // Verify the DB query used inArray with all 3 lineage IDs
    const { inArray } = await import('drizzle-orm');
    expect(inArray).toHaveBeenCalledWith(
      expect.anything(),
      ['ancestor-1', 'ancestor-2', 'current-seed']
    );
  });

  it('throws BudgetExceededError with correct projectId (seedId), limitCents, currentCents', async () => {
    const lineage = [makeSeed('seed-abc')];
    mockGetSeedLineage.mockResolvedValue(lineage);
    const db = makeMockDb(2000);

    const error = await checkLineageBudget(db as never, 'seed-abc', 500).catch((e: unknown) => e);
    expect((error as Error).name).toBe('BudgetExceededError');
    expect((error as { projectId: string }).projectId).toBe('seed-abc');
    expect((error as { limitCents: number }).limitCents).toBe(500);
    expect((error as { currentCents: number }).currentCents).toBe(2000);
  });
});
