import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock @xyflow/react since it requires canvas APIs not available in jsdom
vi.mock('@xyflow/react', () => ({
  Handle: ({ type, position }: { type: string; position: string }) => (
    <div data-testid={`handle-${type}`} data-position={position} />
  ),
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
}));

import { BeadNode } from '@/components/dag/BeadNode';

describe('BeadNode', () => {
  it('renders bead name', () => {
    render(
      <BeadNode
        data={{
          name: 'Implement auth module',
          status: 'pending',
        }}
      />
    );
    expect(screen.getByText('Implement auth module')).toBeInTheDocument();
  });

  it('renders with active status', () => {
    const { container } = render(
      <BeadNode
        data={{
          name: 'Active task',
          status: 'active',
        }}
      />
    );
    // Active status should show amber border color
    const card = container.querySelector('[style*="border"]') as HTMLElement;
    expect(card).toBeTruthy();
  });

  it('renders with completed status', () => {
    render(
      <BeadNode
        data={{
          name: 'Done task',
          status: 'completed',
        }}
      />
    );
    expect(screen.getByText('Done task')).toBeInTheDocument();
  });

  it('renders target and source handles', () => {
    render(
      <BeadNode
        data={{ name: 'Test', status: 'pending' }}
      />
    );
    expect(screen.getByTestId('handle-target')).toBeInTheDocument();
    expect(screen.getByTestId('handle-source')).toBeInTheDocument();
  });

  it('renders agent model when provided', () => {
    render(
      <BeadNode
        data={{
          name: 'Task',
          status: 'active',
          agentModel: 'gpt-4.1',
        }}
      />
    );
    expect(screen.getByText('gpt-4.1')).toBeInTheDocument();
  });
});
