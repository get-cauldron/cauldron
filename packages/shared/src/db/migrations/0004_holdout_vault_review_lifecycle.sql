-- Migration 0004: extend holdout_status enum for review lifecycle and add new columns
-- NOTE: ALTER TYPE ADD VALUE cannot run inside a transaction block in PostgreSQL.
-- This migration uses Drizzle breakpoint format without transaction wrapping.

ALTER TYPE "public"."holdout_status" ADD VALUE IF NOT EXISTS 'pending_review' BEFORE 'sealed';--> statement-breakpoint
ALTER TYPE "public"."holdout_status" ADD VALUE IF NOT EXISTS 'approved' BEFORE 'sealed';--> statement-breakpoint

-- Add draft_scenarios column: holds scenario JSON during review, nulled after sealing
ALTER TABLE "holdout_vault" ADD COLUMN IF NOT EXISTS "draft_scenarios" jsonb;--> statement-breakpoint

-- Add results column: evaluation results JSONB per D-18
ALTER TABLE "holdout_vault" ADD COLUMN IF NOT EXISTS "results" jsonb;--> statement-breakpoint

-- Add evaluated_at timestamp for when evaluation completed
ALTER TABLE "holdout_vault" ADD COLUMN IF NOT EXISTS "evaluated_at" timestamp with time zone;--> statement-breakpoint

-- Make encryption columns nullable: pending_review and approved rows have no ciphertext yet
ALTER TABLE "holdout_vault" ALTER COLUMN "ciphertext" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "holdout_vault" ALTER COLUMN "encrypted_dek" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "holdout_vault" ALTER COLUMN "iv" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "holdout_vault" ALTER COLUMN "auth_tag" DROP NOT NULL;--> statement-breakpoint

-- Make encrypted_at nullable and remove default: only set on seal
ALTER TABLE "holdout_vault" ALTER COLUMN "encrypted_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "holdout_vault" ALTER COLUMN "encrypted_at" DROP DEFAULT;
