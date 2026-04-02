import { pgTable, uuid, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';
import { projects } from './project.js';

export const projectSnapshots = pgTable('project_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().unique().references(() => projects.id, { onDelete: 'cascade' }),
  state: jsonb('state').notNull(),
  lastEventSequence: integer('last_event_sequence').notNull(),
  snapshotAt: timestamp('snapshot_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ProjectSnapshot = typeof projectSnapshots.$inferSelect;
export type NewProjectSnapshot = typeof projectSnapshots.$inferInsert;
