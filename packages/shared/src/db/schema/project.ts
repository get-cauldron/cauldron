import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

export interface ProjectSettings {
  models?: Partial<Record<'interview' | 'holdout' | 'implementation' | 'evaluation', string[]>>;
  budgetLimitCents?: number;
}

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  settings: jsonb('settings').$type<ProjectSettings>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
