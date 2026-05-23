-- =============================================================================
-- Add certification_form to file_category enum
-- =============================================================================
--
-- Previously, the generate-package route wrote certification outputs with
-- category = 'permit_document', which is semantically wrong (permit_document
-- is for received permit documents FROM the authority, not generated forms).
--
-- This migration adds the correct 'certification_form' value for generated
-- authority certification forms (e.g. contractor certifications for NJ county
-- road occupancy permits that require a separate certification page).
--
-- NOTE: ALTER TYPE ADD VALUE cannot be run in the same transaction as a
-- reference to the new value. Any index or column reference using
-- 'certification_form' must be in a later migration file.
-- =============================================================================

ALTER TYPE file_category ADD VALUE IF NOT EXISTS 'certification_form';
