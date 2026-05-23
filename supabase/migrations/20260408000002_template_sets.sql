-- ── Template Sets ─────────────────────────────────────────────────────────────
-- A template set groups the document templates used to generate a permit package
-- for a given company + job type + authority combination.

CREATE TABLE IF NOT EXISTS template_sets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  company_id   uuid REFERENCES companies(id) ON DELETE CASCADE,
  job_type     text NOT NULL,           -- 'aerial', 'underground', 'other'
  authority_id uuid REFERENCES authority_profiles(id) ON DELETE SET NULL,
  pe_required  boolean NOT NULL DEFAULT false,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Template Assets ───────────────────────────────────────────────────────────
-- Individual files that belong to a template set.
-- Stored in Supabase storage; file_path is the storage object path.

CREATE TABLE IF NOT EXISTS template_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_set_id uuid NOT NULL REFERENCES template_sets(id) ON DELETE CASCADE,
  asset_type      text NOT NULL,   -- 'cover_sheet', 'application_form'
  file_path       text NOT NULL,   -- storage path in Supabase storage bucket
  created_at      timestamptz NOT NULL DEFAULT now()
);
