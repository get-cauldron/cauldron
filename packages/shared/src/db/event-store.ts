import { eq, asc, gt, and, sql } from 'drizzle-orm';
import * as schema from './schema/index.js';
import type { DbClient } from './client.js';

// Event types matching the enum
export type EventType = typeof schema.eventTypeEnum.enumValues[number];

// Project state derived from event replay
export interface ProjectState {
  projectId: string;
  interviewStatus: 'not_started' | 'in_progress' | 'completed';
  seedCount: number;
  activeSeedId: string | null;
  beadStats: { pending: number; active: number; completed: number; failed: number };
  evolutionGeneration: number;
  lastEventSequence: number;
}

export function initialProjectState(projectId: string): ProjectState {
  return {
    projectId,
    interviewStatus: 'not_started',
    seedCount: 0,
    activeSeedId: null,
    beadStats: { pending: 0, active: 0, completed: 0, failed: 0 },
    evolutionGeneration: 0,
    lastEventSequence: 0,
  };
}

// Event reducer — fold events into state
export function applyEvent(
  state: ProjectState,
  event: typeof schema.events.$inferSelect
): ProjectState {
  const next = { ...state, lastEventSequence: event.sequenceNumber };
  switch (event.type) {
    case 'interview_started':
      return { ...next, interviewStatus: 'in_progress' };
    case 'interview_completed':
      return { ...next, interviewStatus: 'completed' };
    case 'seed_crystallized':
      return { ...next, seedCount: next.seedCount + 1, activeSeedId: event.seedId ?? null };
    case 'bead_claimed':
      return {
        ...next,
        beadStats: {
          ...next.beadStats,
          pending: next.beadStats.pending - 1,
          active: next.beadStats.active + 1,
        },
      };
    case 'bead_completed':
      return {
        ...next,
        beadStats: {
          ...next.beadStats,
          active: next.beadStats.active - 1,
          completed: next.beadStats.completed + 1,
        },
      };
    case 'bead_failed':
      return {
        ...next,
        beadStats: {
          ...next.beadStats,
          active: next.beadStats.active - 1,
          failed: next.beadStats.failed + 1,
        },
      };
    case 'evolution_started':
      return { ...next, evolutionGeneration: next.evolutionGeneration + 1 };
    default:
      return next;
  }
}

// Append — never update. Auto-increments sequence within project.
export async function appendEvent(
  db: DbClient,
  event: Omit<typeof schema.events.$inferInsert, 'id' | 'occurredAt' | 'sequenceNumber'>
): Promise<typeof schema.events.$inferSelect> {
  // Get next sequence number for this project
  const [maxSeq] = await db
    .select({ max: sql<number>`COALESCE(MAX(${schema.events.sequenceNumber}), 0)` })
    .from(schema.events)
    .where(eq(schema.events.projectId, event.projectId));

  const sequenceNumber = (maxSeq?.max ?? 0) + 1;

  const [row] = await db
    .insert(schema.events)
    .values({ ...event, sequenceNumber })
    .returning();
  return row!;
}

// Replay all events to derive current state
export async function deriveProjectState(
  db: DbClient,
  projectId: string
): Promise<ProjectState> {
  const eventLog = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.projectId, projectId))
    .orderBy(asc(schema.events.sequenceNumber));

  return eventLog.reduce(applyEvent, initialProjectState(projectId));
}

// Replay from latest snapshot (D-07)
export async function replayFromSnapshot(
  db: DbClient,
  projectId: string
): Promise<ProjectState> {
  const [snapshot] = await db
    .select()
    .from(schema.projectSnapshots)
    .where(eq(schema.projectSnapshots.projectId, projectId))
    .orderBy(asc(schema.projectSnapshots.snapshotAt))
    .limit(1);

  if (!snapshot) {
    return deriveProjectState(db, projectId);
  }

  const baseState = snapshot.state as ProjectState;
  const newEvents = await db
    .select()
    .from(schema.events)
    .where(
      and(
        eq(schema.events.projectId, projectId),
        gt(schema.events.sequenceNumber, snapshot.lastEventSequence)
      )
    )
    .orderBy(asc(schema.events.sequenceNumber));

  return newEvents.reduce(applyEvent, baseState);
}

// Snapshot current state (D-07)
export async function upsertSnapshot(db: DbClient, projectId: string): Promise<void> {
  const state = await deriveProjectState(db, projectId);
  await db
    .insert(schema.projectSnapshots)
    .values({
      projectId,
      state,
      lastEventSequence: state.lastEventSequence,
    })
    .onConflictDoUpdate({
      target: schema.projectSnapshots.projectId,
      set: {
        state,
        lastEventSequence: state.lastEventSequence,
        snapshotAt: new Date(),
      },
    });
}
