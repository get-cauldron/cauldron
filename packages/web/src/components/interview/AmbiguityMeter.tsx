'use client';

import * as React from 'react';
import { Progress, ProgressTrack, ProgressIndicator, ProgressLabel } from '@/components/ui/progress';

export interface AmbiguityMeterProps {
  overallClarity: number; // 0-1
  dimensions: {
    goal: number;
    constraint: number;
    successCriteria: number;
    context?: number;
  };
  isGreenfield: boolean;
}

function getGaugeColor(clarity: number): string {
  if (clarity < 0.5) return '#d97706'; // amber — low clarity
  if (clarity >= 0.8) return '#00d4aa'; // teal — high clarity
  // Blend: interpolate between amber and teal
  const t = (clarity - 0.5) / 0.3; // 0 at 0.5, 1 at 0.8
  // Simple linear blend
  const r = Math.round(217 + t * (0 - 217));
  const g = Math.round(119 + t * (212 - 119));
  const b = Math.round(6 + t * (170 - 6));
  return `rgb(${r}, ${g}, ${b})`;
}

const CIRCLE_RADIUS = 52;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

export function AmbiguityMeter({ overallClarity, dimensions, isGreenfield }: AmbiguityMeterProps) {
  const strokeColor = getGaugeColor(overallClarity);
  const percentage = Math.round(overallClarity * 100);

  // Stroke dash: filled portion of circle
  const dashOffset = CIRCLE_CIRCUMFERENCE * (1 - overallClarity);

  const dimensionRows = [
    { label: 'GOAL', value: dimensions.goal },
    { label: 'CONSTRAINTS', value: dimensions.constraint },
    { label: 'SUCCESS CRITERIA', value: dimensions.successCriteria },
    ...(!isGreenfield && dimensions.context !== undefined
      ? [{ label: 'CONTEXT', value: dimensions.context }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Circular gauge */}
      <div className="flex flex-col items-center gap-2">
        <svg width="128" height="128" viewBox="0 0 128 128" role="img" aria-label={`Clarity score: ${percentage}%`}>
          {/* Background circle */}
          <circle
            cx="64"
            cy="64"
            r={CIRCLE_RADIUS}
            fill="none"
            stroke="#1a2330"
            strokeWidth="10"
          />
          {/* Progress arc — starts at 12 o'clock (-90 degrees) */}
          <circle
            cx="64"
            cy="64"
            r={CIRCLE_RADIUS}
            fill="none"
            stroke={strokeColor}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRCLE_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 64 64)"
            style={{ transition: 'stroke-dashoffset 400ms cubic-bezier(0.25, 0.46, 0.45, 0.94), stroke 400ms' }}
          />
          {/* Center percentage — Display typography (20px, 600 weight) */}
          <text
            x="64"
            y="64"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#c8d6e5"
            fontSize="20"
            fontWeight="600"
            fontFamily="var(--font-geist-sans, sans-serif)"
          >
            {percentage}%
          </text>
        </svg>

        <p
          style={{
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '0.08em',
            color: '#6b8399',
            textTransform: 'uppercase',
            margin: 0,
          }}
        >
          CLARITY SCORE
        </p>
      </div>

      {/* Dimension breakdown */}
      <div className="flex flex-col gap-3">
        {dimensionRows.map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  color: '#6b8399',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-geist-sans, sans-serif)',
                }}
              >
                {label}
              </span>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#c8d6e5',
                  fontFamily: 'var(--font-geist-sans, sans-serif)',
                }}
              >
                {Math.round(value * 100)}%
              </span>
            </div>
            <Progress value={value * 100}>
              <ProgressLabel className="sr-only">{label}</ProgressLabel>
              <ProgressTrack>
                <ProgressIndicator
                  style={{ backgroundColor: '#00d4aa' }}
                />
              </ProgressTrack>
            </Progress>
          </div>
        ))}
      </div>
    </div>
  );
}
