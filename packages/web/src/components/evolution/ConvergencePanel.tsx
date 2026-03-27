'use client';

import { CheckCircle2, Circle, ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';

export interface ConvergenceSignalRow {
  type: string;
  triggered: boolean;
  value: number;
  threshold: number;
}

export interface LateralThinkingActivation {
  persona: string;
  analysis: string;
  timestamp: string;
}

interface ConvergencePanelProps {
  signals: ConvergenceSignalRow[];
  lateralThinkingActivations: LateralThinkingActivation[];
  isExpanded: boolean;
  onToggle: () => void;
}

const SIGNAL_LABELS: Record<string, string> = {
  ontology_stability: 'Ontology Stability',
  stagnation: 'Stagnation',
  oscillation: 'Oscillation',
  repetitive_feedback: 'Repetitive Feedback',
  hard_cap: 'Hard Cap (30 gen)',
};

// Persona badge colors
const PERSONA_COLORS: Record<string, string> = {
  contrarian: '#e5484d',
  hacker: '#f5a623',
  simplifier: '#00d4aa',
  researcher: '#2563eb',
  architect: '#7c3aed',
};

const PERSONA_BG: Record<string, string> = {
  contrarian: 'rgba(229,72,77,0.15)',
  hacker: 'rgba(245,166,35,0.15)',
  simplifier: 'rgba(0,212,170,0.15)',
  researcher: 'rgba(37,99,235,0.15)',
  architect: 'rgba(124,58,237,0.15)',
};

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts;
  }
}

export function ConvergencePanel({
  signals,
  lateralThinkingActivations,
  isExpanded,
  onToggle,
}: ConvergencePanelProps) {
  const triggeredCount = signals.filter(s => s.triggered).length;
  const totalCount = signals.length;

  // Health indicator based on triggered count
  const healthColor =
    triggeredCount >= 1 ? '#00d4aa' :
    triggeredCount === 0 && totalCount > 0 ? '#f5a623' :
    '#6b8399';

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div
        style={{
          background: '#111820',
          border: '1px solid #1a2330',
          borderRadius: 8,
        }}
      >
        {/* Header */}
        <CollapsibleTrigger
          style={{
            width: '100%',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            background: 'transparent',
            border: 'none',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: '#c8d6e5',
                letterSpacing: '0.08em',
                lineHeight: 1.3,
              }}
            >
              CONVERGENCE SIGNALS
            </span>
            <div
              style={{
                height: 1,
                background: '#1a2330',
                width: '100%',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!isExpanded && (
              <span style={{ fontSize: 12, fontWeight: 600, color: healthColor }}>
                {triggeredCount}/{totalCount} signals triggered
              </span>
            )}
            {isExpanded ? (
              <ChevronUp size={16} style={{ color: '#6b8399' }} />
            ) : (
              <ChevronDown size={16} style={{ color: '#6b8399' }} />
            )}
          </div>
        </CollapsibleTrigger>

        {/* Expanded content */}
        <CollapsibleContent>
          <div style={{ padding: '0 16px 16px' }}>
            {/* Signal rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {signals.length === 0 ? (
                ['ontology_stability', 'stagnation', 'oscillation', 'repetitive_feedback', 'hard_cap'].map(type => (
                  <SignalRow
                    key={type}
                    signal={{ type, triggered: false, value: 0, threshold: 1 }}
                  />
                ))
              ) : (
                signals.map(signal => (
                  <SignalRow key={signal.type} signal={signal} />
                ))
              )}
            </div>

            {/* Lateral thinking section */}
            {lateralThinkingActivations.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: '#c8d6e5',
                    letterSpacing: '0.08em',
                    lineHeight: 1.3,
                    marginBottom: 4,
                  }}
                >
                  LATERAL THINKING
                </div>
                <div
                  style={{
                    height: 1,
                    background: '#1a2330',
                    marginBottom: 10,
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lateralThinkingActivations.map((activation, i) => (
                    <div
                      key={i}
                      style={{
                        background: '#0a0f14',
                        border: '1px solid #1a2330',
                        borderRadius: 6,
                        padding: '8px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: PERSONA_COLORS[activation.persona] ?? '#c8d6e5',
                            background: PERSONA_BG[activation.persona] ?? 'rgba(255,255,255,0.05)',
                            padding: '2px 8px',
                            borderRadius: 10,
                            textTransform: 'capitalize',
                            border: `1px solid ${PERSONA_COLORS[activation.persona] ?? '#3d5166'}`,
                          }}
                        >
                          {activation.persona}
                        </span>
                        <span style={{ fontSize: 12, color: '#6b8399' }}>
                          {formatTimestamp(activation.timestamp)}
                        </span>
                      </div>
                      <p
                        style={{
                          fontSize: 14,
                          color: '#c8d6e5',
                          lineHeight: 1.5,
                          margin: 0,
                        }}
                      >
                        {activation.analysis}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function SignalRow({ signal }: { signal: ConvergenceSignalRow }) {
  const label = SIGNAL_LABELS[signal.type] ?? signal.type;
  const ratio = signal.threshold > 0 ? Math.min(signal.value / signal.threshold, 1) : 0;
  const barColor = signal.triggered ? '#00d4aa' : '#3d5166';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {signal.triggered ? (
            <CheckCircle2 size={14} style={{ color: '#00d4aa', flexShrink: 0 }} />
          ) : (
            <Circle size={14} style={{ color: '#3d5166', flexShrink: 0 }} />
          )}
          <span
            style={{
              fontSize: 14,
              color: signal.triggered ? '#c8d6e5' : '#6b8399',
            }}
          >
            {label}
          </span>
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b8399' }}>
          {signal.value.toFixed(2)} / {signal.threshold.toFixed(2)}
        </span>
      </div>
      {/* Progress bar */}
      <div
        style={{
          height: 3,
          background: '#1a2330',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${ratio * 100}%`,
            background: barColor,
            borderRadius: 2,
            transition: 'width 400ms cubic-bezier(0.25,0.46,0.45,0.94)',
          }}
        />
      </div>
    </div>
  );
}
