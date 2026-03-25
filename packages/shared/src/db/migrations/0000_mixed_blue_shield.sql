CREATE TYPE "public"."seed_status" AS ENUM('draft', 'crystallized');--> statement-breakpoint
CREATE TYPE "public"."bead_edge_type" AS ENUM('blocks', 'parent_child', 'conditional_blocks', 'waits_for');--> statement-breakpoint
CREATE TYPE "public"."bead_status" AS ENUM('pending', 'claimed', 'active', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('interview_started', 'interview_completed', 'seed_crystallized', 'holdouts_sealed', 'holdouts_unsealed', 'bead_claimed', 'bead_completed', 'bead_failed', 'evolution_started', 'evolution_converged', 'merge_completed');--> statement-breakpoint
CREATE TYPE "public"."holdout_status" AS ENUM('sealed', 'unsealed', 'evaluated');--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_id" uuid,
	"interview_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "seed_status" DEFAULT 'draft' NOT NULL,
	"goal" text NOT NULL,
	"constraints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"acceptance_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ontology_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evaluation_principles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exit_conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ambiguity_score" real,
	"crystallized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bead_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_bead_id" uuid NOT NULL,
	"to_bead_id" uuid NOT NULL,
	"edge_type" "bead_edge_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seed_id" uuid NOT NULL,
	"molecule_id" uuid,
	"title" text NOT NULL,
	"spec" text NOT NULL,
	"status" "bead_status" DEFAULT 'pending' NOT NULL,
	"estimated_tokens" integer,
	"agent_assignment" text,
	"claimed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"seed_id" uuid,
	"bead_id" uuid,
	"type" "event_type" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sequence_number" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holdout_vault" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seed_id" uuid NOT NULL,
	"ciphertext" text NOT NULL,
	"encrypted_dek" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"status" "holdout_status" DEFAULT 'sealed' NOT NULL,
	"encrypted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unsealed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "project_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"state" jsonb NOT NULL,
	"last_event_sequence" integer NOT NULL,
	"snapshot_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seeds" ADD CONSTRAINT "seeds_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bead_edges" ADD CONSTRAINT "bead_edges_from_bead_id_beads_id_fk" FOREIGN KEY ("from_bead_id") REFERENCES "public"."beads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bead_edges" ADD CONSTRAINT "bead_edges_to_bead_id_beads_id_fk" FOREIGN KEY ("to_bead_id") REFERENCES "public"."beads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beads" ADD CONSTRAINT "beads_seed_id_seeds_id_fk" FOREIGN KEY ("seed_id") REFERENCES "public"."seeds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdout_vault" ADD CONSTRAINT "holdout_vault_seed_id_seeds_id_fk" FOREIGN KEY ("seed_id") REFERENCES "public"."seeds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_snapshots" ADD CONSTRAINT "project_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;