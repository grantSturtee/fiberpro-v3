-- =============================================================================
-- FiberPro V3 — Phase 4.6 Schema Updates
-- =============================================================================
-- · TCD library: add state + title columns
-- · Cover sheet templates: add state, work_type, notes, is_default columns
-- · Pricing rules: add extended fee columns (state, county, municipality, per-type fees)
-- · New table: jurisdiction_requirements
-- · New storage buckets: tcd-pdfs, cover-templates
-- =============================================================================

-- ── tcd_library: extend metadata ─────────────────────────────────────────────
ALTER TABLE tcd_library ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE tcd_library ADD COLUMN IF NOT EXISTS title text;

-- ── cover_sheet_templates: extend metadata ────────────────────────────────────
ALTER TABLE cover_sheet_templates ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE cover_sheet_templates ADD COLUMN IF NOT EXISTS work_type text;
ALTER TABLE cover_sheet_templates ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE cover_sheet_templates ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- ── pricing_rules: extend fee structure ───────────────────────────────────────
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS county text;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS municipality text;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS per_sheet_cents integer;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS application_fee_cents integer;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS jurisdiction_fee_cents integer;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS pe_fee_cents integer;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS coi_fee_cents integer;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS rush_fee_cents integer;

-- ── jurisdiction_requirements (new table) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS jurisdiction_requirements (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Location scope
  state                     text NOT NULL DEFAULT 'NJ',
  county                    text,
  municipality              text,
  authority_name            text,                     -- e.g. "Bergen County DPW"
  authority_type            authority_type,
  -- Submission logistics
  submission_method         text CHECK (
                              submission_method IS NULL OR
                              submission_method IN ('online', 'email', 'mail', 'in_person')
                            ),
  submission_url            text,
  submission_email          text,
  mailing_address           text,
  -- Package requirements (drives checklist)
  requires_application_form boolean NOT NULL DEFAULT false,
  requires_cover_sheet      boolean NOT NULL DEFAULT false,
  requires_tcp              boolean NOT NULL DEFAULT true,
  requires_sld              boolean NOT NULL DEFAULT false,
  requires_tcd              boolean NOT NULL DEFAULT true,
  requires_coi              boolean NOT NULL DEFAULT false,
  requires_pe               boolean NOT NULL DEFAULT false,
  requires_payment_upfront  boolean NOT NULL DEFAULT false,
  -- Notes
  payment_method_notes      text,
  turnaround_notes          text,
  special_instructions      text,
  billing_impact_notes      text,
  package_impact_notes      text,
  -- Metadata
  is_active                 boolean NOT NULL DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE jurisdiction_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jurisdiction_requirements: admin all"
  ON jurisdiction_requirements FOR ALL
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
  );

CREATE POLICY "jurisdiction_requirements: internal read"
  ON jurisdiction_requirements FOR SELECT
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' IN ('admin', 'designer')
  );

DROP TRIGGER IF EXISTS touch_updated_at ON jurisdiction_requirements;
CREATE TRIGGER touch_updated_at
  BEFORE UPDATE ON jurisdiction_requirements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Storage: tcd-pdfs bucket ──────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tcd-pdfs',
  'tcd-pdfs',
  false,
  20971520,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "tcd-pdfs: admin all"
    ON storage.objects FOR ALL
    USING (
      bucket_id = 'tcd-pdfs'
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
    )
    WITH CHECK (
      bucket_id = 'tcd-pdfs'
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "tcd-pdfs: internal read"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'tcd-pdfs'
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' IN ('admin', 'designer')
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Storage: cover-templates bucket ──────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cover-templates',
  'cover-templates',
  false,
  20971520,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "cover-templates: admin all"
    ON storage.objects FOR ALL
    USING (
      bucket_id = 'cover-templates'
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
    )
    WITH CHECK (
      bucket_id = 'cover-templates'
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "cover-templates: internal read"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'cover-templates'
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' IN ('admin', 'designer')
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;
