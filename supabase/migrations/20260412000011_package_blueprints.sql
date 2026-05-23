-- ── Package Blueprints ────────────────────────────────────────────────────────
-- A blueprint captures which components make up a permit package for a given
-- permitting authority.  It is the configuration record consulted at generation
-- time to know which cover sheet, application form, and certification form to
-- include — without hard-coding this knowledge in application code.
--
-- Slot model (8 slots):
--   1. Cover Sheet          → cover_sheet_template_id (nullable FK)
--   2. TCP                  → programmatic / library-driven (no FK needed)
--   3. SLD                  → programmatic / project-driven  (no FK needed)
--   4. TCD                  → programmatic / library-driven  (no FK needed)
--   5. Application Form     → application_template_id  (nullable FK)
--   6. Certification Form   → certification_template_id (nullable FK)
--   7. PE Stamp required    → inherited live from authority_profiles.requires_pe
--   8. COI required         → inherited live from authority_profiles.requires_coi
--
-- TCP / SLD / TCD are not FK columns because their inputs are assembled
-- programmatically by the generator; the blueprint simply declares that those
-- slots exist in every package for this authority.

CREATE TABLE IF NOT EXISTS package_blueprints (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_profile_id      uuid        NOT NULL
                              REFERENCES authority_profiles(id) ON DELETE CASCADE,
  cover_sheet_template_id   uuid
                              REFERENCES cover_sheet_templates(id) ON DELETE SET NULL,
  application_template_id   uuid
                              REFERENCES authority_document_templates(id) ON DELETE SET NULL,
  certification_template_id uuid
                              REFERENCES authority_document_templates(id) ON DELETE SET NULL,
  description               text,
  is_active                 boolean     NOT NULL DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- Only one active blueprint per authority at a time.
CREATE UNIQUE INDEX IF NOT EXISTS package_blueprints_authority_active_uniq
  ON package_blueprints (authority_profile_id)
  WHERE is_active = true;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE package_blueprints ENABLE ROW LEVEL SECURITY;

-- Admins have full access; no row-level scoping needed for this settings table.
CREATE POLICY "Admins can manage package blueprints"
  ON package_blueprints
  FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
