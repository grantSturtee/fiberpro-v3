-- =============================================================================
-- File storage structure — standardize folder zones
--
-- Storage bucket: project-files
-- Path convention: /{project_id}/{file_type}/{filename}
--
--   intake/    — files submitted by the client at project intake
--   sld/       — admin-uploaded SLD reference sheets (and other admin files)
--   tcp/       — designer-uploaded TCP sheets and source files
--   generated/ — n8n-produced outputs (permit package, cover sheet, etc.)
--                Fixed filenames so n8n can overwrite in-place:
--                  generated/permit_package.pdf
--                  generated/cover_sheet.pdf
--                  generated/application.pdf
--   other/     — fallback for uncategorized files
--
-- This column is a folder-level grouping. The existing file_category enum
-- is kept for granular classification within each zone.
-- =============================================================================

ALTER TABLE project_files
  ADD COLUMN IF NOT EXISTS file_type text NOT NULL DEFAULT 'other'
  CHECK (file_type IN ('intake', 'sld', 'tcp', 'generated', 'other'));

-- Backfill file_type from file_category for all existing rows.
UPDATE project_files SET file_type = 'intake'
  WHERE file_category IN ('intake_attachment', 'client_reference', 'source_map');

UPDATE project_files SET file_type = 'sld'
  WHERE file_category IN ('sld_sheet', 'application_form', 'cover_sheet');

UPDATE project_files SET file_type = 'tcp'
  WHERE file_category IN ('tcp_pdf', 'tcp_source');

UPDATE project_files SET file_type = 'generated'
  WHERE file_category IN ('permit_package', 'coi', 'pe_stamp', 'permit_document', 'invoice_attachment');

-- Index: efficient file listing by type for a project
CREATE INDEX IF NOT EXISTS idx_project_files_type
  ON project_files (project_id, file_type, created_at DESC);
