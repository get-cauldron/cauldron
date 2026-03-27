'use client';

import * as React from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

// Perspective color map per D-03
const PERSPECTIVE_COLORS: Record<string, string> = {
  researcher: '#2563eb',
  simplifier: '#059669',
  architect: '#7c3aed',
  'breadth-keeper': '#d97706',
  'seed-closer': '#00d4aa',
};

export interface ChatBubbleProps {
  role: 'system' | 'user';
  content: string;
  perspective?: string;
  timestamp?: string;
}

export function ChatBubble({ role, content, perspective, timestamp }: ChatBubbleProps) {
  const isSystem = role === 'system';
  const perspectiveColor = perspective ? (PERSPECTIVE_COLORS[perspective] ?? '#6b8399') : null;
  const perspectiveInitial = perspective ? perspective.charAt(0).toUpperCase() : null;

  return (
    <div
      className={`flex gap-3 ${isSystem ? 'justify-start' : 'justify-end'}`}
      style={{ padding: '8px 0' }}
    >
      {/* Left-side perspective avatar for system messages */}
      {isSystem && perspective && perspectiveColor && perspectiveInitial && (
        <div className="flex-shrink-0 relative group">
          <Avatar
            size="sm"
            className="cursor-default"
            style={{ width: 24, height: 24 }}
            title={perspective}
          >
            <AvatarFallback
              style={{
                backgroundColor: perspectiveColor,
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 600,
                width: 24,
                height: 24,
              }}
            >
              {perspectiveInitial}
            </AvatarFallback>
          </Avatar>
          {/* Tooltip on hover */}
          <span
            className="absolute left-7 top-0 z-10 hidden group-hover:block whitespace-nowrap rounded px-2 py-1 text-xs pointer-events-none"
            style={{
              backgroundColor: '#1a2330',
              color: '#c8d6e5',
              border: '1px solid #3d5166',
              fontSize: '11px',
            }}
            aria-hidden="true"
          >
            {perspective}
          </span>
        </div>
      )}

      {/* Message bubble */}
      <div
        className={`max-w-[75%] rounded-lg px-4 py-3 ${
          isSystem ? 'rounded-tl-none' : 'rounded-tr-none'
        }`}
        style={{
          backgroundColor: isSystem ? '#111820' : '#1a2330',
          color: '#c8d6e5',
          fontSize: '14px',
          fontWeight: 400,
          lineHeight: 1.5,
          fontFamily: 'var(--font-geist-sans, sans-serif)',
          wordBreak: 'break-word',
        }}
      >
        <p style={{ margin: 0 }}>{content}</p>
        {timestamp && (
          <p
            className="mt-1"
            style={{
              fontSize: '11px',
              color: '#6b8399',
              margin: '4px 0 0',
            }}
          >
            {timestamp}
          </p>
        )}
      </div>

      {/* Right-side placeholder for user messages (alignment) */}
      {!isSystem && <div style={{ width: 24, flexShrink: 0 }} />}
    </div>
  );
}
