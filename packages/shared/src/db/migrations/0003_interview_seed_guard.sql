-- Create interview_status enum
CREATE TYPE "public"."interview_status" AS ENUM('active', 'paused', 'completed', 'abandoned');--> statement-breakpoint

-- Create interview_mode enum
CREATE TYPE "public"."interview_mode" AS ENUM('greenfield', 'brownfield');--> statement-breakpoint

-- Create interviews table
CREATE TABLE IF NOT EXISTS "interviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id"),
  "status" "interview_status" DEFAULT 'active' NOT NULL,
  "mode" "interview_mode" DEFAULT 'greenfield' NOT NULL,
  "phase" text DEFAULT 'gathering' NOT NULL,
  "transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "ambiguity_scores_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "current_ambiguity_score" jsonb,
  "turn_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);--> statement-breakpoint

-- Add FK from seeds.interview_id to interviews.id
ALTER TABLE "seeds" ADD CONSTRAINT "seeds_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id");--> statement-breakpoint

-- Create index on interviews.project_id for lookup performance
CREATE INDEX IF NOT EXISTS "interviews_project_id_idx" ON "interviews" ("project_id");--> statement-breakpoint

-- Seed immutability trigger (D-26: belt-and-suspenders with app-level guard)
CREATE OR REPLACE FUNCTION prevent_seed_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'crystallized' THEN
    RAISE EXCEPTION 'ImmutableSeedError: seed % is crystallized and cannot be mutated', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER seeds_immutability_guard
  BEFORE UPDATE ON seeds
  FOR EACH ROW
  EXECUTE FUNCTION prevent_seed_mutation();
