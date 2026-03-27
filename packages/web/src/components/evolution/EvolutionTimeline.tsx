'use client';

import { Sparkles } from 'lucide-react';

export type GenerationStatus = 'active' | 'converged' | 'halted' | 'goal_met' | 'stagnating';

export interface GenerationDot {
  seedId: string;
  generation: number;
  status: GenerationStatus;
  hasLateralThinking: boolean;
}

interface EvolutionTimelineProps {
  generations: GenerationDot[];
  selectedGeneration: number | null;
  onSelectGeneration: (gen: number) => void;
}

const STATUS_DOT_COLORS: Record<GenerationStatus, string> = {
  active: '#f5a623',
  converged: '#00d4aa',
  halted: '#e5484d',
  goal_met: '#00d4aa',
  stagnating: '#8a5c00',
};

const STATUS_GLOW: Record<GenerationStatus, string> = {
  active: '0 0 8px rgba(245,166,35,0.5)',
  converged: '0 0 6px rgba(0,212,170,0.4)',
  halted: '0 0 6px rgba(229,72,77,0.4)',
  goal_met: '0 0 8px rgba(0,212,170,0.6)',
  stagnating: '0 0 4px rgba(138,92,0,0.4)',
};

// D-13, D-14: Horizontal timeline strip — 48px height per UI-SPEC layout contract
export function EvolutionTimeline({
  generations,
  selectedGeneration,
  onSelectGeneration,
}: EvolutionTimelineProps) {
  if (generations.length === 0) {
    return (
      <div
        style={{
          height: 48,
          background: '#111820',
          borderBottom: '1px solid #1a2330',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 16,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 12, color: '#6b8399', letterSpacing: '0.05em' }}>
          No evolution cycles yet
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        height: 48,
        background: '#111820',
        borderBottom: '1px solid #1a2330',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 16,
        paddingRight: 16,
        flexShrink: 0,
        overflowX: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          minWidth: 'max-content',
        }}
      >
        {generations.map((gen, index) => {
          const isSelected = selectedGeneration === gen.generation;
          const isLatest = index === generations.length - 1;
          const color = STATUS_DOT_COLORS[gen.status];
          const glow = STATUS_GLOW[gen.status];
          const dotSize = isSelected ? 20 : 16;

          return (
            <div
              key={gen.seedId}
              style={{ display: 'flex', alignItems: 'center', gap: 0, position: 'relative' }}
            >
              {/* Connector line before dot (skip for first) */}
              {index > 0 && (
                <div
                  style={{
                    width: 24,
                    height: 2,
                    background: index < generations.length - 1 ? '#3d5166' : '#1a2330',
                    flexShrink: 0,
                  }}
                />
              )}

              {/* Dot container with lateral thinking indicator above */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  position: 'relative',
                  cursor: 'pointer',
                }}
                onClick={() => onSelectGeneration(gen.generation)}
                title={`Generation ${gen.generation} — ${gen.status}`}
              >
                {/* Lateral thinking spark above dot */}
                {gen.hasLateralThinking && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -14,
                      left: '50%',
                      transform: 'translateX(-50%)',
                    }}
                  >
                    <Sparkles
                      size={10}
                      style={{ color: '#f5a623' }}
                    />
                  </div>
                )}

                {/* Generation dot */}
                <div
                  style={{
                    width: dotSize,
                    height: dotSize,
                    borderRadius: '50%',
                    background: color,
                    boxShadow: isSelected
                      ? `0 0 0 3px #00d4aa, ${glow}`
                      : glow,
                    transform: isSelected ? 'scale(1.1)' : undefined,
                    transition: 'all 150ms cubic-bezier(0.25,0.46,0.45,0.94)',
                    flexShrink: 0,
                    animation: (isLatest && gen.status === 'active') ? 'pulse 2s ease-in-out infinite' : undefined,
                  }}
                />

                {/* Generation label below dot */}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: isSelected ? '#c8d6e5' : '#6b8399',
                    lineHeight: 1.4,
                    marginTop: 2,
                    userSelect: 'none',
                    position: 'absolute',
                    bottom: -16,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {gen.generation}
                </span>
              </div>

              {/* Connector line after last dot if there's a next */}
              {index === generations.length - 1 && generations.length > 1 && null}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
