-- =============================================================================
-- GRANTED — Cover Sheet Template Improvements
-- =============================================================================
-- 1. Convert authority_type from shared enum to text with new values
--    (state / county / township) — decoupled from the authority_profiles enum.
-- 2. Add pe_required boolean — used to match cover templates to projects.
-- 3. Add field_mappings jsonb — overlay field placement for cover PDFs.
-- =============================================================================

-- Step 1: Cast the enum column to text (drops the enum constraint).
ALTER TABLE cover_sheet_templates
  ALTER COLUMN authority_type TYPE text USING authority_type::text;

-- Step 2: Migrate legacy enum values to new text values.
UPDATE cover_sheet_templates SET authority_type = 'state'    WHERE authority_type = 'njdot';
UPDATE cover_sheet_templates SET authority_type = 'township' WHERE authority_type = 'municipal';
UPDATE cover_sheet_templates SET authority_type = NULL       WHERE authority_type = 'other';
-- 'county' stays 'county' — no migration needed.

-- Step 3: Add new CHECK constraint with the three accepted values.
ALTER TABLE cover_sheet_templates
  ADD CONSTRAINT cover_sheet_templates_authority_type_check
  CHECK (authority_type IN ('state', 'county', 'township'));

-- Step 4: Add pe_required column.
ALTER TABLE cover_sheet_templates
  ADD COLUMN IF NOT EXISTS pe_required boolean NOT NULL DEFAULT false;

-- Step 5: Add field_mappings jsonb column for overlay editor.
ALTER TABLE cover_sheet_templates
  ADD COLUMN IF NOT EXISTS field_mappings jsonb;
