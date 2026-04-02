import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TestProviders } from '../helpers/trpc-wrapper';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'test-project-id' }),
  usePathname: () => '/projects/test-project-id/interview',
}));

// Mock tRPC client
vi.mock('@/trpc/client', () => ({ useTRPC: vi.fn() }));

// Mock scroll area (uses scrollIntoView)
beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

// Mock child components that have complex dependencies
vi.mock('@/components/interview/AmbiguityMeter', () => ({
  AmbiguityMeter: () => <div data-testid="ambiguity-meter" />,
}));

vi.mock('@/components/interview/SeedApprovalCard', () => ({
  SeedApprovalCard: ({ onApprove, onReject }: { onApprove: () => void; onReject: () => void }) => (
    <div data-testid="seed-approval-card">
      <button onClick={onApprove}>Crystallize Seed</button>
      <button onClick={onReject}>Revise</button>
    </div>
  ),
}));

vi.mock('@/components/interview/HoldoutCard', () => ({
  HoldoutCard: () => <div data-testid="holdout-card" />,
}));

// Mock react-query mutation/query hooks
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...mod, useQuery: vi.fn(), useMutation: vi.fn(), useQueryClient: vi.fn() };
});

import { useTRPC } from '@/trpc/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import InterviewPage from '@/app/projects/[id]/interview/page';

const mockMutate = vi.fn();
const mockMutateAsync = vi.fn().mockResolvedValue({});
const mockRefetch = vi.fn();
const mockInvalidateQueries = vi.fn();

function setupMocks(transcriptData: Record<string, unknown> = {}) {
  (useTRPC as ReturnType<typeof vi.fn>).mockReturnValue({
    interview: {
      getTranscript: { queryOptions: vi.fn().mockReturnValue({ queryKey: ['transcript'], queryFn: vi.fn() }) },
      getSummary: { queryOptions: vi.fn().mockReturnValue({ queryKey: ['summary'], queryFn: vi.fn() }) },
      getHoldouts: { queryOptions: vi.fn().mockReturnValue({ queryKey: ['holdouts'], queryFn: vi.fn() }) },
      startInterview: { mutationOptions: vi.fn().mockReturnValue({ mutationFn: vi.fn() }) },
      sendAnswer: { mutationOptions: vi.fn().mockReturnValue({ mutationFn: mockMutateAsync }) },
      approveSummary: { mutationOptions: vi.fn().mockReturnValue({ mutationFn: vi.fn() }) },
      rejectSummary: { mutationOptions: vi.fn().mockReturnValue({ mutationFn: vi.fn() }) },
      approveHoldout: { mutationOptions: vi.fn().mockReturnValue({ mutationFn: vi.fn() }) },
      rejectHoldout: { mutationOptions: vi.fn().mockReturnValue({ mutationFn: vi.fn() }) },
      sealHoldouts: { mutationOptions: vi.fn().mockReturnValue({ mutationFn: vi.fn() }) },
    },
  });

  (useQueryClient as ReturnType<typeof vi.fn>).mockReturnValue({
    invalidateQueries: mockInvalidateQueries,
  });

  (useQuery as ReturnType<typeof vi.fn>).mockImplementation((opts: unknown) => {
    const options = opts as { queryKey?: unknown[] };
    if (options?.queryKey?.[0] === 'transcript') {
      return {
        data: {
          status: 'active',
          transcript: [
            { question: 'What do you want to build?', userAnswer: 'A task manager', timestamp: new Date().toISOString(), perspective: 'henry-wu' },
          ],
          currentScores: { goalClarity: 0.7, constraintClarity: 0.5, successCriteriaClarity: 0.6, overall: 0.6 },
          phase: transcriptData.phase ?? 'gathering',
          suggestions: [],
          thresholdMet: false,
          interview: { mode: 'greenfield', turnCount: 1 },
          ...transcriptData,
        },
        isLoading: false,
        refetch: mockRefetch,
      };
    }
    return { data: undefined, isLoading: false, refetch: mockRefetch };
  });

  (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({
    mutate: mockMutate,
    mutateAsync: mockMutateAsync,
    isPending: false,
    isSuccess: false,
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('InterviewPage', () => {
  it('renders chat messages from transcript', () => {
    setupMocks();
    render(<TestProviders><InterviewPage /></TestProviders>);
    expect(screen.getByText('What do you want to build?')).toBeInTheDocument();
    expect(screen.getByText('A task manager')).toBeInTheDocument();
  });

  it('renders input field and send button in gathering phase', () => {
    setupMocks();
    render(<TestProviders><InterviewPage /></TestProviders>);
    expect(screen.getByRole('textbox', { name: /interview answer input/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send answer/i })).toBeInTheDocument();
  });

  it('calls sendAnswer mutation when send button is clicked', async () => {
    setupMocks();
    render(<TestProviders><InterviewPage /></TestProviders>);
    const input = screen.getByRole('textbox', { name: /interview answer input/i });
    fireEvent.change(input, { target: { value: 'My answer' } });
    fireEvent.click(screen.getByRole('button', { name: /send answer/i }));
    expect(mockMutateAsync).toHaveBeenCalled();
  });

  it('renders the ambiguity meter component', () => {
    setupMocks();
    render(<TestProviders><InterviewPage /></TestProviders>);
    expect(screen.getByTestId('ambiguity-meter')).toBeInTheDocument();
  });

  it('shows interview progress steps', () => {
    setupMocks();
    render(<TestProviders><InterviewPage /></TestProviders>);
    expect(screen.getByText('gathering')).toBeInTheDocument();
    expect(screen.getByText('reviewing')).toBeInTheDocument();
    expect(screen.getByText('approved')).toBeInTheDocument();
    expect(screen.getByText('crystallized')).toBeInTheDocument();
  });
});
