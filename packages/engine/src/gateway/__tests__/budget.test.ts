import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkBudget } from '../budget.js';
import { BudgetExceededError } from '../errors.js';

// Mock @get-cauldron/shared to avoid requiring a DB connection
vi.mock('@get-cauldron/shared', () => ({
  llmUsage: { costCents: 'cost_cents', projectId: 'project_id' },
}));

function makeMockDb(total: number) {
  const whereMock = vi.fn().mockResolvedValue([{ total }]);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });
  return {
    select: selectMock,
    _whereMock: whereMock,
    _fromMock: fromMock,
  };
}

describe('checkBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not throw when cumulative cost is below limit', async () => {
    const db = makeMockDb(200);
    await expect(
      checkBudget(db as never, 'project-1', 500)
    ).resolves.toBeUndefined();
  });

  it('throws BudgetExceededError when cumulative cost equals the limit', async () => {
    const db = makeMockDb(500);
    await expect(
      checkBudget(db as never, 'project-1', 500)
    ).rejects.toThrow(BudgetExceededError);
  });

  it('throws BudgetExceededError when cumulative cost exceeds the limit', async () => {
    const db = makeMockDb(750);
    await expect(
      checkBudget(db as never, 'project-1', 500)
    ).rejects.toThrow(BudgetExceededError);
  });

  it('BudgetExceededError carries correct projectId, limitCents, currentCents', async () => {
    const db = makeMockDb(600);
    let caught: BudgetExceededError | null = null;
    try {
      await checkBudget(db as never, 'project-xyz', 500);
    } catch (err) {
      caught = err as BudgetExceededError;
    }
    expect(caught).toBeInstanceOf(BudgetExceededError);
    expect(caught?.projectId).toBe('project-xyz');
    expect(caught?.limitCents).toBe(500);
    expect(caught?.currentCents).toBe(600);
  });

  it('does not throw when there are no usage records (total = 0)', async () => {
    const db = makeMockDb(0);
    await expect(
      checkBudget(db as never, 'project-empty', 1000)
    ).resolves.toBeUndefined();
  });

  it('uses projectSettings budget override (lower limit) over config default', async () => {
    // checkBudget itself just accepts limitCents — the override logic lives in gateway.ts
    // This test verifies that passing a lower limitCents correctly triggers the error
    const db = makeMockDb(300);
    // With override limit of 200, the 300 current should throw
    await expect(
      checkBudget(db as never, 'project-override', 200)
    ).rejects.toThrow(BudgetExceededError);
    // With default limit of 500, the 300 current should not throw
    const db2 = makeMockDb(300);
    await expect(
      checkBudget(db2 as never, 'project-override', 500)
    ).resolves.toBeUndefined();
  });
});
