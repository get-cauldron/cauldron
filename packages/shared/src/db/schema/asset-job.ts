import { pgTable, pgEnum, uuid, text, timestamp, integer, jsonb, unique } from 'drizzle-orm/pg-core';
import { projects } from './project.js';

export interface AssetOutputMetadata {
  imageFilename: string;
  comfyuiPromptId: string;
  width: number;
  height: number;
  model: string;
  generatedAt: string; // ISO 8601
}

export const assetJobStatusEnum = pgEnum('asset_job_status', [
  'pending',
  'claimed',
  'active',
  'completed',
  'failed',
  'canceled',
]);

export const assetJobs = pgTable('asset_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  status: assetJobStatusEnum('status').notNull().default('pending'),
  priority: integer('priority').notNull().default(0),
  prompt: text('prompt').notNull(),
  negativePrompt: text('negative_prompt'),
  width: integer('width'),
  height: integer('height'),
  seed: integer('seed'),
  steps: integer('steps'),
  guidanceScale: integer('guidance_scale'),
  idempotencyKey: text('idempotency_key'),
  extras: jsonb('extras').$type<Record<string, unknown>>().default({}),
  outputMetadata: jsonb('output_metadata').$type<AssetOutputMetadata | null>(),
  artifactPath: text('artifact_path'),
  failureReason: text('failure_reason'),
  executorAdapter: text('executor_adapter').notNull().default('comfyui'),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('asset_jobs_idempotency_key_unique').on(table.projectId, table.idempotencyKey),
]);

export type AssetJob = typeof assetJobs.$inferSelect;
export type NewAssetJob = typeof assetJobs.$inferInsert;
