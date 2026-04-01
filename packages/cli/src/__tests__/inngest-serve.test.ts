import { describe, it, expect, vi } from 'vitest';

// Mock @get-cauldron/engine to avoid DB/network deps
vi.mock('@get-cauldron/engine', () => ({
  inngest: { id: 'cauldron-engine' },
  handleBeadDispatchRequested: { id: 'dag/dispatch-bead' },
  handleBeadCompleted: { id: 'dag/on-bead-completed' },
  handleMergeRequested: { id: 'execution/merge-bead' },
  handleEvolutionConverged: { id: 'holdout-vault/unseal-on-convergence' },
  handleEvolutionStarted: { id: 'evolution/run-cycle' },
  configureSchedulerDeps: vi.fn(),
  configureVaultDeps: vi.fn(),
  configureEvolutionDeps: vi.fn(),
  handleAssetGenerate: { id: 'asset/generate' },
  configureAssetDeps: vi.fn(),
}));

// Mock inngest/hono serve to capture what it receives
const mockServe = vi.fn().mockReturnValue(() => new Response('ok'));
vi.mock('inngest/hono', () => ({ serve: mockServe }));

describe('inngest-serve', () => {
  it('serves all 6 engine functions via the cauldron-engine client', async () => {
    const { createInngestApp, ENGINE_FUNCTIONS } = await import('../inngest-serve.js');
    const app = createInngestApp();

    expect(app).toBeDefined();
    expect(ENGINE_FUNCTIONS).toHaveLength(6);
    expect(mockServe).toHaveBeenCalledWith(
      expect.objectContaining({
        client: expect.objectContaining({ id: 'cauldron-engine' }),
        functions: expect.arrayContaining([
          expect.objectContaining({ id: 'dag/dispatch-bead' }),
          expect.objectContaining({ id: 'dag/on-bead-completed' }),
          expect.objectContaining({ id: 'execution/merge-bead' }),
          expect.objectContaining({ id: 'holdout-vault/unseal-on-convergence' }),
          expect.objectContaining({ id: 'evolution/run-cycle' }),
          expect.objectContaining({ id: 'asset/generate' }),
        ]),
      })
    );
  });
});
