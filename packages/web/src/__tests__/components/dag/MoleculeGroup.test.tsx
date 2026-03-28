import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock @xyflow/react
vi.mock('@xyflow/react', () => ({
  Handle: ({ type, position }: { type: string; position: string }) => (
    <div data-testid={`handle-${type}`} data-position={position} />
  ),
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
}));

import { MoleculeGroup } from '@/components/dag/MoleculeGroup';

describe('MoleculeGroup', () => {
  it('renders molecule name', () => {
    render(
      <MoleculeGroup
        data={{ name: 'Authentication Module', childCount: 3 }}
      />
    );
    expect(screen.getByText('Authentication Module')).toBeInTheDocument();
  });

  it('renders target and source handles', () => {
    render(
      <MoleculeGroup
        data={{ name: 'Module A' }}
      />
    );
    expect(screen.getByTestId('handle-target')).toBeInTheDocument();
    expect(screen.getByTestId('handle-source')).toBeInTheDocument();
  });

  it('is open by default (shows collapsible content)', () => {
    render(
      <MoleculeGroup
        data={{ name: 'Module B', childCount: 2 }}
      />
    );
    // When collapsed, the bead count badge is shown — when open, it's hidden
    // Badge with "2 beads" should not be visible when open
    expect(screen.queryByText('2 beads')).not.toBeInTheDocument();
  });

  it('toggles collapsed state on trigger click', () => {
    render(
      <MoleculeGroup
        data={{ name: 'Module C', childCount: 5 }}
      />
    );
    // Click the collapsible trigger to collapse
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);
    // Now collapsed — child count badge should appear
    expect(screen.getByText('5 beads')).toBeInTheDocument();
  });
});
