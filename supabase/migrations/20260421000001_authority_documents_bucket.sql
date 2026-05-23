-- Creates the authority-documents storage bucket for admin-uploaded PDF templates.
-- PDF only; 20 MB limit; private (service role bypasses RLS for package generation).
-- Matches the same pattern as the page-templates bucket.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'authority-documents',
  'authority-documents',
  false,
  20971520,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Admins have full access (upload, replace, delete, read).
DO $$ BEGIN
  CREATE POLICY "authority-documents: admin all"
    ON storage.objects FOR ALL
    USING (
      bucket_id = 'authority-documents'
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
    )
    WITH CHECK (
      bucket_id = 'authority-documents'
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;
