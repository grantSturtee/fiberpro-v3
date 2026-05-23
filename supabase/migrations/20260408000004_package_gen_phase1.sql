-- =============================================================================
-- GRANTED — Package Generation Phase 1
-- =============================================================================
-- Two separate systems:
--   1. Package layer   → cover sheet layout, TCP/TCD/SLD assembly (company-level)
--   2. Authority layer → application/certification forms (authority-level)
-- These MUST NOT be mixed.
-- =============================================================================

-- ── 1. Project roadway fields ─────────────────────────────────────────────────
-- Required for the programmatic cover sheet.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS roadway        text,
  ADD COLUMN IF NOT EXISTS milepost_from  text,
  ADD COLUMN IF NOT EXISTS milepost_to    text,
  ADD COLUMN IF NOT EXISTS client_logo_url text;

-- ── 2. authority_profiles — add requires_certification ─────────────────────────
-- Distinct from requires_application: some authorities require a separate
-- engineer certification form in addition to (or instead of) an application.

ALTER TABLE authority_profiles
  ADD COLUMN IF NOT EXISTS requires_certification boolean NOT NULL DEFAULT false;

-- ── 3. authority_document_templates ──────────────────────────────────────────
-- Stores the actual PDF templates for authority-specific documents.
-- Authority layer ONLY — never used for package structure decisions.
--
-- file_url:      Storage path in the 'authority-documents' bucket.
-- field_mappings: JSON mapping PDF AcroForm field names → project data keys.
--                 Example: { "ApplicationNo": "job_number", "Route": "roadway" }

CREATE TABLE IF NOT EXISTS authority_document_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_id uuid NOT NULL REFERENCES authority_profiles(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('application', 'certification')),
  file_url     text NOT NULL,
  field_mappings jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE authority_document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authority_document_templates: admin all"
  ON authority_document_templates FOR ALL
  USING ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin');

-- ── 4. package_template_sets ──────────────────────────────────────────────────
-- Controls the STRUCTURE of the generated package (which document types to
-- include, sheet numbering). Company/package layer ONLY.
-- Separate from template_sets (which controls authority/job-type matching).

CREATE TABLE IF NOT EXISTS package_template_sets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  include_tcp     boolean NOT NULL DEFAULT true,
  include_tcd     boolean NOT NULL DEFAULT true,
  include_sld     boolean NOT NULL DEFAULT true,
  sheet_numbering boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE package_template_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "package_template_sets: admin all"
  ON package_template_sets FOR ALL
  USING ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin');

CREATE POLICY "package_template_sets: internal read"
  ON package_template_sets FOR SELECT
  USING ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' IN ('admin', 'designer'));
