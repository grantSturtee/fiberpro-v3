-- =============================================================================
-- GRANTED — Cover Template Version Field Mappings
-- =============================================================================
-- Adds field_mappings jsonb to cover_template_versions so that overlay
-- field positions are tracked per-version rather than per-template.
--
-- cover_sheet_templates.field_mappings is kept in sync with the live
-- version's field_mappings for backward compatibility with the PDF proxy
-- and generation pipeline.
-- =============================================================================

ALTER TABLE cover_template_versions
  ADD COLUMN IF NOT EXISTS field_mappings jsonb;

-- Migrate existing field_mappings from the parent template into each version.
UPDATE cover_template_versions v
SET field_mappings = t.field_mappings
FROM cover_sheet_templates t
WHERE v.cover_template_id = t.id
  AND t.field_mappings IS NOT NULL;
