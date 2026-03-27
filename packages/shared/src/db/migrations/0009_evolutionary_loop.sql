-- Phase 7: Evolutionary loop schema additions
ALTER TABLE seeds ADD COLUMN generation integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE seeds ADD COLUMN evolution_context jsonb;--> statement-breakpoint
ALTER TABLE llm_usage ADD COLUMN seed_id uuid REFERENCES seeds(id);--> statement-breakpoint
CREATE INDEX llm_usage_seed_id_idx ON llm_usage(seed_id);--> statement-breakpoint
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'evolution_lateral_thinking';--> statement-breakpoint
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'evolution_escalated';--> statement-breakpoint
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'evolution_halted';--> statement-breakpoint
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'evolution_goal_met';--> statement-breakpoint
