import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { installEventSourceMock } from '../helpers/sse-mock';
import { TestProviders } from '../helpers/trpc-wrapper';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'evo-project-id' }),
  usePathname: () => '/projects/evo-project-id/evolution',
}));

vi.mock('@/trpc/client', () => ({ useTRPC: vi.fn() }));

// Mock useSSE to prevent actual EventSource connections
vi.mock('@/hooks/useSSE', () => ({
  useSSE: vi.fn(),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...mod, useQuery: vi.fn() };
});

import { useTRPC } from '@/trpc/client';
import { useQuery } from '@tanstack/react-query';
import EvolutionPage from '@/app/projects/[id]/evolution/page';

const mockSeeds = [
  { id: 'seed-1', parentId: null, generation: 1, goal: 'Build a task manager', acceptanceCriteria: [], status: 'crystallized', createdAt: new Date().toISOString(), evolutionContext: null },
  { id: 'seed-2', parentId: 'seed-1', generation: 2, goal: 'Enhanced task manager', acceptanceCriteria: [], status: 'crystallized', createdAt: new Date().toISOString(), evolutionContext: null },
];

function setupMocks(seeds = mockSeeds) {
  (useTRPC as ReturnType<typeof vi.fn>).mockReturnValue({
    evolution: {
      getSeedLineage: { queryOptions: vi.fn().mockReturnValue({ queryKey: ['lineage'], queryFn: vi.fn() }) },
      getEvolutionHistory: { queryOptions: vi.fn().mockReturnValue({ queryKey: ['history'], queryFn: vi.fn() }) },
      getConvergenceForSeed: { queryOptions: vi.fn().mockReturnValue({ queryKey: ['convergence'], queryFn: vi.fn() }) },
    },
  });

  let callCount = 0;
  (useQuery as ReturnType<typeof vi.fn>).mockImplementation((opts: unknown) => {
    const options = opts as { queryKey?: unknown[] };
    const key = options?.queryKey?.[0];
    if (key === 'lineage') return { data: seeds, isLoading: false, refetch: vi.fn() };
    if (key === 'history') return { data: [], isLoading: false, refetch: vi.fn() };
    if (key === 'convergence') return { data: undefined, isLoading: false, refetch: vi.fn() };
    return { data: undefined, isLoading: false, refetch: vi.fn() };
  });
}

beforeEach(() => {
  installEventSourceMock();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('EvolutionPage', () => {
  it('renders empty state when no seeds', () => {
    setupMocks([]);
    render(<TestProviders><EvolutionPage /></TestProviders>);
    // "No evolution cycles yet" appears in both the timeline header and the lineage tree empty state
    const matches = screen.getAllByText('No evolution cycles yet');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('renders seed lineage tree when seeds exist', () => {
    setupMocks();
    render(<TestProviders><EvolutionPage /></TestProviders>);
    expect(screen.getByText('Build a task manager')).toBeInTheDocument();
    expect(screen.getByText('Enhanced task manager')).toBeInTheDocument();
  });

  it('renders evolution timeline strip', () => {
    setupMocks();
    render(<TestProviders><EvolutionPage /></TestProviders>);
    // Generation dots should show gen numbers
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders convergence panel with default signals', () => {
    setupMocks();
    render(<TestProviders><EvolutionPage /></TestProviders>);
    expect(screen.getByText('CONVERGENCE SIGNALS')).toBeInTheDocument();
  });
});
