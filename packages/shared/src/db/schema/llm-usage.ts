import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { projects } from './project.js';
import { beads } from './bead.js';
import { seeds } from './seed.js';

export const llmUsage = pgTable('llm_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  beadId: uuid('bead_id').references(() => beads.id, { onDelete: 'set null' }),
  seedId: uuid('seed_id').references(() => seeds.id, { onDelete: 'set null' }),
  evolutionCycle: integer('evolution_cycle'),
  stage: text('stage').notNull(),
  model: text('model').notNull(),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  totalTokens: integer('total_tokens').notNull(),
  costCents: integer('cost_cents').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('llm_usage_project_created_idx').on(table.projectId, table.createdAt),
  index('llm_usage_bead_idx').on(table.beadId),
  index('llm_usage_project_cycle_idx').on(table.projectId, table.evolutionCycle),
  index('llm_usage_seed_id_idx').on(table.seedId),
]);

export type LlmUsage = typeof llmUsage.$inferSelect;
export type NewLlmUsage = typeof llmUsage.$inferInsert;
