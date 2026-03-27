import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HoldoutCard } from '@/components/interview/HoldoutCard';

const mockScenario = {
  id: 'holdout-001',
  name: 'User authentication flow',
  description: 'Tests that users can log in and out',
  testCode: 'expect(user.isAuthenticated).toBe(true);',
  status: 'pending' as const,
};

describe('HoldoutCard', () => {
  it('renders scenario name', () => {
    render(
      <HoldoutCard
        scenario={mockScenario}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByText('User authentication flow')).toBeInTheDocument();
  });

  it('renders pending status badge', () => {
    render(
      <HoldoutCard
        scenario={mockScenario}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('renders approved status badge for approved scenario', () => {
    render(
      <HoldoutCard
        scenario={{ ...mockScenario, status: 'approved' }}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByText('approved')).toBeInTheDocument();
  });

  it('expands to show description when collapsed trigger is clicked', () => {
    render(
      <HoldoutCard
        scenario={mockScenario}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    // Click the collapse trigger to expand
    const trigger = screen.getByRole('button', { name: /expand scenario/i });
    fireEvent.click(trigger);
    expect(screen.getByText('Tests that users can log in and out')).toBeInTheDocument();
  });

  it('shows approve and reject buttons when expanded', () => {
    render(
      <HoldoutCard
        scenario={mockScenario}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    const trigger = screen.getByRole('button', { name: /expand scenario/i });
    fireEvent.click(trigger);
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Reject')).toBeInTheDocument();
  });

  it('calls onApprove with scenario id when approve clicked', () => {
    const onApprove = vi.fn();
    render(
      <HoldoutCard
        scenario={mockScenario}
        onApprove={onApprove}
        onReject={vi.fn()}
      />
    );
    // Expand first
    fireEvent.click(screen.getByRole('button', { name: /expand scenario/i }));
    fireEvent.click(screen.getByText('Approve'));
    expect(onApprove).toHaveBeenCalledWith('holdout-001');
  });

  it('calls onReject with scenario id when reject clicked', () => {
    const onReject = vi.fn();
    render(
      <HoldoutCard
        scenario={mockScenario}
        onApprove={vi.fn()}
        onReject={onReject}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /expand scenario/i }));
    fireEvent.click(screen.getByText('Reject'));
    expect(onReject).toHaveBeenCalledWith('holdout-001');
  });
});
