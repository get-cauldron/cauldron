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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

export interface SeedSummaryData {
  goal: string;
  constraints: unknown[];
  acceptanceCriteria: unknown[];
  ontologySchema?: {
    entities: Array<{
      name: string;
      attributes: string[];
      relations: Array<{ to: string; type: string }>;
    }>;
  };
  evaluationPrinciples?: unknown[];
  exitConditions?: unknown;
}

export interface SeedApprovalCardProps {
  summary: SeedSummaryData;
  onApprove: () => void;
  onReject: () => void;
  isLoading?: boolean;
}

function renderList(items: unknown[]): React.ReactNode {
  if (!items || items.length === 0) return <p style={{ color: '#6b8399', fontSize: 14 }}>None specified</p>;
  return (
    <ul style={{ paddingLeft: 16, margin: 0 }}>
      {items.map((item, idx) => (
        <li key={idx} style={{ fontSize: 14, color: '#c8d6e5', lineHeight: 1.5, marginBottom: 4 }}>
          {typeof item === 'string' ? item : JSON.stringify(item)}
        </li>
      ))}
    </ul>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <>
      <p
        style={{
          fontSize: '12px',
          fontWeight: 600,
          letterSpacing: '0.08em',
          color: '#6b8399',
          textTransform: 'uppercase' as const,
          margin: '0 0 6px',
          fontFamily: 'var(--font-geist-sans, sans-serif)',
        }}
      >
        {children}
      </p>
    </>
  );
}

export function SeedApprovalCard({ summary, onApprove, onReject, isLoading = false }: SeedApprovalCardProps) {
  return (
    <Card
      className="w-full"
      style={{ backgroundColor: '#111820', border: '1px solid #1a2330' }}
    >
      <CardHeader>
        <CardTitle
          style={{
            fontSize: '16px',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#c8d6e5',
            fontFamily: 'var(--font-geist-sans, sans-serif)',
          }}
        >
          SEED SUMMARY
        </CardTitle>
        <Separator style={{ backgroundColor: '#1a2330' }} />
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Goal */}
        <div>
          <SectionHeader>Goal</SectionHeader>
          <p style={{ fontSize: 14, color: '#c8d6e5', lineHeight: 1.5, margin: 0 }}>
            {summary.goal}
          </p>
        </div>

        {/* Constraints */}
        <div>
          <SectionHeader>Constraints</SectionHeader>
          {renderList(summary.constraints)}
        </div>

        {/* Acceptance Criteria */}
        <div>
          <SectionHeader>Acceptance Criteria</SectionHeader>
          {renderList(summary.acceptanceCriteria)}
        </div>

        {/* Evaluation Principles */}
        {summary.evaluationPrinciples && summary.evaluationPrinciples.length > 0 && (
          <div>
            <SectionHeader>Evaluation Principles</SectionHeader>
            {renderList(summary.evaluationPrinciples)}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-3">
        {isLoading ? (
          <>
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-24" />
          </>
        ) : (
          <>
            <Button
              onClick={onApprove}
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
              onClick={onReject}
              style={{ minHeight: 44 }}
            >
              Revise
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
