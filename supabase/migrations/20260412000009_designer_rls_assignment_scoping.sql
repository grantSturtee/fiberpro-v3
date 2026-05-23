-- =============================================================================
-- Designer RLS: Scope project + file access to assigned projects only
-- =============================================================================
-- Previously, designers could read ALL projects and ALL project-files storage
-- objects by querying Supabase directly. RLS was role-only, not assignment-
-- scoped. Application code enforced assignment at the query layer, but the
-- database did not — any designer could bypass the UI and read every project.
--
-- This migration:
--   1. Replaces the blanket designer SELECT policy on projects with one that
--      restricts reads to rows where assigned_designer_id = auth.uid().
--   2. Replaces the blanket designer SELECT policy on storage.objects
--      (bucket: project-files) with one that joins through project_files and
--      projects to enforce the same assignment constraint.
--
-- No application code changes are required: existing queries already filter
-- by assigned_designer_id, so they continue to work identically.
--
-- Reversible: see the DOWN section at the bottom of this file.
-- =============================================================================

-- ── 1. projects: drop blanket designer read, add assignment-scoped read ────────

DROP POLICY IF EXISTS "projects: designer read" ON projects;

CREATE POLICY "projects: designer read assigned"
  ON projects FOR SELECT
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
    AND assigned_designer_id = auth.uid()
  );

-- ── 2. storage.objects: drop blanket designer read, add assignment-scoped read ─
--
-- The join path: storage.objects.name = project_files.storage_path
--   → project_files.project_id = projects.id
--   → projects.assigned_designer_id = auth.uid()
--
-- This ensures a designer can only download a file if it belongs to a project
-- they are currently assigned to. The project_files and projects tables are
-- already covered by RLS; this policy adds a redundant but explicit guard at
-- the storage layer.

DROP POLICY IF EXISTS "project-files: designer read" ON storage.objects;

CREATE POLICY "project-files: designer read assigned"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-files'
    AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
    AND EXISTS (
      SELECT 1
      FROM project_files pf
      JOIN projects p ON p.id = pf.project_id
      WHERE pf.storage_path = storage.objects.name
        AND p.assigned_designer_id = auth.uid()
    )
  );

-- =============================================================================
-- DOWN (manual rollback — paste into SQL editor or a revert migration)
-- =============================================================================
--
-- DROP POLICY IF EXISTS "projects: designer read assigned" ON projects;
--
-- CREATE POLICY "projects: designer read"
--   ON projects FOR SELECT
--   USING (
--     (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
--   );
--
-- DROP POLICY IF EXISTS "project-files: designer read assigned" ON storage.objects;
--
-- CREATE POLICY "project-files: designer read"
--   ON storage.objects FOR SELECT
--   USING (
--     bucket_id = 'project-files'
--     AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
--   );
-- =============================================================================
