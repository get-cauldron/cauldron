// Typed SSE event matching the event store event types
export interface SSEEvent {
  id: string;
  projectId: string;
  seedId: string | null;
  beadId: string | null;
  type: string; // EventType from shared, but string for SSE transport
  payload: Record<string, unknown>;
  sequenceNumber: number;
  createdAt: string; // ISO string over SSE
}

// Event categories for client-side filtering
export const BEAD_STATUS_EVENTS = [
  'bead_dispatched',
  'bead_claimed',
  'bead_completed',
  'bead_failed',
  'bead_skipped',
  'bead_merged',
  'merge_completed',
  'merge_reverted',
] as const;

export const INTERVIEW_EVENTS = [
  'interview_started',
  'interview_completed',
  'seed_crystallized',
] as const;

export const EVOLUTION_EVENTS = [
  'evolution_started',
  'evolution_converged',
  'evolution_lateral_thinking',
  'evolution_escalated',
  'evolution_halted',
  'evolution_goal_met',
] as const;

export const ESCALATION_EVENTS = [
  'merge_escalation_needed',
  'evolution_escalated',
  'budget_exceeded',
] as const;

export type BeadStatusEventType = (typeof BEAD_STATUS_EVENTS)[number];
export type EscalationEventType = (typeof ESCALATION_EVENTS)[number];
