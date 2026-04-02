import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatBubble } from '@/components/interview/ChatBubble';

describe('ChatBubble', () => {
  it('renders system message content', () => {
    render(<ChatBubble role="system" content="What do you want to build?" />);
    expect(screen.getByText('What do you want to build?')).toBeInTheDocument();
  });

  it('renders user message content', () => {
    render(<ChatBubble role="user" content="I want a task manager" />);
    expect(screen.getByText('I want a task manager')).toBeInTheDocument();
  });

  it('renders timestamp when provided', () => {
    render(<ChatBubble role="system" content="Hello" timestamp="10:30 AM" />);
    expect(screen.getByText('10:30 AM')).toBeInTheDocument();
  });

  it('renders perspective avatar for system messages with perspective', () => {
    render(
      <ChatBubble
        role="system"
        content="Think about constraints"
        perspective="henry-wu"
      />
    );
    // Avatar shows uppercase initial
    expect(screen.getByTitle('henry-wu')).toBeInTheDocument();
  });

  it('does not render perspective avatar for user messages', () => {
    render(
      <ChatBubble role="user" content="My answer" perspective="henry-wu" />
    );
    // User messages don't show perspective avatars
    expect(screen.queryByTitle('henry-wu')).not.toBeInTheDocument();
  });

  it('applies justify-end class for user messages', () => {
    const { container } = render(
      <ChatBubble role="user" content="User message" />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('justify-end');
  });

  it('applies justify-start class for system messages', () => {
    const { container } = render(
      <ChatBubble role="system" content="System message" />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('justify-start');
  });
});
