-- Migration 0005: DAG decomposition schema additions
-- Adds version column (optimistic concurrency, DAG-08), covers_criteria (acceptance criteria mapping, DAG-09),
-- decomposition lifecycle event types, and performance indexes for ready-bead queries.
-- NOTE: ALTER TYPE ADD VALUE cannot run inside a transaction block in PostgreSQL.
-- This migration uses Drizzle breakpoint format without transaction wrapping.

ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'decomposition_started' AFTER 'seed_crystallized';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'decomposition_completed' AFTER 'decomposition_started';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'decomposition_failed' AFTER 'decomposition_completed';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'bead_dispatched' AFTER 'decomposition_failed';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'bead_skipped' AFTER 'bead_dispatched';--> statement-breakpoint

-- Add version column for optimistic concurrency (DAG-08)
ALTER TABLE "beads" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;--> statement-breakpoint

-- Add covers_criteria JSONB column for acceptance criteria mapping (DAG-09)
ALTER TABLE "beads" ADD COLUMN IF NOT EXISTS "covers_criteria" jsonb NOT NULL DEFAULT '[]';--> statement-breakpoint

-- Add indexes for ready-bead query performance
CREATE INDEX IF NOT EXISTS "beads_status_seed_idx" ON "beads" ("status", "seed_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bead_edges_to_bead_idx" ON "bead_edges" ("to_bead_id", "edge_type");
