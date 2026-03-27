import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConvergencePanel } from '@/components/evolution/ConvergencePanel';
import type { ConvergenceSignalRow, LateralThinkingActivation } from '@/components/evolution/ConvergencePanel';

const mockSignals: ConvergenceSignalRow[] = [
  { type: 'ontology_stability', triggered: true, value: 0.9, threshold: 0.8 },
  { type: 'stagnation', triggered: false, value: 0.2, threshold: 0.5 },
];

const mockLateralThinking: LateralThinkingActivation[] = [
  {
    persona: 'contrarian',
    analysis: 'Consider a completely different architecture',
    timestamp: '2026-03-01T10:00:00Z',
  },
];

describe('ConvergencePanel', () => {
  it('renders CONVERGENCE SIGNALS heading', () => {
    render(
      <ConvergencePanel
        signals={mockSignals}
        lateralThinkingActivations={[]}
        isExpanded={true}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText('CONVERGENCE SIGNALS')).toBeInTheDocument();
  });

  it('renders signal names when expanded', () => {
    render(
      <ConvergencePanel
        signals={mockSignals}
        lateralThinkingActivations={[]}
        isExpanded={true}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText('Ontology Stability')).toBeInTheDocument();
    expect(screen.getByText('Stagnation')).toBeInTheDocument();
  });

  it('shows trigger count summary when collapsed', () => {
    render(
      <ConvergencePanel
        signals={mockSignals}
        lateralThinkingActivations={[]}
        isExpanded={false}
        onToggle={vi.fn()}
      />
    );
    // 1 of 2 signals triggered
    expect(screen.getByText('1/2 signals triggered')).toBeInTheDocument();
  });

  it('calls onToggle when header is clicked', () => {
    const onToggle = vi.fn();
    render(
      <ConvergencePanel
        signals={mockSignals}
        lateralThinkingActivations={[]}
        isExpanded={true}
        onToggle={onToggle}
      />
    );
    // CollapsibleTrigger is the header button
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders lateral thinking activations when expanded', () => {
    render(
      <ConvergencePanel
        signals={mockSignals}
        lateralThinkingActivations={mockLateralThinking}
        isExpanded={true}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText('LATERAL THINKING')).toBeInTheDocument();
    expect(screen.getByText('contrarian')).toBeInTheDocument();
    expect(
      screen.getByText('Consider a completely different architecture')
    ).toBeInTheDocument();
  });

  it('shows default signal stubs when no signals provided', () => {
    render(
      <ConvergencePanel
        signals={[]}
        lateralThinkingActivations={[]}
        isExpanded={true}
        onToggle={vi.fn()}
      />
    );
    // Should render 5 default signal rows
    expect(screen.getByText('Ontology Stability')).toBeInTheDocument();
    expect(screen.getByText('Stagnation')).toBeInTheDocument();
    expect(screen.getByText('Oscillation')).toBeInTheDocument();
    expect(screen.getByText('Repetitive Feedback')).toBeInTheDocument();
    expect(screen.getByText('Hard Cap (30 gen)')).toBeInTheDocument();
  });
});
