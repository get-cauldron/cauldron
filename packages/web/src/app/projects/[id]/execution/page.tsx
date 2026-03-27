'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { DAGCanvas } from '@/components/dag/DAGCanvas';
import { BeadDetailSheet } from '@/components/bead/BeadDetailSheet';
import { useEscalation } from '@/hooks/useEscalation';
import { useTRPC } from '@/trpc/client';
import { useMutation } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

// D-22: Escalation response options
const ESCALATION_ACTIONS = [
  { action: 'retry' as const, label: 'Retry', description: 'Re-run the failed operation with the same parameters.' },
  { action: 'skip' as const, label: 'Skip Bead', description: 'Mark this bead as skipped and continue with other work.' },
  { action: 'guidance' as const, label: 'Provide Guidance', description: 'Send additional context to help the agent proceed.' },
  { action: 'abort' as const, label: 'Abort Cycle', description: 'Halt the current execution cycle entirely.' },
];

interface EscalationDialogProps {
  projectId: string;
  escalation: { eventId: string; type: string; message: string; beadId: string | null };
  onClose: () => void;
}

function EscalationDialog({ projectId, escalation, onClose }: EscalationDialogProps) {
  const trpc = useTRPC();
  const [selectedAction, setSelectedAction] = useState<'retry' | 'skip' | 'guidance' | 'abort' | null>(null);
  const [guidance, setGuidance] = useState('');

  const respondMutation = useMutation(
    trpc.execution.respondToEscalation.mutationOptions({
      onSuccess: () => {
        onClose();
      },
    })
  );

  const handleSubmit = () => {
    if (!selectedAction) return;
    respondMutation.mutate({
      projectId,
      beadId: escalation.beadId ?? undefined,
      action: selectedAction,
      guidance: guidance || undefined,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg" style={{ background: '#111820', border: '1px solid #1a2330' }}>
        <DialogHeader>
          <DialogTitle style={{ color: '#f5a623' }}>Agent Needs Guidance</DialogTitle>
          <DialogDescription style={{ color: '#6b8399' }}>
            {escalation.message}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-2">
          {ESCALATION_ACTIONS.map(({ action, label, description }) => (
            <button
              key={action}
              onClick={() => setSelectedAction(action)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                padding: '10px 12px',
                background: selectedAction === action ? 'rgba(0, 212, 170, 0.1)' : '#0a0f14',
                border: `1px solid ${selectedAction === action ? '#00d4aa' : '#1a2330'}`,
                borderRadius: 6,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: '#c8d6e5' }}>{label}</span>
              <span style={{ fontSize: 11, color: '#6b8399' }}>{description}</span>
            </button>
          ))}
        </div>

        {(selectedAction === 'guidance' || selectedAction) && (
          <Textarea
            placeholder="Additional context for the agent (optional)..."
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
            rows={3}
            style={{ background: '#0a0f14', border: '1px solid #1a2330', color: '#c8d6e5', fontSize: 13 }}
          />
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            style={{ borderColor: '#1a2330', color: '#6b8399' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedAction || respondMutation.isPending}
            style={{
              background: '#00d4aa',
              color: '#0a0f14',
              opacity: !selectedAction ? 0.5 : 1,
            }}
          >
            {respondMutation.isPending ? 'Sending...' : 'Send Response'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ExecutionPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [selectedBeadId, setSelectedBeadId] = useState<string | null>(null);
  const [escalationAcknowledged, setEscalationAcknowledged] = useState(false);

  const { activeEscalation, resolveEscalation } = useEscalation(projectId);

  const showEscalationDialog = activeEscalation && !escalationAcknowledged;

  function handleEscalationClose() {
    if (activeEscalation) {
      resolveEscalation(activeEscalation.eventId);
    }
    setEscalationAcknowledged(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0a0f14' }}>
      {/* Stub: Evolution timeline placeholder — Plan 08-06 Task 2 will wire the real EvolutionTimeline component */}
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
          Generation timeline
        </span>
      </div>

      {/* DAG Canvas fills remaining height */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <DAGCanvas
          projectId={projectId}
          onNodeClick={(beadId) => setSelectedBeadId(beadId)}
        />
      </div>

      {/* Bead detail slide-out panel */}
      <BeadDetailSheet
        beadId={selectedBeadId}
        onClose={() => setSelectedBeadId(null)}
      />

      {/* Escalation dialog — shown when an active escalation event arrives */}
      {showEscalationDialog && (
        <EscalationDialog
          projectId={projectId}
          escalation={activeEscalation}
          onClose={handleEscalationClose}
        />
      )}
    </div>
  );
}
