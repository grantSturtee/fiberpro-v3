-- =============================================================================
-- storage.objects: assigned-designer read for cover map assets
-- (Issue 2 Phase B)
-- =============================================================================
-- Phase A (20260507000001) granted assigned designers SELECT on the
-- project_cover_maps row. Cover map *files* live in the existing project-files
-- bucket under  cover-maps/{project_id}/...  but they are NOT registered in
-- the project_files table — they are tracked only in project_cover_maps.
--
-- The current designer storage policy (20260412000009 "project-files:
-- designer read assigned") joins storage.objects.name against
-- project_files.storage_path, so it cannot match cover map paths. As a
-- result, supabase.storage.from('project-files').createSignedUrl(...) fails
-- for designers on:
--     storage_path
--     cropped_storage_path
--     raster_storage_path
--
-- This migration adds a parallel SELECT-only policy that matches storage
-- objects whose name equals any of those three columns on a project_cover_maps
-- row whose project is assigned to the calling designer.
--
-- Strictly additive:
--   - Multiple permissive SELECT policies on storage.objects are OR'd by
--     Postgres RLS; existing policies are untouched.
--   - SELECT only — no INSERT / UPDATE / DELETE for designers. Admin
--     uploads/edits cover maps; designer is read-only.
--   - No bucket changes, no schema changes, no data migration.
--
-- Reversible: see DOWN block at the bottom of this file.
-- =============================================================================

DO $$ BEGIN
  CREATE POLICY "project-files: designer read cover maps assigned"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'project-files'
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
      AND EXISTS (
        SELECT 1
        FROM public.project_cover_maps cm
        JOIN public.projects p ON p.id = cm.project_id
        WHERE p.assigned_designer_id = auth.uid()
          AND storage.objects.name IN (
            cm.storage_path,
            cm.cropped_storage_path,
            cm.raster_storage_path
          )
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =============================================================================
-- DOWN (manual rollback — paste into SQL editor or a revert migration)
-- =============================================================================
--
-- DROP POLICY IF EXISTS "project-files: designer read cover maps assigned"
--   ON storage.objects;
--
-- =============================================================================
