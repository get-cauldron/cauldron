'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { EscalationBanner } from '@/components/shell/EscalationBanner';
import { useEscalation } from '@/hooks/useEscalation';
import { NavSidebar } from '@/components/shell/NavSidebar';

interface ProjectShellClientProps {
  projectId: string;
  children: React.ReactNode;
}

/**
 * D-21 Escalation Wiring:
 * - useEscalation(projectId) subscribes to SSE and tracks escalation events
 * - When activeEscalation is non-null, renders EscalationBanner above project content
 * - When a new escalation arrives, fires a toast (sonner) notification
 * - Passes unreadCount to NavSidebar so it can render a badge on the project nav icon
 */
export function ProjectShellClient({ projectId, children }: ProjectShellClientProps) {
  const { activeEscalation, unreadCount, resolveEscalation, escalations } =
    useEscalation(projectId);

  // Fire toast (sonner) when a new escalation arrives
  useEffect(() => {
    const unresolved = escalations.filter((e) => !e.resolved);
    const latest = unresolved[0];
    if (latest) {
      toast(`Cauldron needs your attention: ${latest.message}`, {
        duration: 8000,
        style: {
          background: '#111820',
          border: '1px solid #f5a623',
          color: '#c8d6e5',
        },
      });
    }
    // Trigger only when escalations array length changes (new escalation added)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escalations.length]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Escalation banner — amber left border, dismissable per D-21 */}
      <EscalationBanner
        visible={activeEscalation !== null}
        message={activeEscalation?.message}
        onDismiss={
          activeEscalation ? () => resolveEscalation(activeEscalation.eventId) : undefined
        }
      />

      {/* Content area with sidebar re-rendered client-side to carry projectId + unreadCount */}
      <div className="flex flex-1 overflow-hidden">
        {/* NavSidebar re-rendered client-side with project context and unreadCount badge */}
        <NavSidebar projectId={projectId} unreadCount={unreadCount} />

        <div className="flex-1 flex flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
