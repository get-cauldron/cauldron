-- Phase 23: Drop legacy auto-named FK constraints that block CASCADE behavior
-- Some databases may have auto-named constraints created by early Drizzle migrations
-- before migration 0013 added the properly-named variants. These NO ACTION constraints
-- were never explicitly dropped by 0017 because they were created outside the
-- standard naming convention. This migration conditionally drops them if they exist.

-- Drop legacy NO ACTION FK on interviews.project_id (pre-dates 0013 naming)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'interviews_project_id_fkey'
      AND conrelid = 'interviews'::regclass
      AND contype = 'f'
  ) THEN
    ALTER TABLE "interviews" DROP CONSTRAINT "interviews_project_id_fkey";
  END IF;
END $$;

-- Drop legacy NO ACTION FK on llm_usage.seed_id (pre-dates 0013 naming)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'llm_usage_seed_id_fkey'
      AND conrelid = 'llm_usage'::regclass
      AND contype = 'f'
  ) THEN
    ALTER TABLE "llm_usage" DROP CONSTRAINT "llm_usage_seed_id_fkey";
  END IF;
END $$;
