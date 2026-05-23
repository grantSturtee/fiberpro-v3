-- Phase D — Company Logo System.
--
-- Adds a per-company logo: a column on `companies` plus a private storage
-- bucket. The renderer will prefer this per-company logo over the existing
-- per-project `projects.client_logo_url` (legacy "client logo") when an
-- image_region binds to sourceKey = "company_logo". When neither is set the
-- region is skipped, exactly as today.

-- ── 1. Column ────────────────────────────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS logo_path text;

-- ── 2. Storage bucket ────────────────────────────────────────────────────────
-- Private; png / jpeg / webp only; 5 MB limit. Path convention used by the
-- upload action: company-logos/{company_id}/logo.{ext}
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-assets',
  'company-assets',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ── 3. Storage RLS ───────────────────────────────────────────────────────────
-- Admin-only. Service role bypasses RLS, so the renderer's service client and
-- the admin upload server action both work without per-row policies.

DO $$ BEGIN
  CREATE POLICY "company-assets: admin all"
    ON storage.objects FOR ALL
    USING (
      bucket_id = 'company-assets'
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
    )
    WITH CHECK (
      bucket_id = 'company-assets'
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;
