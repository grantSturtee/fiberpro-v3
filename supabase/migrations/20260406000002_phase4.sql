-- =============================================================================
-- FiberPro V3 — Phase 4 Schema Updates
-- =============================================================================
-- · Adds state column to projects table (US state abbreviation)
-- · Adds uploader_label to project_files (denormalized display name)
-- · Adds designer update policy (for submit-for-review)
-- · Creates project-files storage bucket
-- · Creates storage RLS policies
-- =============================================================================

-- ── projects: add state column ────────────────────────────────────────────────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS state text;

-- ── project_files: add uploader_label (denormalized display name) ─────────────
ALTER TABLE project_files ADD COLUMN IF NOT EXISTS uploader_label text;

-- ── projects: allow designers to update their assigned projects ───────────────
-- Required for submit-for-review action (status change only done via server action)
DO $$ BEGIN
  CREATE POLICY "projects: designer update assigned"
    ON projects FOR UPDATE
    USING (
      (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
      AND assigned_designer_id = auth.uid()
    )
    WITH CHECK (
      (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
      AND assigned_designer_id = auth.uid()
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Storage: project-files bucket ────────────────────────────────────────────
-- 50 MB limit per file; private bucket (no public access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-files',
  'project-files',
  false,
  52428800,
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/tiff', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- ── Storage policies: project-files ──────────────────────────────────────────

-- Admins: full access (upload SLD, download all, delete)
DO $$ BEGIN
  CREATE POLICY "project-files: admin all"
    ON storage.objects FOR ALL
    USING (
      bucket_id = 'project-files'
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
    )
    WITH CHECK (
      bucket_id = 'project-files'
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Designers: read all files on projects they are assigned to
-- (simplified: read all in bucket; project scoping handled in server action + UI)
DO $$ BEGIN
  CREATE POLICY "project-files: designer read"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'project-files'
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Designers: upload TCP files
DO $$ BEGIN
  CREATE POLICY "project-files: designer insert"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'project-files'
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Designers: delete their own uploaded files (before submission)
DO $$ BEGIN
  CREATE POLICY "project-files: designer delete own"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'project-files'
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
      AND owner = auth.uid()
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;
