-- Migration 0006: Merge queue event types
-- Adds bead_merged, merge_reverted, merge_escalation_needed event types
-- for the MergeQueue lifecycle (Phase 06, Plan 04).
-- NOTE: ALTER TYPE ADD VALUE cannot run inside a transaction block in PostgreSQL.
-- This migration uses Drizzle breakpoint format without transaction wrapping.

ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'bead_merged' AFTER 'merge_completed';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'merge_reverted' AFTER 'bead_merged';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'merge_escalation_needed' AFTER 'merge_reverted';--> statement-breakpoint
