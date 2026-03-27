import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TerminalPane } from '@/components/bead/TerminalPane';

// scrollIntoView is not implemented in jsdom — mock it
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

describe('TerminalPane', () => {
  it('renders "No logs yet." when logs array is empty', () => {
    render(<TerminalPane logs={[]} />);
    expect(screen.getByText('No logs yet.')).toBeInTheDocument();
  });

  it('renders log lines when logs are provided', () => {
    render(<TerminalPane logs={['Line 1', 'Line 2', 'Line 3']} />);
    // Log lines are rendered via dangerouslySetInnerHTML with ANSI conversion
    expect(document.body.innerHTML).toContain('Line 1');
    expect(document.body.innerHTML).toContain('Line 2');
    expect(document.body.innerHTML).toContain('Line 3');
  });

  it('does not render "No logs yet." when logs are present', () => {
    render(<TerminalPane logs={['Some log output']} />);
    expect(screen.queryByText('No logs yet.')).not.toBeInTheDocument();
  });

  it('does not show resume auto-scroll button initially', () => {
    // Resume auto-scroll button only appears when user has scrolled up
    // In test environment, scroll events are synthetic — initially not paused
    render(<TerminalPane logs={['log line']} />);
    expect(screen.queryByText('Resume auto-scroll')).not.toBeInTheDocument();
  });

  it('renders multiple log lines in order', () => {
    const logs = ['First', 'Second', 'Third'];
    render(<TerminalPane logs={logs} />);
    const html = document.body.innerHTML;
    const firstIdx = html.indexOf('First');
    const secondIdx = html.indexOf('Second');
    const thirdIdx = html.indexOf('Third');
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });
});
