'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { TerminalPane } from './TerminalPane';
import { DiffViewer } from './DiffViewer';
import { useTRPC } from '@/trpc/client';
import { useQuery } from '@tanstack/react-query';

// Status badge variant mapping
function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
    case 'merged':
      return 'default';
    case 'failed':
      return 'destructive';
    default:
      return 'outline';
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'active': return '#f5a623';
    case 'completed': case 'merged': return '#00d4aa';
    case 'failed': return '#e5484d';
    case 'blocked': return '#8a5c00';
    default: return '#6b8399';
  }
}

function formatElapsed(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

interface BeadDetailSheetProps {
  beadId: string | null;
  onClose: () => void;
}

export function BeadDetailSheet({ beadId, onClose }: BeadDetailSheetProps) {
  const trpc = useTRPC();

  const detailQuery = useQuery({
    ...trpc.execution.getBeadDetail.queryOptions({ beadId: beadId ?? '' }),
    enabled: !!beadId,
  });

  const bead = detailQuery.data?.bead;
  const events = detailQuery.data?.events ?? [];

  // Extract log lines from events
  const logLines = events.flatMap((e) => {
    const payload = e.payload as Record<string, unknown>;
    if (payload?.logs && Array.isArray(payload.logs)) {
      return payload.logs as string[];
    }
    if (payload?.message && typeof payload.message === 'string') {
      return [payload.message];
    }
    return [];
  });

  // Extract diff data from bead_completed event
  const completionEvent = events.find((e) => e.type === 'bead_completed');
  const diffPayload = completionEvent?.payload as Record<string, unknown> | undefined;
  const diffOld = typeof diffPayload?.oldContent === 'string' ? diffPayload.oldContent : '';
  const diffNew = typeof diffPayload?.newContent === 'string' ? diffPayload.newContent : '';
  const diffFile = typeof diffPayload?.filePath === 'string' ? diffPayload.filePath : undefined;

  // Elapsed time
  const elapsedMs =
    bead?.claimedAt && bead?.completedAt
      ? new Date(bead.completedAt).getTime() - new Date(bead.claimedAt).getTime()
      : bead?.claimedAt
      ? Date.now() - new Date(bead.claimedAt).getTime()
      : null;

  return (
    <Sheet open={!!beadId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        style={{
          width: 480,
          maxWidth: '100vw',
          background: '#111820',
          borderLeft: '1px solid #1a2330',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
        }}
        showCloseButton={false}
      >
        {/* Header */}
        <SheetHeader style={{ padding: '16px 16px 12px', borderBottom: '1px solid #1a2330', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <SheetTitle style={{ color: '#c8d6e5', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                {bead?.title ?? 'Loading...'}
              </SheetTitle>
              {bead && (
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 6px',
                    background: `${statusColor(bead.status)}22`,
                    border: `1px solid ${statusColor(bead.status)}`,
                    borderRadius: 4,
                    fontSize: 11,
                    color: statusColor(bead.status),
                    fontWeight: 500,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}
                >
                  {bead.status}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#6b8399',
                fontSize: 16,
                lineHeight: 1,
                padding: 4,
              }}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Sub-header: agent model + elapsed */}
          {bead && (
            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
              {bead.agentAssignment && (
                <span style={{ fontSize: 11, color: '#6b8399' }}>
                  {bead.agentAssignment}
                </span>
              )}
              {elapsedMs != null && (
                <span style={{ fontSize: 11, color: '#6b8399' }}>
                  {formatElapsed(elapsedMs)}
                </span>
              )}
            </div>
          )}
        </SheetHeader>

        {/* Tabs: Spec | Logs | Diff */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Tabs defaultValue="spec" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <TabsList
              style={{
                background: '#0a0f14',
                borderBottom: '1px solid #1a2330',
                borderRadius: 0,
                padding: '0 12px',
                height: 40,
                flexShrink: 0,
              }}
            >
              <TabsTrigger value="spec" style={{ fontSize: 12 }}>Spec</TabsTrigger>
              <TabsTrigger value="logs" style={{ fontSize: 12 }}>Logs</TabsTrigger>
              <TabsTrigger value="diff" style={{ fontSize: 12 }}>Diff</TabsTrigger>
            </TabsList>

            {/* Spec tab */}
            <TabsContent value="spec" style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              {bead ? (
                <pre
                  style={{
                    fontFamily: 'var(--font-geist-mono, monospace)',
                    fontSize: 12,
                    color: '#c8d6e5',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    lineHeight: 1.6,
                  }}
                >
                  {bead.spec}
                </pre>
              ) : (
                <span style={{ fontSize: 12, color: '#6b8399' }}>Loading spec...</span>
              )}
            </TabsContent>

            {/* Logs tab */}
            <TabsContent value="logs" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <TerminalPane logs={logLines} />
            </TabsContent>

            {/* Diff tab */}
            <TabsContent value="diff" style={{ flex: 1, overflow: 'auto' }}>
              {diffOld || diffNew ? (
                <DiffViewer
                  oldValue={diffOld}
                  newValue={diffNew}
                  fileName={diffFile}
                />
              ) : (
                <div style={{ padding: 16, fontSize: 12, color: '#6b8399' }}>
                  No code changes recorded yet.
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
