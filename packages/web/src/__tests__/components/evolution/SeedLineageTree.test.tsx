import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SeedLineageTree } from '@/components/evolution/SeedLineageTree';

const mockSeeds = [
  {
    id: 'seed-1',
    parentId: null,
    generation: 1,
    goal: 'Build a task manager',
    acceptanceCriteria: ['Users can create tasks'],
    status: 'crystallized',
    createdAt: '2026-03-01T10:00:00Z',
  },
  {
    id: 'seed-2',
    parentId: 'seed-1',
    generation: 2,
    goal: 'Build an enhanced task manager with notifications',
    acceptanceCriteria: ['Users can create tasks', 'Users receive notifications'],
    status: 'crystallized',
    createdAt: '2026-03-02T10:00:00Z',
  },
];

describe('SeedLineageTree', () => {
  it('renders empty state when no seeds', () => {
    render(
      <SeedLineageTree seeds={[]} selectedSeedId={null} onSelectSeed={vi.fn()} />
    );
    expect(screen.getByText('No evolution cycles yet')).toBeInTheDocument();
  });

  it('renders seed goals', () => {
    render(
      <SeedLineageTree
        seeds={mockSeeds}
        selectedSeedId={null}
        onSelectSeed={vi.fn()}
      />
    );
    expect(screen.getByText('Build a task manager')).toBeInTheDocument();
    expect(
      screen.getByText('Build an enhanced task manager with notifications')
    ).toBeInTheDocument();
  });

  it('renders generation badges', () => {
    render(
      <SeedLineageTree
        seeds={mockSeeds}
        selectedSeedId={null}
        onSelectSeed={vi.fn()}
      />
    );
    expect(screen.getByText('Gen 1')).toBeInTheDocument();
    expect(screen.getByText('Gen 2')).toBeInTheDocument();
  });

  it('calls onSelectSeed with correct id when seed is clicked', () => {
    const onSelectSeed = vi.fn();
    render(
      <SeedLineageTree
        seeds={mockSeeds}
        selectedSeedId={null}
        onSelectSeed={onSelectSeed}
      />
    );
    fireEvent.click(screen.getByText('Build a task manager'));
    expect(onSelectSeed).toHaveBeenCalledWith('seed-1');
  });

  it('renders without crashing when seed is selected', () => {
    // Just verify the component renders with a selectedSeedId without throwing
    const { container } = render(
      <SeedLineageTree
        seeds={mockSeeds}
        selectedSeedId="seed-1"
        onSelectSeed={vi.fn()}
      />
    );
    // Both seeds should still be rendered
    expect(container).toBeInTheDocument();
    expect(screen.getByText('Build a task manager')).toBeInTheDocument();
    expect(screen.getByText('Build an enhanced task manager with notifications')).toBeInTheDocument();
  });

  it('shows "changed" badge when goal differs from parent', () => {
    render(
      <SeedLineageTree
        seeds={mockSeeds}
        selectedSeedId={null}
        onSelectSeed={vi.fn()}
      />
    );
    // Seed 2 has different goal from seed 1 — "changed" badge should appear
    expect(screen.getByText('changed')).toBeInTheDocument();
  });
});
