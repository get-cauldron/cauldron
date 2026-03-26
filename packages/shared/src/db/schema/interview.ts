import { pgTable, pgEnum, uuid, text, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';
import { projects } from './project.js';

export const interviewStatusEnum = pgEnum('interview_status', [
  'active',
  'paused',
  'completed',
  'abandoned',
]);

export const interviewModeEnum = pgEnum('interview_mode', [
  'greenfield',
  'brownfield',
]);

export const interviews = pgTable('interviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  status: interviewStatusEnum('status').notNull().default('active'),
  mode: interviewModeEnum('mode').notNull().default('greenfield'),
  // FSM phase: 'gathering' | 'reviewing' | 'approved' | 'crystallized' per D-02
  phase: text('phase').notNull().default('gathering'),
  // D-07: turn-based transcript structure
  transcript: jsonb('transcript').notNull().default([]),
  // Per-turn ambiguity score snapshots
  ambiguityScoresHistory: jsonb('ambiguity_scores_history').notNull().default([]),
  // Latest AmbiguityScores object — nullable
  currentAmbiguityScore: jsonb('current_ambiguity_score'),
  turnCount: integer('turn_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export type Interview = typeof interviews.$inferSelect;
export type NewInterview = typeof interviews.$inferInsert;
