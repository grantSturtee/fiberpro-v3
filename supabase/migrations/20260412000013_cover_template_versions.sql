-- =============================================================================
-- GRANTED — Cover Template PDF Versioning
-- =============================================================================
-- Introduces cover_template_versions to track multiple uploaded PDFs per
-- cover template.  Exactly one version may be live at a time, enforced by a
-- partial unique index.
--
-- cover_sheet_templates.storage_path continues to hold the live version's
-- storage path so the existing PDF proxy route works unchanged.
-- =============================================================================

CREATE TABLE IF NOT EXISTS cover_template_versions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cover_template_id  uuid        NOT NULL REFERENCES cover_sheet_templates(id) ON DELETE CASCADE,
  storage_path       text        NOT NULL,
  filename           text        NOT NULL,   -- display name (timestamp prefix stripped)
  is_live            boolean     NOT NULL DEFAULT false,
  uploaded_at        timestamptz NOT NULL DEFAULT now()
);

-- Exactly one live version per template.
CREATE UNIQUE INDEX cover_template_versions_one_live
  ON cover_template_versions (cover_template_id)
  WHERE is_live = true;

ALTER TABLE cover_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cover_template_versions: admin all"
  ON cover_template_versions FOR ALL
  USING ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin');

-- Designer read-only access (needed for future package generation lookups).
CREATE POLICY "cover_template_versions: designer read"
  ON cover_template_versions FOR SELECT
  USING ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' IN ('admin', 'designer'));

-- ── Migrate existing data ────────────────────────────────────────────────────
-- For every cover_sheet_templates row that already has a storage_path,
-- create a corresponding live version record so existing templates continue
-- to work without any manual action.

INSERT INTO cover_template_versions
  (cover_template_id, storage_path, filename, is_live, uploaded_at)
SELECT
  id,
  storage_path,
  regexp_replace(split_part(storage_path, '/', -1), E'^\\d+_', ''),
  true,
  COALESCE(created_at, now())
FROM cover_sheet_templates
WHERE storage_path IS NOT NULL;
