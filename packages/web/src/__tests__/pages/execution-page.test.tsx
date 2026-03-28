import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { installEventSourceMock } from '../helpers/sse-mock';
import { TestProviders } from '../helpers/trpc-wrapper';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'exec-project-id' }),
  usePathname: () => '/projects/exec-project-id/execution',
}));

vi.mock('@/trpc/client', () => ({ useTRPC: vi.fn() }));

// Mock DAGCanvas to avoid @xyflow/react OOM
vi.mock('@/components/dag/DAGCanvas', () => ({
  DAGCanvas: ({ onNodeClick }: { onNodeClick?: (id: string) => void }) => (
    <div data-testid="dag-canvas">
      <button onClick={() => onNodeClick?.('bead-1')}>Bead 1</button>
    </div>
  ),
}));

// Mock BeadDetailSheet
vi.mock('@/components/bead/BeadDetailSheet', () => ({
  BeadDetailSheet: ({ beadId, onClose }: { beadId: string | null; onClose: () => void }) =>
    beadId ? (
      <div data-testid="bead-detail-sheet">
        <span>{beadId}</span>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

// Mock useEscalation
vi.mock('@/hooks/useEscalation', () => ({
  useEscalation: () => ({ activeEscalation: null, resolveEscalation: vi.fn() }),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...mod, useQuery: vi.fn(), useMutation: vi.fn() };
});

import { useTRPC } from '@/trpc/client';
import { useQuery, useMutation } from '@tanstack/react-query';
import ExecutionPage from '@/app/projects/[id]/execution/page';

beforeEach(() => {
  installEventSourceMock();
  (useTRPC as ReturnType<typeof vi.fn>).mockReturnValue({
    evolution: {
      getSeedLineage: { queryOptions: vi.fn().mockReturnValue({ queryKey: ['lineage'], queryFn: vi.fn() }) },
    },
    execution: {
      respondToEscalation: { mutationOptions: vi.fn().mockReturnValue({ mutationFn: vi.fn() }) },
    },
  });
  (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({ data: [], isLoading: false });
  (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: vi.fn(), isPending: false });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ExecutionPage', () => {
  it('renders DAG canvas area', () => {
    render(<TestProviders><ExecutionPage /></TestProviders>);
    expect(screen.getByTestId('dag-canvas')).toBeInTheDocument();
  });

  it('opens bead detail sheet when bead node is clicked', async () => {
    render(<TestProviders><ExecutionPage /></TestProviders>);
    // Click the mock bead button in DAGCanvas
    const beadBtn = screen.getByText('Bead 1');
    await act(async () => { beadBtn.click(); });
    // Detail sheet should open
    expect(screen.getByTestId('bead-detail-sheet')).toBeInTheDocument();
    expect(screen.getByText('bead-1')).toBeInTheDocument();
  });

  it('closes bead detail sheet when close button clicked', async () => {
    render(<TestProviders><ExecutionPage /></TestProviders>);
    // Open sheet
    await act(async () => { screen.getByText('Bead 1').click(); });
    expect(screen.getByTestId('bead-detail-sheet')).toBeInTheDocument();
    // Close sheet
    await act(async () => { screen.getByText('Close').click(); });
    expect(screen.queryByTestId('bead-detail-sheet')).not.toBeInTheDocument();
  });

  it('renders evolution timeline', () => {
    render(<TestProviders><ExecutionPage /></TestProviders>);
    // EvolutionTimeline with empty generations shows "No evolution cycles yet"
    expect(screen.getByText('No evolution cycles yet')).toBeInTheDocument();
  });
});
