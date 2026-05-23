-- Add cover_page_template_id to package_blueprints.
-- Wires the Cover slot to the page_templates library (type = 'cover').
-- cover_sheet_template_id is intentionally preserved for backward compatibility
-- with runtime generation, which has not been migrated yet.
ALTER TABLE package_blueprints
  ADD COLUMN IF NOT EXISTS cover_page_template_id uuid
    REFERENCES page_templates(id) ON DELETE SET NULL;
