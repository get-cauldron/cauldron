import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

export type AssetMode = 'active' | 'paused' | 'disabled';

export interface AssetSettings {
  mode?: AssetMode;
  runtimeUrl?: string;
  artifactsRoot?: string;
  maxConcurrentJobs?: number;
}

export interface ProjectSettings {
  models?: Partial<Record<string, string[]>>;
  budgetLimitCents?: number;
  maxConcurrentBeads?: number; // DAG-parallel: limit concurrent agent execution per project
  asset?: AssetSettings;
}

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  settings: jsonb('settings').$type<ProjectSettings>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
