-- =============================================================================
-- Project Compute: workflow_jobs extensions
-- =============================================================================

-- Add project_computed job type to the enum.
-- Represents a synchronous compute pass (jurisdiction match + price calc).
-- Future: n8n can subscribe to these records for enrichment/automation hooks.
DO $$ BEGIN
  ALTER TYPE workflow_job_type ADD VALUE IF NOT EXISTS 'project_computed';
EXCEPTION WHEN others THEN NULL; END $$;

-- Add metadata column for storing compute inputs + outputs.
-- Kept as jsonb so n8n and future consumers can read without schema migrations.
ALTER TABLE workflow_jobs
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Add state column to projects (used for jurisdiction matching).
-- Should already exist from initial schema but guard idempotently.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS state text;

-- Index: efficient lookup of latest compute job per project.
CREATE INDEX IF NOT EXISTS idx_workflow_jobs_project_computed
  ON workflow_jobs (project_id, created_at DESC)
  WHERE job_type = 'project_computed';
