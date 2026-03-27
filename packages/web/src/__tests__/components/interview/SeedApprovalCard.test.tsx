import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SeedApprovalCard } from '@/components/interview/SeedApprovalCard';

const mockSummary = {
  goal: 'Build a task manager application',
  constraints: ['TypeScript only', 'No external auth'],
  acceptanceCriteria: ['Users can create tasks', 'Tasks can be marked complete'],
};

describe('SeedApprovalCard', () => {
  it('renders SEED SUMMARY heading', () => {
    render(
      <SeedApprovalCard
        summary={mockSummary}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByText('SEED SUMMARY')).toBeInTheDocument();
  });

  it('displays the goal text', () => {
    render(
      <SeedApprovalCard
        summary={mockSummary}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByText('Build a task manager application')).toBeInTheDocument();
  });

  it('displays constraints', () => {
    render(
      <SeedApprovalCard
        summary={mockSummary}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByText('TypeScript only')).toBeInTheDocument();
    expect(screen.getByText('No external auth')).toBeInTheDocument();
  });

  it('displays acceptance criteria', () => {
    render(
      <SeedApprovalCard
        summary={mockSummary}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByText('Users can create tasks')).toBeInTheDocument();
    expect(screen.getByText('Tasks can be marked complete')).toBeInTheDocument();
  });

  it('calls onApprove when Crystallize Seed button is clicked', () => {
    const onApprove = vi.fn();
    render(
      <SeedApprovalCard
        summary={mockSummary}
        onApprove={onApprove}
        onReject={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Crystallize Seed'));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('calls onReject when Revise button is clicked', () => {
    const onReject = vi.fn();
    render(
      <SeedApprovalCard
        summary={mockSummary}
        onApprove={vi.fn()}
        onReject={onReject}
      />
    );
    fireEvent.click(screen.getByText('Revise'));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('renders skeleton placeholders when isLoading is true', () => {
    const { container } = render(
      <SeedApprovalCard
        summary={mockSummary}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        isLoading={true}
      />
    );
    // Crystallize Seed and Revise buttons should not be visible
    expect(screen.queryByText('Crystallize Seed')).not.toBeInTheDocument();
    expect(screen.queryByText('Revise')).not.toBeInTheDocument();
  });
});
