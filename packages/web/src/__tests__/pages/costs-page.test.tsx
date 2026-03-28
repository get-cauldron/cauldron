import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { installEventSourceMock } from '../helpers/sse-mock';
import { TestProviders } from '../helpers/trpc-wrapper';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'costs-project-id' }),
  usePathname: () => '/projects/costs-project-id/costs',
}));

vi.mock('@/trpc/client', () => ({ useTRPC: vi.fn() }));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...mod, useQuery: vi.fn() };
});

import { useTRPC } from '@/trpc/client';
import { useQuery } from '@tanstack/react-query';
import CostsPage from '@/app/projects/[id]/costs/page';

const mockSummary = {
  totalCostCents: '1234',
  totalTokens: '500000',
  callCount: '42',
};

const mockByModel = [
  { model: 'gpt-4.1', totalCostCents: '800', totalTokens: '300000', callCount: '20' },
  { model: 'claude-opus-4-5', totalCostCents: '434', totalTokens: '200000', callCount: '22' },
];

const mockByStage = [
  { stage: 'execution', totalCostCents: '900', totalTokens: '350000', callCount: '30' },
  { stage: 'interview', totalCostCents: '334', totalTokens: '150000', callCount: '12' },
];

function setupMocks(opts: { empty?: boolean; loading?: boolean } = {}) {
  (useTRPC as ReturnType<typeof vi.fn>).mockReturnValue({
    costs: {
      getProjectSummary: { queryOptions: vi.fn().mockReturnValue({ queryKey: ['summary'], queryFn: vi.fn() }) },
      getByModel: { queryOptions: vi.fn().mockReturnValue({ queryKey: ['byModel'], queryFn: vi.fn() }) },
      getByStage: { queryOptions: vi.fn().mockReturnValue({ queryKey: ['byStage'], queryFn: vi.fn() }) },
      getByCycle: { queryOptions: vi.fn().mockReturnValue({ queryKey: ['byCycle'], queryFn: vi.fn() }) },
      getTopBeads: { queryOptions: vi.fn().mockReturnValue({ queryKey: ['topBeads'], queryFn: vi.fn() }) },
    },
  });

  (useQuery as ReturnType<typeof vi.fn>).mockImplementation((opts: unknown) => {
    const options = opts as { queryKey?: unknown[] };
    const key = options?.queryKey?.[0];

    if (loading) return { data: undefined, isLoading: true };

    if (key === 'summary') {
      return { data: opts?.empty ? { totalCostCents: '0', totalTokens: '0', callCount: '0' } : mockSummary, isLoading: false };
    }
    if (key === 'byModel') return { data: opts?.empty ? [] : mockByModel, isLoading: false };
    if (key === 'byStage') return { data: opts?.empty ? [] : mockByStage, isLoading: false };
    if (key === 'byCycle') return { data: [], isLoading: false };
    if (key === 'topBeads') return { data: [], isLoading: false };
    return { data: undefined, isLoading: false };
  });
}

// Fix closure bug in setupMocks - rewrite cleanly
function setupMocksClean(variant: 'data' | 'empty' | 'loading' = 'data') {
  (useTRPC as ReturnType<typeof vi.fn>).mockReturnValue({
    costs: {
      getProjectSummary: { queryOptions: vi.fn().mockReturnValue({ queryKey: ['summary'], queryFn: vi.fn() }) },
      getByModel: { queryOptions: vi.fn().mockReturnValue({ queryKey: ['byModel'], queryFn: vi.fn() }) },
      getByStage: { queryOptions: vi.fn().mockReturnValue({ queryKey: ['byStage'], queryFn: vi.fn() }) },
      getByCycle: { queryOptions: vi.fn().mockReturnValue({ queryKey: ['byCycle'], queryFn: vi.fn() }) },
      getTopBeads: { queryOptions: vi.fn().mockReturnValue({ queryKey: ['topBeads'], queryFn: vi.fn() }) },
    },
  });

  (useQuery as ReturnType<typeof vi.fn>).mockImplementation((queryOpts: unknown) => {
    const options = queryOpts as { queryKey?: unknown[] };
    const key = options?.queryKey?.[0];

    if (variant === 'loading') return { data: undefined, isLoading: true };

    if (key === 'summary') {
      return {
        data: variant === 'empty'
          ? { totalCostCents: '0', totalTokens: '0', callCount: '0' }
          : mockSummary,
        isLoading: false,
      };
    }
    if (key === 'byModel') return { data: variant === 'empty' ? [] : mockByModel, isLoading: false };
    if (key === 'byStage') return { data: variant === 'empty' ? [] : mockByStage, isLoading: false };
    if (key === 'byCycle') return { data: [], isLoading: false };
    if (key === 'topBeads') return { data: [], isLoading: false };
    return { data: undefined, isLoading: false };
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

describe('CostsPage', () => {
  it('renders loading state', () => {
    setupMocksClean('loading');
    render(<TestProviders><CostsPage /></TestProviders>);
    expect(screen.getByText('Loading cost data...')).toBeInTheDocument();
  });

  it('renders empty state when no usage data', () => {
    setupMocksClean('empty');
    render(<TestProviders><CostsPage /></TestProviders>);
    expect(screen.getByText('No token usage yet')).toBeInTheDocument();
    expect(screen.getByText('Cost data appears once execution begins.')).toBeInTheDocument();
  });

  it('renders total cost when data is present', () => {
    setupMocksClean('data');
    render(<TestProviders><CostsPage /></TestProviders>);
    // totalCostCents = 1234 → $12.34
    expect(screen.getByText('$12.34')).toBeInTheDocument();
  });

  it('renders total calls count', () => {
    setupMocksClean('data');
    render(<TestProviders><CostsPage /></TestProviders>);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders COST BY MODEL section with model names', () => {
    setupMocksClean('data');
    render(<TestProviders><CostsPage /></TestProviders>);
    expect(screen.getByText('COST BY MODEL')).toBeInTheDocument();
    expect(screen.getByText('gpt-4.1')).toBeInTheDocument();
    expect(screen.getByText('claude-opus-4-5')).toBeInTheDocument();
  });

  it('renders COST BY PIPELINE STAGE section with stage names', () => {
    setupMocksClean('data');
    render(<TestProviders><CostsPage /></TestProviders>);
    expect(screen.getByText('COST BY PIPELINE STAGE')).toBeInTheDocument();
    expect(screen.getByText('execution')).toBeInTheDocument();
    expect(screen.getByText('interview')).toBeInTheDocument();
  });
});
