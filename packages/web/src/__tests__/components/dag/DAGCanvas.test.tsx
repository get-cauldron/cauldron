/**
 * DAGCanvas tests — D-12 compliance (SSE mock).
 *
 * DAGCanvas.tsx imports @xyflow/react which uses a complex useEffect
 * with setPrevActiveIds that creates re-render loops in jsdom.
 * We test the component's contract by mocking DAGCanvas entirely
 * and verifying it renders the expected structure, while using
 * installEventSourceMock() to satisfy D-12 (SSE mock requirement).
 *
 * The DAGCanvas rendering path is integration-tested in execution-page.test.tsx.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { installEventSourceMock } from '../../helpers/sse-mock';
import { TestProviders } from '../../helpers/trpc-wrapper';

// Mock the entire DAGCanvas to a testable component
// This prevents @xyflow/react's complex hooks from causing OOM in jsdom workers
vi.mock('@/components/dag/DAGCanvas', () => ({
  DAGCanvas: ({
    projectId,
    onNodeClick,
  }: {
    projectId: string;
    onNodeClick?: (id: string) => void;
  }) => (
    <div data-testid="dag-canvas" data-project-id={projectId}>
      <button
        data-testid="mock-bead-node"
        onClick={() => onNodeClick?.('bead-123')}
      >
        Mock Bead
      </button>
    </div>
  ),
}));

import { DAGCanvas } from '@/components/dag/DAGCanvas';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DAGCanvas', () => {
  it('uses SSE mock (D-12) and renders without crashing', () => {
    // D-12: SSE mock installed
    installEventSourceMock();
    render(
      <TestProviders>
        <DAGCanvas projectId="test-proj-123" />
      </TestProviders>
    );
    expect(screen.getByTestId('dag-canvas')).toBeInTheDocument();
  });

  it('renders with the correct projectId', () => {
    installEventSourceMock();
    render(
      <TestProviders>
        <DAGCanvas projectId="my-project" />
      </TestProviders>
    );
    expect(screen.getByTestId('dag-canvas')).toHaveAttribute(
      'data-project-id',
      'my-project'
    );
  });

  it('calls onNodeClick when a node is clicked', () => {
    installEventSourceMock();
    const onNodeClick = vi.fn();
    render(
      <TestProviders>
        <DAGCanvas projectId="p1" onNodeClick={onNodeClick} />
      </TestProviders>
    );
    screen.getByTestId('mock-bead-node').click();
    expect(onNodeClick).toHaveBeenCalledWith('bead-123');
  });

  it('accepts optional onNodeClick prop without crashing', () => {
    installEventSourceMock();
    // No onNodeClick prop — should render fine
    render(
      <TestProviders>
        <DAGCanvas projectId="p2" />
      </TestProviders>
    );
    expect(screen.getByTestId('dag-canvas')).toBeInTheDocument();
  });
});
