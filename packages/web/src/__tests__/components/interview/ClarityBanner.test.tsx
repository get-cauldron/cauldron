import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClarityBanner } from '@/components/interview/ClarityBanner';

describe('ClarityBanner', () => {
  it('renders nothing when visible is false', () => {
    const { container } = render(
      <ClarityBanner
        visible={false}
        onCrystallize={vi.fn()}
        onKeepRefining={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the banner when visible is true', () => {
    render(
      <ClarityBanner
        visible={true}
        onCrystallize={vi.fn()}
        onKeepRefining={vi.fn()}
      />
    );
    expect(
      screen.getByText(/Your answers have reached sufficient clarity/i)
    ).toBeInTheDocument();
  });

  it('renders Crystallize Seed and Keep Refining buttons', () => {
    render(
      <ClarityBanner
        visible={true}
        onCrystallize={vi.fn()}
        onKeepRefining={vi.fn()}
      />
    );
    expect(screen.getByText('Crystallize Seed')).toBeInTheDocument();
    expect(screen.getByText('Keep Refining')).toBeInTheDocument();
  });

  it('calls onCrystallize when Crystallize Seed button clicked', () => {
    const onCrystallize = vi.fn();
    render(
      <ClarityBanner
        visible={true}
        onCrystallize={onCrystallize}
        onKeepRefining={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Crystallize Seed'));
    expect(onCrystallize).toHaveBeenCalledTimes(1);
  });

  it('calls onKeepRefining when Keep Refining button clicked', () => {
    const onKeepRefining = vi.fn();
    render(
      <ClarityBanner
        visible={true}
        onCrystallize={vi.fn()}
        onKeepRefining={onKeepRefining}
      />
    );
    fireEvent.click(screen.getByText('Keep Refining'));
    expect(onKeepRefining).toHaveBeenCalledTimes(1);
  });

  it('has role=status and aria-live=polite for accessibility', () => {
    render(
      <ClarityBanner
        visible={true}
        onCrystallize={vi.fn()}
        onKeepRefining={vi.fn()}
      />
    );
    const statusEl = screen.getByRole('status');
    expect(statusEl).toBeInTheDocument();
    expect(statusEl).toHaveAttribute('aria-live', 'polite');
  });
});
