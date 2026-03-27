'use client';

import { useEffect, useRef, useState } from 'react';
import AnsiToHtml from 'ansi-to-html';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';

const converter = new AnsiToHtml({
  fg: '#c8d6e5',
  bg: '#0a0f14',
  newline: false,
  escapeXML: true,
  stream: false,
});

interface TerminalPaneProps {
  logs: string[];
}

export function TerminalPane({ logs }: TerminalPaneProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);

  // Keep isPausedRef in sync with state for scroll handler closure
  isPausedRef.current = isPaused;

  // Auto-scroll to bottom on new logs when not paused
  useEffect(() => {
    if (!isPaused && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isPaused]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isScrolledUp = distanceFromBottom > 40;
    setIsPaused(isScrolledUp);
  }

  function resumeScroll() {
    setIsPaused(false);
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          background: '#0a0f14',
          fontFamily: 'var(--font-geist-mono, "JetBrains Mono", monospace)',
          fontSize: 12,
          lineHeight: 1.6,
          padding: '8px 12px',
        }}
      >
        {logs.length === 0 ? (
          <span style={{ color: '#6b8399' }}>No logs yet.</span>
        ) : (
          logs.map((line, i) => (
            <div
              key={i}
              dangerouslySetInnerHTML={{ __html: converter.toHtml(line) }}
              style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Resume auto-scroll button */}
      {isPaused && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
          }}
        >
          <Button
            size="sm"
            onClick={resumeScroll}
            style={{
              background: '#1a2330',
              border: '1px solid #3d5166',
              color: '#c8d6e5',
              fontSize: 11,
              height: 28,
            }}
          >
            Resume auto-scroll
          </Button>
        </div>
      )}
    </div>
  );
}
