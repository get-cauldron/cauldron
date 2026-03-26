-- Phase 6.1: Add conflict_resolved event type for merge conflict resolution command
ALTER TYPE "public"."event_type" ADD VALUE 'conflict_resolved';--> statement-breakpoint
