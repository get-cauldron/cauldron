import { pgTable, pgEnum, uuid, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { seeds } from './seed.js';

export const beadStatusEnum = pgEnum('bead_status', [
  'pending',
  'claimed',
  'active',
  'completed',
  'failed',
]);

export const beadEdgeTypeEnum = pgEnum('bead_edge_type', [
  'blocks',
  'parent_child',
  'conditional_blocks',
  'waits_for',
]);

export const beads = pgTable('beads', {
  id: uuid('id').primaryKey().defaultRandom(),
  seedId: uuid('seed_id').notNull().references(() => seeds.id),
  moleculeId: uuid('molecule_id'), // DAG-01: parent molecule for hierarchy; null = top-level bead
  title: text('title').notNull(),
  spec: text('spec').notNull(),
  status: beadStatusEnum('status').notNull().default('pending'),
  estimatedTokens: integer('estimated_tokens'), // DAG-02: token size estimate for context window sizing
  agentAssignment: text('agent_assignment'),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  version: integer('version').notNull().default(1), // DAG-08: optimistic concurrency control
  coversCriteria: jsonb('covers_criteria').$type<string[]>().notNull().default([]), // DAG-09: acceptance criteria mapping
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const beadEdges = pgTable('bead_edges', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromBeadId: uuid('from_bead_id').notNull().references(() => beads.id),
  toBeadId: uuid('to_bead_id').notNull().references(() => beads.id),
  edgeType: beadEdgeTypeEnum('edge_type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Bead = typeof beads.$inferSelect;
export type NewBead = typeof beads.$inferInsert;
export type BeadEdge = typeof beadEdges.$inferSelect;
export type NewBeadEdge = typeof beadEdges.$inferInsert;
