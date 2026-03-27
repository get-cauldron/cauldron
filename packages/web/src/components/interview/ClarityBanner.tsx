'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';

export interface ClarityBannerProps {
  visible: boolean;
  onCrystallize: () => void;
  onKeepRefining: () => void;
}

export function ClarityBanner({ visible, onCrystallize, onKeepRefining }: ClarityBannerProps) {
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        backgroundColor: '#111820',
        borderLeft: '4px solid #00d4aa',
        borderRadius: '0 8px 8px 0',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        flexDirection: 'column',
      }}
    >
      <p
        style={{
          fontSize: '14px',
          color: '#c8d6e5',
          lineHeight: 1.5,
          margin: 0,
          fontFamily: 'var(--font-geist-sans, sans-serif)',
        }}
      >
        Your answers have reached sufficient clarity. You can continue refining or crystallize the
        seed now.
      </p>
      <div className="flex gap-3">
        <Button
          onClick={onCrystallize}
          style={{
            backgroundColor: '#00d4aa',
            color: '#0a0f14',
            fontWeight: 600,
            minHeight: 44,
          }}
        >
          Crystallize Seed
        </Button>
        <Button
          variant="outline"
          onClick={onKeepRefining}
          style={{ minHeight: 44 }}
        >
          Keep Refining
        </Button>
      </div>
    </div>
  );
}
