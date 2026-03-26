ALTER TYPE "public"."event_type" ADD VALUE 'gateway_call_completed';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'gateway_failover';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'gateway_exhausted';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'budget_exceeded';--> statement-breakpoint
CREATE TABLE "llm_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"bead_id" uuid,
	"evolution_cycle" integer,
	"stage" text NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer NOT NULL,
	"completion_tokens" integer NOT NULL,
	"total_tokens" integer NOT NULL,
	"cost_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_bead_id_beads_id_fk" FOREIGN KEY ("bead_id") REFERENCES "public"."beads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_usage_project_created_idx" ON "llm_usage" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "llm_usage_bead_idx" ON "llm_usage" USING btree ("bead_id");--> statement-breakpoint
CREATE INDEX "llm_usage_project_cycle_idx" ON "llm_usage" USING btree ("project_id","evolution_cycle");