-- Creates the page-templates storage bucket for admin-uploaded PDFs.
-- PDF only; 20 MB limit; private (service role bypasses RLS during package generation).
-- Previously this bucket was assumed to exist from the dashboard — now it is codified.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'page-templates',
  'page-templates',
  false,
  20971520,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Admins have full access (upload, replace, delete, read).
DO $$ BEGIN
  CREATE POLICY "page-templates: admin all"
    ON storage.objects FOR ALL
    USING (
      bucket_id = 'page-templates'
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
    )
    WITH CHECK (
      bucket_id = 'page-templates'
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;
