-- Phase 6: Add worktree tracking columns to beads table
-- These columns store the git worktree path and branch name during bead execution.
ALTER TABLE "beads" ADD COLUMN "worktree_path" text;--> statement-breakpoint
ALTER TABLE "beads" ADD COLUMN "worktree_branch" text;--> statement-breakpoint
