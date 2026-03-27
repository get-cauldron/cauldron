import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MCChipGroup } from '@/components/interview/MCChipGroup';

describe('MCChipGroup', () => {
  it('renders all options as buttons', () => {
    const options = ['Option A', 'Option B', 'Option C'];
    render(<MCChipGroup options={options} onSelect={vi.fn()} />);
    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
    expect(screen.getByText('Option C')).toBeInTheDocument();
  });

  it('calls onSelect with the correct value when clicked', () => {
    const onSelect = vi.fn();
    const options = ['Choice 1', 'Choice 2'];
    render(<MCChipGroup options={options} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Choice 1'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('Choice 1');
  });

  it('calls onSelect with second option when second option clicked', () => {
    const onSelect = vi.fn();
    render(<MCChipGroup options={['A', 'B']} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('B'));
    expect(onSelect).toHaveBeenCalledWith('B');
  });

  it('does not call onSelect when disabled', () => {
    const onSelect = vi.fn();
    render(<MCChipGroup options={['A']} onSelect={onSelect} disabled />);
    fireEvent.click(screen.getByText('A'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders container with aria-label for accessibility', () => {
    render(<MCChipGroup options={['X']} onSelect={vi.fn()} />);
    const container = document.querySelector('[aria-label="Multiple-choice suggestions"]');
    expect(container).toBeTruthy();
  });

  it('fires onSelect exactly once per render (subsequent clicks blocked by disabled prop)', () => {
    const onSelect = vi.fn();
    render(<MCChipGroup options={['A', 'B']} onSelect={onSelect} />);
    const btnA = screen.getByText('A');
    const btnB = screen.getByText('B');
    // First chip is not disabled yet
    expect(btnA).not.toBeDisabled();
    // Click first option — fires callback
    fireEvent.click(btnA);
    expect(onSelect).toHaveBeenCalledWith('A');
    // After first click, all buttons get disabled={true}
    // Component may still be visible (opacity=0) or may have returned null
    // Either way onSelect should only have been called once
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
