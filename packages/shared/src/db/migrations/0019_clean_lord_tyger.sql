CREATE TYPE "public"."kek_status" AS ENUM('active', 'retired');--> statement-breakpoint
CREATE TABLE "kek_rotation_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kek_versions" (
	"version" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"status" "kek_status" DEFAULT 'active' NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	"key_fingerprint" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "holdout_vault" ADD COLUMN "kek_version" integer;--> statement-breakpoint
ALTER TABLE "holdout_vault" ADD CONSTRAINT "holdout_vault_kek_version_kek_versions_version_fk" FOREIGN KEY ("kek_version") REFERENCES "public"."kek_versions"("version") ON DELETE no action ON UPDATE no action;