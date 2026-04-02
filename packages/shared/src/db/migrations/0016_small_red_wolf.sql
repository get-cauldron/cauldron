CREATE UNIQUE INDEX "seeds_parent_version_unique_idx" ON "seeds" USING btree ("parent_id","version") WHERE "seeds"."parent_id" is not null;--> statement-breakpoint
CREATE INDEX "bead_edges_to_bead_id_idx" ON "bead_edges" USING btree ("to_bead_id");--> statement-breakpoint
CREATE INDEX "events_project_sequence_idx" ON "events" USING btree ("project_id","sequence_number");--> statement-breakpoint
CREATE INDEX "events_project_occurred_at_idx" ON "events" USING btree ("project_id","occurred_at");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_project_sequence_unique" UNIQUE("project_id","sequence_number");