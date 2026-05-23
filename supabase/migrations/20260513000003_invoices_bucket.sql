-- =============================================================================
-- Phase A — invoices storage bucket
-- =============================================================================
-- Creates the private "invoices" storage bucket for persisted invoice PDFs.
--
--   * Private (no public reads).
--   * 5 MB per-file limit. Invoices are single-page documents; this is plenty.
--   * application/pdf only.
--
-- Access model:
--   * Admins (app_metadata.role = 'admin') have full bucket access.
--   * Company users have NO direct bucket access. In Phase B, the PDF route
--     will authenticate company users and stream the file via the application
--     layer rather than handing out signed bucket URLs.
--
-- Matches the same pattern used by the authority-documents bucket migration.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoices',
  'invoices',
  false,
  5242880,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Admins have full access (upload, replace, delete, read).
DO $$ BEGIN
  CREATE POLICY "invoices: admin all"
    ON storage.objects FOR ALL
    USING (
      bucket_id = 'invoices'
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
    )
    WITH CHECK (
      bucket_id = 'invoices'
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;
