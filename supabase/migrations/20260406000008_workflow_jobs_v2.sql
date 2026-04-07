-- =============================================================================
-- workflow_jobs v2 — full automation system expansion
--
-- Column naming note: the physical column is "job_type" (not "type") because
-- "type" is a reserved word in PostgreSQL. Application code uses job_type.
-- Similarly, "error_message" is the canonical error column; "error" is added
-- as a secondary slot for structured short-form error codes from n8n.
-- =============================================================================

-- ── 1. Add new job type enum values ──────────────────────────────────────────
-- ADD VALUE IF NOT EXISTS is safe and idempotent (Postgres 9.6+).
-- Values already present (project_computed) are skipped automatically.

DO $$ BEGIN
  ALTER TYPE workflow_job_type ADD VALUE IF NOT EXISTS 'project_computed';
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE workflow_job_type ADD VALUE IF NOT EXISTS 'generate_permit_package';
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE workflow_job_type ADD VALUE IF NOT EXISTS 'generate_cover_sheet';
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE workflow_job_type ADD VALUE IF NOT EXISTS 'generate_application_form';
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE workflow_job_type ADD VALUE IF NOT EXISTS 'generate_tcp_package';
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE workflow_job_type ADD VALUE IF NOT EXISTS 'submit_permit';
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE workflow_job_type ADD VALUE IF NOT EXISTS 'generate_invoice';
EXCEPTION WHEN others THEN NULL; END $$;

-- ── 2. Add "pending" to status enum ──────────────────────────────────────────
-- "queued" and "pending" coexist; "pending" is the preferred term going forward.
-- "queued" is kept for backward compat with existing rows and code.

DO $$ BEGIN
  ALTER TYPE workflow_job_status ADD VALUE IF NOT EXISTS 'pending';
EXCEPTION WHEN others THEN NULL; END $$;

-- ── 3. Add missing columns ────────────────────────────────────────────────────

-- result: structured output from n8n or application compute (file paths, IDs, etc.)
ALTER TABLE workflow_jobs
  ADD COLUMN IF NOT EXISTS result jsonb;

-- error: short-form error code / message from n8n callback
-- error_message is kept for backward compat (longer human-readable text)
ALTER TABLE workflow_jobs
  ADD COLUMN IF NOT EXISTS error text;

-- updated_at: tracks last status transition; enables polling without scanning created_at
ALTER TABLE workflow_jobs
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ── 4. updated_at trigger ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION touch_workflow_jobs_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workflow_jobs_updated_at ON workflow_jobs;
CREATE TRIGGER workflow_jobs_updated_at
  BEFORE UPDATE ON workflow_jobs
  FOR EACH ROW EXECUTE FUNCTION touch_workflow_jobs_updated_at();

-- ── 5. Indexes ────────────────────────────────────────────────────────────────

-- (project_id, job_type): fetch all jobs of a specific type for a project
CREATE INDEX IF NOT EXISTS idx_workflow_jobs_project_type
  ON workflow_jobs (project_id, job_type);

-- (status): n8n worker polls for pending/running jobs
CREATE INDEX IF NOT EXISTS idx_workflow_jobs_status
  ON workflow_jobs (status)
  WHERE status IN ('pending', 'queued', 'running');
