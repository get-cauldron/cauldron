import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/projects/test-id/interview'),
}));

// Mock next/link to render an anchor
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    'aria-label': ariaLabel,
    title,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    'aria-label'?: string;
    title?: string;
    [key: string]: unknown;
  }) => (
    <a href={href} aria-label={ariaLabel} title={title}>
      {children}
    </a>
  ),
}));

import { NavSidebar } from '@/components/shell/NavSidebar';

describe('NavSidebar', () => {
  it('renders navigation landmark', () => {
    render(<NavSidebar projectId="test-id" />);
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('renders Projects nav link', () => {
    render(<NavSidebar projectId="test-id" />);
    expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
  });

  it('renders Interview nav link when projectId provided', () => {
    render(<NavSidebar projectId="test-id" />);
    expect(screen.getByRole('link', { name: 'Interview' })).toBeInTheDocument();
  });

  it('renders Execution nav link when projectId provided', () => {
    render(<NavSidebar projectId="test-id" />);
    expect(screen.getByRole('link', { name: 'Execution' })).toBeInTheDocument();
  });

  it('renders Evolution nav link when projectId provided', () => {
    render(<NavSidebar projectId="test-id" />);
    expect(screen.getByRole('link', { name: 'Evolution' })).toBeInTheDocument();
  });

  it('renders Costs nav link when projectId provided', () => {
    render(<NavSidebar projectId="test-id" />);
    expect(screen.getByRole('link', { name: 'Costs' })).toBeInTheDocument();
  });

  it('renders Settings nav link when projectId provided', () => {
    render(<NavSidebar projectId="test-id" />);
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  it('does not render project nav items when no projectId', () => {
    render(<NavSidebar />);
    expect(screen.queryByRole('link', { name: 'Interview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Execution' })).not.toBeInTheDocument();
  });

  it('renders Interview link with correct href', () => {
    render(<NavSidebar projectId="test-id" />);
    const interviewLink = screen.getByRole('link', { name: 'Interview' });
    expect(interviewLink).toHaveAttribute('href', '/projects/test-id/interview');
  });

  it('renders collapse/expand toggle button', () => {
    render(<NavSidebar projectId="test-id" />);
    expect(
      screen.getByRole('button', { name: /collapse sidebar|expand sidebar/i })
    ).toBeInTheDocument();
  });
});
