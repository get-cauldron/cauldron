'use client';
import { useState, useCallback } from 'react';
import { useSSE } from './useSSE.js';
import type { SSEEvent } from '@/lib/sse-event-types';
import { BEAD_STATUS_EVENTS } from '@/lib/sse-event-types';

export type BeadStatus =
  | 'pending'
  | 'claimed'
  | 'active'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'merged'
  | 'skipped';

interface BeadState {
  beadId: string;
  status: BeadStatus;
  lastEvent: SSEEvent;
}

// Map event types to bead status
function eventToStatus(eventType: string): BeadStatus | null {
  switch (eventType) {
    case 'bead_dispatched':
      return 'pending';
    case 'bead_claimed':
      return 'active';
    case 'bead_completed':
      return 'completed';
    case 'bead_failed':
      return 'failed';
    case 'bead_skipped':
      return 'skipped';
    case 'bead_merged':
      return 'merged';
    default:
      return null;
  }
}

export function useBeadStatus(projectId: string | null) {
  const [beads, setBeads] = useState<Map<string, BeadState>>(new Map());

  const handleEvent = useCallback((event: SSEEvent) => {
    if (!BEAD_STATUS_EVENTS.includes(event.type as (typeof BEAD_STATUS_EVENTS)[number])) return;
    if (!event.beadId) return;

    const status = eventToStatus(event.type);
    if (!status) return;

    setBeads(prev => {
      const next = new Map(prev);
      next.set(event.beadId!, { beadId: event.beadId!, status, lastEvent: event });
      return next;
    });
  }, []);

  const sseState = useSSE<SSEEvent>(
    projectId ? `/api/events/${projectId}` : null,
    handleEvent
  );

  return { beads, ...sseState };
}
