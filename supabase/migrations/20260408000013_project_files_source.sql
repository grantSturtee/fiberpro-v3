-- =============================================================================
-- project_files.source — track origin of each file
-- =============================================================================
-- Distinguishes system-generated files (n8n / package route) from admin or
-- user uploads. Nullable for backward compatibility with existing rows.
-- =============================================================================

ALTER TABLE project_files
  ADD COLUMN IF NOT EXISTS source text
  CHECK (source IS NULL OR source IN ('system_generated', 'admin_upload'));

COMMENT ON COLUMN project_files.source IS
  'Origin of the file: system_generated (n8n / route) or admin_upload (admin/designer/client). NULL on legacy rows.';
