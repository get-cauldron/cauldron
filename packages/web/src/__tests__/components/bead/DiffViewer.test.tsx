import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock react-diff-viewer-continued since it may not work in jsdom
vi.mock('react-diff-viewer-continued', () => ({
  default: ({
    oldValue,
    newValue,
  }: {
    oldValue: string;
    newValue: string;
  }) => (
    <div data-testid="react-diff-viewer">
      <div data-testid="old-content">{oldValue}</div>
      <div data-testid="new-content">{newValue}</div>
    </div>
  ),
}));

import { DiffViewer } from '@/components/bead/DiffViewer';

describe('DiffViewer', () => {
  it('renders without fileName', () => {
    render(
      <DiffViewer
        oldValue="const x = 1;"
        newValue="const x = 2;"
      />
    );
    expect(screen.getByTestId('react-diff-viewer')).toBeInTheDocument();
  });

  it('displays old content', () => {
    render(
      <DiffViewer
        oldValue="old line"
        newValue="new line"
      />
    );
    expect(screen.getByTestId('old-content')).toHaveTextContent('old line');
  });

  it('displays new content', () => {
    render(
      <DiffViewer
        oldValue="old line"
        newValue="new line"
      />
    );
    expect(screen.getByTestId('new-content')).toHaveTextContent('new line');
  });

  it('renders fileName when provided', () => {
    render(
      <DiffViewer
        oldValue="original"
        newValue="modified"
        fileName="src/auth.ts"
      />
    );
    expect(screen.getByText('src/auth.ts')).toBeInTheDocument();
  });

  it('does not render file path label when fileName not provided', () => {
    render(
      <DiffViewer
        oldValue="original"
        newValue="modified"
      />
    );
    expect(screen.queryByText('src/auth.ts')).not.toBeInTheDocument();
  });
});
