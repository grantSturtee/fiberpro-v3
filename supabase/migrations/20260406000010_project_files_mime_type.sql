-- Migration: add mime_type to project_files
-- Purpose: store the actual MIME type of each uploaded file so future UI logic
--          can gate view vs. download behavior per file type without guessing
--          from the filename extension at render time.
--
-- Backfill strategy: derive from the lowercase file extension in file_name.
-- All existing rows were PDF-only at upload time, so the backfill result
-- will be application/pdf in practice. The CASE covers future file types
-- to make the expression reusable for manual re-runs or partial backfills.

ALTER TABLE project_files
  ADD COLUMN IF NOT EXISTS mime_type text;

-- Backfill existing rows from file extension.
-- Lower-cases the extension extracted from file_name before matching.
UPDATE project_files
SET mime_type = CASE lower(substring(file_name from '\.([^.]+)$'))
  WHEN 'pdf'  THEN 'application/pdf'
  WHEN 'png'  THEN 'image/png'
  WHEN 'jpg'  THEN 'image/jpeg'
  WHEN 'jpeg' THEN 'image/jpeg'
  WHEN 'gif'  THEN 'image/gif'
  WHEN 'webp' THEN 'image/webp'
  WHEN 'svg'  THEN 'image/svg+xml'
  WHEN 'txt'  THEN 'text/plain'
  WHEN 'csv'  THEN 'text/csv'
  WHEN 'json' THEN 'application/json'
  WHEN 'zip'  THEN 'application/zip'
  WHEN 'dwg'  THEN 'application/acad'
  WHEN 'dxf'  THEN 'image/vnd.dxf'
  ELSE             'application/octet-stream'
END
WHERE mime_type IS NULL;

-- Index is intentionally omitted — mime_type is a filter/display hint,
-- not a join key. Add one later only if query patterns warrant it.
