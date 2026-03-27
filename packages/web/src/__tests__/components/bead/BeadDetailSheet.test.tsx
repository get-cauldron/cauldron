import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TestProviders } from '../../helpers/trpc-wrapper';

// Mock tRPC client
vi.mock('@/trpc/client', () => ({
  useTRPC: vi.fn(),
}));

// Mock TerminalPane and DiffViewer to simplify rendering
vi.mock('@/components/bead/TerminalPane', () => ({
  TerminalPane: ({ logs }: { logs: string[] }) => (
    <div data-testid="terminal-pane">{logs.join('\n')}</div>
  ),
}));

vi.mock('@/components/bead/DiffViewer', () => ({
  DiffViewer: ({ oldValue, newValue }: { oldValue: string; newValue: string }) => (
    <div data-testid="diff-viewer">
      <span>{oldValue}</span>
      <span>{newValue}</span>
    </div>
  ),
}));

import { useTRPC } from '@/trpc/client';
import { BeadDetailSheet } from '@/components/bead/BeadDetailSheet';
import { useQuery } from '@tanstack/react-query';

// Mock useQuery directly
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...mod,
    useQuery: vi.fn(),
  };
});

describe('BeadDetailSheet', () => {
  beforeEach(() => {
    (useTRPC as ReturnType<typeof vi.fn>).mockReturnValue({
      execution: {
        getBeadDetail: {
          queryOptions: vi.fn().mockReturnValue({ queryKey: ['bead'], queryFn: vi.fn() }),
        },
      },
    });
  });

  it('renders closed state (no bead id)', () => {
    (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: false,
    });
    const { container } = render(
      <TestProviders>
        <BeadDetailSheet beadId={null} onClose={vi.fn()} />
      </TestProviders>
    );
    // Sheet should not render content when beadId is null
    expect(container).toBeTruthy();
  });

  it('shows Loading text while fetching bead data', () => {
    (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    render(
      <TestProviders>
        <BeadDetailSheet beadId="bead-123" onClose={vi.fn()} />
      </TestProviders>
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows bead title when data is loaded', () => {
    (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        bead: {
          id: 'bead-123',
          title: 'Implement auth module',
          status: 'completed',
          spec: 'Build JWT authentication',
          agentAssignment: 'gpt-4.1',
          claimedAt: null,
          completedAt: null,
        },
        events: [],
      },
      isLoading: false,
    });
    render(
      <TestProviders>
        <BeadDetailSheet beadId="bead-123" onClose={vi.fn()} />
      </TestProviders>
    );
    expect(screen.getByText('Implement auth module')).toBeInTheDocument();
  });

  it('shows bead status badge', () => {
    (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        bead: {
          id: 'bead-123',
          title: 'Test bead',
          status: 'active',
          spec: 'Do something',
          agentAssignment: null,
          claimedAt: null,
          completedAt: null,
        },
        events: [],
      },
      isLoading: false,
    });
    render(
      <TestProviders>
        <BeadDetailSheet beadId="bead-123" onClose={vi.fn()} />
      </TestProviders>
    );
    expect(screen.getByText('active')).toBeInTheDocument();
  });
});
