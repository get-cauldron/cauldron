import { pgTable, pgEnum, uuid, text, timestamp, jsonb, real, integer } from 'drizzle-orm/pg-core';
import { projects } from './project.js';
import { interviews } from './interview.js';

export const seedStatusEnum = pgEnum('seed_status', [
  'draft',
  'crystallized',
]);

export const seeds = pgTable('seeds', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  parentId: uuid('parent_id'), // D-03: self-referencing FK for evolution lineage (recursive CTE traversal)
  interviewId: uuid('interview_id').references(() => interviews.id),
  version: integer('version').notNull().default(1),
  status: seedStatusEnum('status').notNull().default('draft'),
  // D-01: Structured columns instead of YAML blob
  goal: text('goal').notNull(),
  constraints: jsonb('constraints').notNull().default([]),
  acceptanceCriteria: jsonb('acceptance_criteria').notNull().default([]),
  ontologySchema: jsonb('ontology_schema').notNull().default({}),
  evaluationPrinciples: jsonb('evaluation_principles').notNull().default([]),
  exitConditions: jsonb('exit_conditions').notNull().default({}),
  ambiguityScore: real('ambiguity_score'),
  crystallizedAt: timestamp('crystallized_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // NO updatedAt — immutability enforced at application level; seeds never mutate after crystallization
  generation: integer('generation').notNull().default(0),
  evolutionContext: jsonb('evolution_context'),
});

export type Seed = typeof seeds.$inferSelect;
export type NewSeed = typeof seeds.$inferInsert;
