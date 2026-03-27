'use client';
import { useState, useCallback } from 'react';
import { useSSE } from './useSSE.js';
import type { SSEEvent } from '@/lib/sse-event-types';
import { ESCALATION_EVENTS } from '@/lib/sse-event-types';

export interface EscalationNotification {
  eventId: string;
  type: string;
  message: string;
  beadId: string | null;
  timestamp: string;
  resolved: boolean;
}

export function useEscalation(projectId: string | null) {
  const [escalations, setEscalations] = useState<EscalationNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const handleEvent = useCallback((event: SSEEvent) => {
    if (!ESCALATION_EVENTS.includes(event.type as (typeof ESCALATION_EVENTS)[number])) return;

    const notification: EscalationNotification = {
      eventId: event.id,
      type: event.type,
      message:
        (event.payload as Record<string, string> | null)?.reason ??
        (event.payload as Record<string, string> | null)?.message ??
        'Cauldron needs your guidance to continue.',
      beadId: event.beadId,
      timestamp: event.createdAt,
      resolved: false,
    };

    setEscalations(prev => [notification, ...prev]);
    setUnreadCount(prev => prev + 1);
  }, []);

  const resolveEscalation = useCallback((eventId: string) => {
    setEscalations(prev =>
      prev.map(e => (e.eventId === eventId ? { ...e, resolved: true } : e))
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const sseState = useSSE<SSEEvent>(
    projectId ? `/api/events/${projectId}` : null,
    handleEvent,
    { enabled: !!projectId }
  );

  const activeEscalation = escalations.find(e => !e.resolved) ?? null;

  return {
    escalations,
    activeEscalation,
    unreadCount,
    resolveEscalation,
    ...sseState,
  };
}
