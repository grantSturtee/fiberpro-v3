-- ── Add pe_required to projects ───────────────────────────────────────────────
-- Null = not yet set. True/false can be auto-defaulted from the selected
-- authority_profile and overridden by admin.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS pe_required boolean;

-- ── Make template_sets columns nullable ───────────────────────────────────────
-- NULL job_type = wildcard (matches any job type).
-- NULL pe_required = wildcard (matches either pe setting).
-- This allows broad/generic template sets alongside specific ones.

ALTER TABLE template_sets
  ALTER COLUMN job_type DROP NOT NULL;

ALTER TABLE template_sets
  ALTER COLUMN pe_required DROP NOT NULL;
