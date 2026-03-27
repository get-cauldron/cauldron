'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Clock, Play, Check, X, Lock } from 'lucide-react';
import { Progress, ProgressTrack, ProgressIndicator } from '@/components/ui/progress';
import type { BeadStatus } from '@/hooks/useBeadStatus';

interface BeadNodeData {
  name: string;
  status: BeadStatus;
  agentModel?: string;
  elapsedMs?: number;
  iterations?: number;
  maxIterations?: number;
}

// Status to border color mapping per D-08 and UI-SPEC
const STATUS_COLORS: Record<BeadStatus, string> = {
  pending: '#3d5166',
  claimed: '#3d5166',
  active: '#f5a623',
  completed: '#00d4aa',
  failed: '#e5484d',
  blocked: '#8a5c00',
  merged: '#00d4aa',
  skipped: '#3d5166',
};

function StatusIcon({ status }: { status: BeadStatus }) {
  const iconClass = 'w-3.5 h-3.5 shrink-0';
  switch (status) {
    case 'active':
      return <Play className={iconClass} style={{ color: '#f5a623' }} />;
    case 'completed':
    case 'merged':
      return <Check className={iconClass} style={{ color: '#00d4aa' }} />;
    case 'failed':
      return <X className={iconClass} style={{ color: '#e5484d' }} />;
    case 'blocked':
      return <Lock className={iconClass} style={{ color: '#8a5c00' }} />;
    default:
      return <Clock className={iconClass} style={{ color: '#6b8399' }} />;
  }
}

function formatElapsed(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function BeadNodeComponent({ data }: { data: BeadNodeData }) {
  const { name, status, agentModel, elapsedMs, iterations, maxIterations } = data;
  const borderColor = STATUS_COLORS[status] ?? '#3d5166';
  const isActive = status === 'active';
  const progressPct =
    iterations != null && maxIterations != null && maxIterations > 0
      ? Math.round((iterations / maxIterations) * 100)
      : null;

  return (
    <div
      style={{
        width: 240,
        minHeight: 80,
        background: '#111820',
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        padding: '10px 12px',
        boxShadow: isActive
          ? '0 0 8px rgba(245,166,35,0.4)'
          : undefined,
        filter: isActive ? 'drop-shadow(0 0 8px rgba(245,166,35,0.4))' : undefined,
        animation: isActive ? 'beadActivePulse 400ms ease-in-out infinite alternate' : undefined,
        position: 'relative',
      }}
    >
      {/* Target handle at top */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#3d5166', border: 'none', width: 8, height: 8 }}
      />

      {/* Header row: status icon + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <StatusIcon status={status} />
        <span
          style={{
            maxWidth: 200,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 13,
            fontWeight: 500,
            color: '#c8d6e5',
          }}
        >
          {name}
        </span>
      </div>

      {/* Sub-info: agent model + elapsed time */}
      {(agentModel || elapsedMs != null) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          {agentModel && (
            <span style={{ fontSize: 10, color: '#6b8399', letterSpacing: '0.05em' }}>
              {agentModel}
            </span>
          )}
          {elapsedMs != null && (
            <span style={{ fontSize: 10, color: '#6b8399' }}>
              {formatElapsed(elapsedMs)}
            </span>
          )}
        </div>
      )}

      {/* Mini progress bar */}
      {progressPct != null && (
        <Progress value={progressPct} className="mt-1">
          <ProgressTrack className="h-1">
            <ProgressIndicator style={{ background: '#f5a623' }} />
          </ProgressTrack>
        </Progress>
      )}

      {/* Source handle at bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#3d5166', border: 'none', width: 8, height: 8 }}
      />
    </div>
  );
}

export const BeadNode = memo(BeadNodeComponent);
export type { BeadNodeData };
