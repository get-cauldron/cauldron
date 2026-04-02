import { pgTable, pgEnum, uuid, timestamp, jsonb, integer, unique, index } from 'drizzle-orm/pg-core';
import { projects } from './project.js';

export const eventTypeEnum = pgEnum('event_type', [
  'interview_started',
  'interview_completed',
  'seed_crystallized',
  'decomposition_started',
  'decomposition_completed',
  'decomposition_failed',
  'bead_dispatched',
  'bead_skipped',
  'holdouts_sealed',
  'holdouts_unsealed',
  'bead_claimed',
  'bead_completed',
  'bead_failed',
  'evolution_started',
  'evolution_converged',
  'merge_completed',
  'bead_merged',
  'merge_reverted',
  'merge_escalation_needed',
  'gateway_call_completed',
  'gateway_failover',
  'gateway_exhausted',
  'budget_exceeded',
  'conflict_resolved',
  'evolution_lateral_thinking',
  'evolution_escalated',
  'evolution_halted',
  'evolution_goal_met',
  'execution_started',
  'pipeline_trigger',
  'asset_job_submitted',
  'asset_job_active',
  'asset_job_completed',
  'asset_job_failed',
  'asset_job_canceled',
]);

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  seedId: uuid('seed_id'),
  beadId: uuid('bead_id'),
  type: eventTypeEnum('type').notNull(),
  payload: jsonb('payload').notNull().default({}),
  sequenceNumber: integer('sequence_number').notNull(), // monotonic within project for ordering guarantee
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  // NO updatedAt — this table is append-only, never UPDATE (D-05, D-06)
}, (table) => [
  unique('events_project_sequence_unique').on(table.projectId, table.sequenceNumber),
  index('events_project_sequence_idx').on(table.projectId, table.sequenceNumber),
  index('events_project_occurred_at_idx').on(table.projectId, table.occurredAt),
]);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
