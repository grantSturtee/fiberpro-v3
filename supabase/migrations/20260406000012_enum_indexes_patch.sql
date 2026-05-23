-- Partial indexes deferred from migrations 7 and 8.
-- ALTER TYPE ADD VALUE cannot be used in the same transaction as a reference
-- to the new value. These indexes are moved here so they run after the enum
-- values are fully committed.

CREATE INDEX IF NOT EXISTS idx_workflow_jobs_project_computed
  ON workflow_jobs (project_id, created_at DESC)
  WHERE job_type = 'project_computed';

CREATE INDEX IF NOT EXISTS idx_workflow_jobs_status
  ON workflow_jobs (status)
  WHERE status IN ('pending', 'queued', 'running');
