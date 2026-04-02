-- Phase 23: FK Cascade Strategy (DATA-05)
-- Structural tables: CASCADE (deleted with parent)
-- Audit tables: SET NULL (survive with null FK for reporting)
-- NULL != NULL in PostgreSQL UNIQUE constraints — events(project_id, sequence_number)
-- unique index is safe after project_id becomes nullable (NULL rows never conflict).

-- Step 1: Make audit columns nullable (required before SET NULL constraints)
ALTER TABLE "events" ALTER COLUMN "project_id" DROP NOT NULL;
ALTER TABLE "llm_usage" ALTER COLUMN "project_id" DROP NOT NULL;

-- Step 2: Drop existing NO ACTION constraints
ALTER TABLE "seeds" DROP CONSTRAINT "seeds_project_id_projects_id_fk";
ALTER TABLE "beads" DROP CONSTRAINT "beads_seed_id_seeds_id_fk";
ALTER TABLE "bead_edges" DROP CONSTRAINT "bead_edges_from_bead_id_beads_id_fk";
ALTER TABLE "bead_edges" DROP CONSTRAINT "bead_edges_to_bead_id_beads_id_fk";
ALTER TABLE "holdout_vault" DROP CONSTRAINT "holdout_vault_seed_id_seeds_id_fk";
ALTER TABLE "interviews" DROP CONSTRAINT "interviews_project_id_projects_id_fk";
ALTER TABLE "project_snapshots" DROP CONSTRAINT "project_snapshots_project_id_projects_id_fk";
ALTER TABLE "asset_jobs" DROP CONSTRAINT "asset_jobs_project_id_projects_id_fk";
ALTER TABLE "llm_usage" DROP CONSTRAINT "llm_usage_project_id_projects_id_fk";
ALTER TABLE "llm_usage" DROP CONSTRAINT "llm_usage_bead_id_beads_id_fk";
ALTER TABLE "llm_usage" DROP CONSTRAINT "llm_usage_seed_id_seeds_id_fk";

-- Step 3: Add CASCADE constraints (structural tables)
ALTER TABLE "seeds" ADD CONSTRAINT "seeds_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "beads" ADD CONSTRAINT "beads_seed_id_seeds_id_fk" FOREIGN KEY ("seed_id") REFERENCES "seeds"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "bead_edges" ADD CONSTRAINT "bead_edges_from_bead_id_beads_id_fk" FOREIGN KEY ("from_bead_id") REFERENCES "beads"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "bead_edges" ADD CONSTRAINT "bead_edges_to_bead_id_beads_id_fk" FOREIGN KEY ("to_bead_id") REFERENCES "beads"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "holdout_vault" ADD CONSTRAINT "holdout_vault_seed_id_seeds_id_fk" FOREIGN KEY ("seed_id") REFERENCES "seeds"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "project_snapshots" ADD CONSTRAINT "project_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "asset_jobs" ADD CONSTRAINT "asset_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Step 4: Add SET NULL constraints (audit tables + self-references)
-- events.project_id: NEW FK (never existed before — no DROP needed)
ALTER TABLE "events" ADD CONSTRAINT "events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
-- llm_usage.project_id: replacing NO ACTION
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
-- llm_usage.bead_id: replacing NO ACTION (blocker — cascade deletes beads, must not block)
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_bead_id_beads_id_fk" FOREIGN KEY ("bead_id") REFERENCES "beads"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
-- llm_usage.seed_id: replacing NO ACTION (blocker — cascade deletes seeds, must not block)
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_seed_id_seeds_id_fk" FOREIGN KEY ("seed_id") REFERENCES "seeds"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
-- seeds.parent_id: NEW self-referencing FK (never existed — no DROP needed)
-- SET NULL so child seeds survive parent deletion (evolution lineage preserved as root seeds)
ALTER TABLE "seeds" ADD CONSTRAINT "seeds_parent_id_seeds_id_fk" FOREIGN KEY ("parent_id") REFERENCES "seeds"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
