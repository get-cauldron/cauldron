import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { installEventSourceMock } from '../helpers/sse-mock';
import { TestProviders } from '../helpers/trpc-wrapper';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'settings-project-id' }),
  usePathname: () => '/projects/settings-project-id/settings',
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/trpc/client', () => ({ useTRPC: vi.fn() }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...mod, useQuery: vi.fn(), useMutation: vi.fn(), useQueryClient: vi.fn() };
});

import { useTRPC } from '@/trpc/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import SettingsPage from '@/app/projects/[id]/settings/page';

const mockProject = {
  id: 'settings-project-id',
  name: 'My Cauldron Project',
  settings: {
    budgetLimitCents: 5000,
    maxConcurrentBeads: 4,
    models: {
      interview: ['gpt-4.1'],
      execution: ['gpt-4.1-mini'],
    },
  },
};

function setupMocks(projectData = mockProject) {
  (useTRPC as ReturnType<typeof vi.fn>).mockReturnValue({
    projects: {
      byId: {
        queryOptions: vi.fn().mockReturnValue({ queryKey: ['project'], queryFn: vi.fn() }),
        queryFilter: vi.fn().mockReturnValue({ queryKey: ['project'] }),
      },
      updateSettings: { mutationOptions: vi.fn().mockReturnValue({ mutationFn: vi.fn() }) },
      archive: { mutationOptions: vi.fn().mockReturnValue({ mutationFn: vi.fn() }) },
    },
  });

  (useQueryClient as ReturnType<typeof vi.fn>).mockReturnValue({
    invalidateQueries: vi.fn(),
  });

  (useQuery as ReturnType<typeof vi.fn>).mockImplementation((opts: unknown) => {
    const options = opts as { queryKey?: unknown[] };
    const key = options?.queryKey?.[0];
    if (key === 'project') return { data: projectData, isLoading: false };
    return { data: undefined, isLoading: false };
  });

  (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
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

describe('SettingsPage', () => {
  it('renders budget configuration section', () => {
    setupMocks();
    render(<TestProviders><SettingsPage /></TestProviders>);
    expect(screen.getByText('BUDGET')).toBeInTheDocument();
    expect(screen.getByText('Budget Limit (cents)')).toBeInTheDocument();
    expect(screen.getByText('Max Concurrent Beads')).toBeInTheDocument();
  });

  it('renders model overrides section with pipeline stage labels', () => {
    setupMocks();
    render(<TestProviders><SettingsPage /></TestProviders>);
    expect(screen.getByText('MODEL OVERRIDES')).toBeInTheDocument();
    expect(screen.getByText('INTERVIEW')).toBeInTheDocument();
    expect(screen.getByText('EXECUTION')).toBeInTheDocument();
    expect(screen.getByText('DECOMPOSITION')).toBeInTheDocument();
  });

  it('renders save settings button', () => {
    setupMocks();
    render(<TestProviders><SettingsPage /></TestProviders>);
    expect(screen.getByRole('button', { name: /save settings/i })).toBeInTheDocument();
  });

  it('renders danger zone with delete project button', () => {
    setupMocks();
    render(<TestProviders><SettingsPage /></TestProviders>);
    expect(screen.getByText('DANGER ZONE')).toBeInTheDocument();
    // "Delete Project" appears as both section heading and button text
    const deleteMatches = screen.getAllByText('Delete Project');
    expect(deleteMatches.length).toBeGreaterThanOrEqual(1);
  });

  it('opens confirmation dialog when delete project button is clicked', async () => {
    setupMocks();
    render(<TestProviders><SettingsPage /></TestProviders>);
    // The trigger button has aria-haspopup="dialog"
    const triggerBtn = screen.getByRole('button', { name: 'Delete Project' });
    await act(async () => { fireEvent.click(triggerBtn); });
    // Confirmation dialog should appear
    expect(screen.getByText('Delete project?')).toBeInTheDocument();
    expect(screen.getByText(/Permanently delete/)).toBeInTheDocument();
  });

  it('shows project name in the delete confirmation dialog', async () => {
    setupMocks();
    render(<TestProviders><SettingsPage /></TestProviders>);
    const triggerBtn = screen.getByRole('button', { name: 'Delete Project' });
    await act(async () => { fireEvent.click(triggerBtn); });
    expect(screen.getByText('My Cauldron Project')).toBeInTheDocument();
  });

  it('calls save mutation when save settings button is clicked', () => {
    const mockMutate = vi.fn();
    (useTRPC as ReturnType<typeof vi.fn>).mockReturnValue({
      projects: {
        byId: {
          queryOptions: vi.fn().mockReturnValue({ queryKey: ['project'], queryFn: vi.fn() }),
          queryFilter: vi.fn().mockReturnValue({ queryKey: ['project'] }),
        },
        updateSettings: { mutationOptions: vi.fn().mockReturnValue({ mutationFn: vi.fn() }) },
        archive: { mutationOptions: vi.fn().mockReturnValue({ mutationFn: vi.fn() }) },
      },
    });
    (useQueryClient as ReturnType<typeof vi.fn>).mockReturnValue({ invalidateQueries: vi.fn() });
    (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({ data: mockProject, isLoading: false });
    (useMutation as ReturnType<typeof vi.fn>).mockImplementation((opts: unknown) => {
      // First call is updateSettings, second is archive
      return { mutate: mockMutate, mutateAsync: vi.fn(), isPending: false };
    });

    render(<TestProviders><SettingsPage /></TestProviders>);
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));
    expect(mockMutate).toHaveBeenCalled();
  });

  it('renders loading state', () => {
    (useTRPC as ReturnType<typeof vi.fn>).mockReturnValue({
      projects: {
        byId: {
          queryOptions: vi.fn().mockReturnValue({ queryKey: ['project'], queryFn: vi.fn() }),
          queryFilter: vi.fn().mockReturnValue({ queryKey: ['project'] }),
        },
        updateSettings: { mutationOptions: vi.fn().mockReturnValue({ mutationFn: vi.fn() }) },
        archive: { mutationOptions: vi.fn().mockReturnValue({ mutationFn: vi.fn() }) },
      },
    });
    (useQueryClient as ReturnType<typeof vi.fn>).mockReturnValue({ invalidateQueries: vi.fn() });
    (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({ data: undefined, isLoading: true });
    (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });

    render(<TestProviders><SettingsPage /></TestProviders>);
    expect(screen.getByText('Loading settings...')).toBeInTheDocument();
  });
});
