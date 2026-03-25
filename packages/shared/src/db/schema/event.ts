import { pgTable, pgEnum, uuid, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';

export const eventTypeEnum = pgEnum('event_type', [
  'interview_started',
  'interview_completed',
  'seed_crystallized',
  'holdouts_sealed',
  'holdouts_unsealed',
  'bead_claimed',
  'bead_completed',
  'bead_failed',
  'evolution_started',
  'evolution_converged',
  'merge_completed',
]);

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull(),
  seedId: uuid('seed_id'),
  beadId: uuid('bead_id'),
  type: eventTypeEnum('type').notNull(),
  payload: jsonb('payload').notNull().default({}),
  sequenceNumber: integer('sequence_number').notNull(), // monotonic within project for ordering guarantee
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  // NO updatedAt — this table is append-only, never UPDATE (D-05, D-06)
});

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
