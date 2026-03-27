'use client';

import * as React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';

export type HoldoutStatus = 'pending' | 'approved' | 'rejected';

export interface HoldoutScenario {
  id: string;
  name: string;
  description: string;
  testCode: string;
  status: HoldoutStatus;
}

export interface HoldoutCardProps {
  scenario: HoldoutScenario;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

const STATUS_BADGE_COLORS: Record<HoldoutStatus, string> = {
  pending: '#3d5166',
  approved: '#00d4aa',
  rejected: '#e5484d',
};

const STATUS_TEXT_COLORS: Record<HoldoutStatus, string> = {
  pending: '#c8d6e5',
  approved: '#0a0f14',
  rejected: '#ffffff',
};

export function HoldoutCard({ scenario, onApprove, onReject }: HoldoutCardProps) {
  const [open, setOpen] = React.useState(false);
  const badgeBg = STATUS_BADGE_COLORS[scenario.status];
  const badgeText = STATUS_TEXT_COLORS[scenario.status];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card
        className="w-full"
        style={{ backgroundColor: '#111820', border: '1px solid #1a2330' }}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <CollapsibleTrigger
              className="flex items-center gap-3 flex-1 text-left"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
              aria-label={`${open ? 'Collapse' : 'Expand'} scenario: ${scenario.name}`}
            >
              {/* Expand/collapse chevron */}
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                style={{
                  transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 150ms',
                  flexShrink: 0,
                  color: '#6b8399',
                }}
              >
                <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <CardTitle
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#c8d6e5',
                  margin: 0,
                  fontFamily: 'var(--font-geist-sans, sans-serif)',
                }}
              >
                {scenario.name}
              </CardTitle>
            </CollapsibleTrigger>

            {/* Status badge */}
            <span
              style={{
                backgroundColor: badgeBg,
                color: badgeText,
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                borderRadius: '9999px',
                padding: '2px 8px',
                flexShrink: 0,
              }}
            >
              {scenario.status}
            </span>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="flex flex-col gap-3">
            {/* Description */}
            {scenario.description && (
              <p style={{ fontSize: 14, color: '#c8d6e5', lineHeight: 1.5, margin: 0 }}>
                {scenario.description}
              </p>
            )}

            {/* Test code block */}
            {scenario.testCode && (
              <pre
                style={{
                  backgroundColor: '#0a0f14',
                  color: '#c8d6e5',
                  fontFamily: 'var(--font-geist-mono, monospace)',
                  fontSize: '13px',
                  lineHeight: 1.6,
                  padding: '12px 16px',
                  borderRadius: '8px',
                  overflowX: 'auto',
                  margin: 0,
                  border: '1px solid #1a2330',
                }}
              >
                <code>{scenario.testCode}</code>
              </pre>
            )}
          </CardContent>

          <CardFooter className="flex gap-3">
            <Button
              onClick={() => onApprove(scenario.id)}
              disabled={scenario.status === 'approved'}
              style={{
                backgroundColor: scenario.status === 'approved' ? '#1a2330' : '#00d4aa',
                color: scenario.status === 'approved' ? '#6b8399' : '#0a0f14',
                fontWeight: 600,
                minHeight: 44,
              }}
            >
              {scenario.status === 'approved' ? 'Approved' : 'Approve'}
            </Button>
            <Button
              variant="outline"
              onClick={() => onReject(scenario.id)}
              disabled={scenario.status === 'rejected'}
              style={{
                borderColor: scenario.status === 'rejected' ? '#e5484d' : undefined,
                color: scenario.status === 'rejected' ? '#e5484d' : undefined,
                minHeight: 44,
              }}
            >
              {scenario.status === 'rejected' ? 'Rejected' : 'Reject'}
            </Button>
          </CardFooter>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
