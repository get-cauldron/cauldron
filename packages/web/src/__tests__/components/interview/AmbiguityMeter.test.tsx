import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AmbiguityMeter } from '@/components/interview/AmbiguityMeter';

const defaultDimensions = {
  goal: 0.7,
  constraint: 0.5,
  successCriteria: 0.6,
};

describe('AmbiguityMeter', () => {
  it('renders CLARITY SCORE label', () => {
    render(
      <AmbiguityMeter
        overallClarity={0.6}
        dimensions={defaultDimensions}
        isGreenfield={true}
      />
    );
    expect(screen.getByText('CLARITY SCORE')).toBeInTheDocument();
  });

  it('renders overall clarity percentage', () => {
    render(
      <AmbiguityMeter
        overallClarity={0.75}
        dimensions={defaultDimensions}
        isGreenfield={true}
      />
    );
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('renders dimension labels for greenfield mode', () => {
    render(
      <AmbiguityMeter
        overallClarity={0.5}
        dimensions={defaultDimensions}
        isGreenfield={true}
      />
    );
    // Each label appears once in the dimension list (getByText would fail if multiple matches)
    // Use getAllByText since the label also appears in Progress sr-only label
    expect(screen.getAllByText('GOAL').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('CONSTRAINTS').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('SUCCESS CRITERIA').length).toBeGreaterThanOrEqual(1);
  });

  it('does not render CONTEXT dimension in greenfield mode', () => {
    render(
      <AmbiguityMeter
        overallClarity={0.5}
        dimensions={defaultDimensions}
        isGreenfield={true}
      />
    );
    expect(screen.queryByText('CONTEXT')).not.toBeInTheDocument();
  });

  it('renders CONTEXT dimension in brownfield mode when context score provided', () => {
    render(
      <AmbiguityMeter
        overallClarity={0.5}
        dimensions={{ ...defaultDimensions, context: 0.4 }}
        isGreenfield={false}
      />
    );
    expect(screen.getAllByText('CONTEXT').length).toBeGreaterThanOrEqual(1);
  });

  it('renders dimension percentage values', () => {
    render(
      <AmbiguityMeter
        overallClarity={0.5}
        dimensions={{ goal: 0.8, constraint: 0.5, successCriteria: 0.3 }}
        isGreenfield={true}
      />
    );
    // getAllByText because percentages may appear in both SVG and dimension rows
    expect(screen.getAllByText('80%').length).toBeGreaterThanOrEqual(1);
    // 50% also appears as overall (50%), so use getAllByText
    expect(screen.getAllByText('50%').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('30%').length).toBeGreaterThanOrEqual(1);
  });

  it('renders SVG with aria-label for clarity score', () => {
    render(
      <AmbiguityMeter
        overallClarity={0.9}
        dimensions={defaultDimensions}
        isGreenfield={true}
      />
    );
    const svg = screen.getByRole('img');
    expect(svg).toHaveAttribute('aria-label', 'Clarity score: 90%');
  });
});
