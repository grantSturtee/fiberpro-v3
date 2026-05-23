-- Add field_mappings to page_templates so cover templates can carry overlay
-- configuration for runtime text injection (job number, date, etc.).
--
-- Format mirrors cover_template_versions.field_mappings:
--   { "mode": "overlay", "fontSize": 9,
--     "fields": [{ "key": "job_number", "x": 100, "y": 200, "page": 0 }] }
--
-- NULL means the PDF is used as-is (static cover, no text overlay applied).
-- This is valid for pre-formatted cover sheets that don't need dynamic fields.
--
-- This column is the minimum required for page_templates(type='cover') to be
-- used as the primary cover source in generate-package/route.ts.
ALTER TABLE page_templates
  ADD COLUMN IF NOT EXISTS field_mappings jsonb;
