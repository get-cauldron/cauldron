-- interview_mode and interview_status were created in 0003_interview_seed_guard — skip if already exist
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interview_mode') THEN
  CREATE TYPE "public"."interview_mode" AS ENUM('greenfield', 'brownfield');
END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interview_status') THEN
  CREATE TYPE "public"."interview_status" AS ENUM('active', 'paused', 'completed', 'abandoned');
END IF; END $$;--> statement-breakpoint
CREATE TYPE "public"."asset_job_status" AS ENUM('pending', 'claimed', 'active', 'completed', 'failed', 'canceled');--> statement-breakpoint
-- event_type values below may already exist from migrations 0005-0011 — use IF NOT EXISTS
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'decomposition_started';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'decomposition_completed';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'decomposition_failed';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'bead_dispatched';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'bead_skipped';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'bead_merged';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'merge_reverted';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'merge_escalation_needed';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'conflict_resolved';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'evolution_lateral_thinking';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'evolution_escalated';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'evolution_halted';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'evolution_goal_met';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'execution_started';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'pipeline_trigger';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'asset_job_submitted';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'asset_job_active';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'asset_job_completed';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'asset_job_failed';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'asset_job_canceled';--> statement-breakpoint
ALTER TYPE "public"."holdout_status" ADD VALUE IF NOT EXISTS 'pending_review';--> statement-breakpoint
ALTER TYPE "public"."holdout_status" ADD VALUE IF NOT EXISTS 'approved';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "interview_status" DEFAULT 'active' NOT NULL,
	"mode" "interview_mode" DEFAULT 'greenfield' NOT NULL,
	"phase" text DEFAULT 'gathering' NOT NULL,
	"transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ambiguity_scores_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_ambiguity_score" jsonb,
	"turn_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asset_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "asset_job_status" DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"prompt" text NOT NULL,
	"negative_prompt" text,
	"width" integer,
	"height" integer,
	"seed" integer,
	"steps" integer,
	"guidance_scale" integer,
	"idempotency_key" text,
	"extras" jsonb DEFAULT '{}'::jsonb,
	"output_metadata" jsonb,
	"artifact_path" text,
	"failure_reason" text,
	"executor_adapter" text DEFAULT 'comfyui' NOT NULL,
	"claimed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_jobs_idempotency_key_unique" UNIQUE("project_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "holdout_vault" ALTER COLUMN "ciphertext" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "holdout_vault" ALTER COLUMN "encrypted_dek" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "holdout_vault" ALTER COLUMN "iv" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "holdout_vault" ALTER COLUMN "auth_tag" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "holdout_vault" ALTER COLUMN "status" SET DEFAULT 'pending_review';--> statement-breakpoint
ALTER TABLE "holdout_vault" ALTER COLUMN "encrypted_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "holdout_vault" ALTER COLUMN "encrypted_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "seeds" ADD COLUMN IF NOT EXISTS "generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "seeds" ADD COLUMN IF NOT EXISTS "evolution_context" jsonb;--> statement-breakpoint
ALTER TABLE "beads" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "beads" ADD COLUMN IF NOT EXISTS "covers_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "beads" ADD COLUMN IF NOT EXISTS "worktree_path" text;--> statement-breakpoint
ALTER TABLE "beads" ADD COLUMN IF NOT EXISTS "worktree_branch" text;--> statement-breakpoint
ALTER TABLE "holdout_vault" ADD COLUMN IF NOT EXISTS "draft_scenarios" jsonb;--> statement-breakpoint
ALTER TABLE "holdout_vault" ADD COLUMN IF NOT EXISTS "results" jsonb;--> statement-breakpoint
ALTER TABLE "holdout_vault" ADD COLUMN IF NOT EXISTS "evaluated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD COLUMN IF NOT EXISTS "seed_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'interviews_project_id_projects_id_fk'
  ) THEN
    ALTER TABLE "interviews" ADD CONSTRAINT "interviews_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "asset_jobs" ADD CONSTRAINT "asset_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'seeds_interview_id_interviews_id_fk'
  ) THEN
    ALTER TABLE "seeds" ADD CONSTRAINT "seeds_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'llm_usage_seed_id_seeds_id_fk'
  ) THEN
    ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_seed_id_seeds_id_fk" FOREIGN KEY ("seed_id") REFERENCES "public"."seeds"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_usage_seed_id_idx" ON "llm_usage" USING btree ("seed_id");
