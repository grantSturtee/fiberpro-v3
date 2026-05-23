-- =============================================================================
-- project_cover_maps: assigned-designer read access (Issue 2 Phase A)
-- =============================================================================
-- The base table policy (20260505000004_project_cover_maps.sql) granted ALL
-- operations to admins only. Designers querying via the session client got
-- silent zero-row results, so the designer Project page rendered "No cover
-- map uploaded" even though admin had uploaded one.
--
-- This migration adds a SELECT-only policy mirroring the assignment-scoped
-- pattern already in use across the schema (see 20260412000005, 20260412000009,
-- 20260406000013): role = 'designer' AND projects.assigned_designer_id matches
-- auth.uid() for the cover map's project_id.
--
-- Strictly additive:
--   - No change to the existing admin-all policy.
--   - No INSERT / UPDATE / DELETE for designers.
--   - No data migration; no column changes.
--
-- Reversible: DROP POLICY at the bottom of this file.
-- =============================================================================

DO $$ BEGIN
  CREATE POLICY "project_cover_maps: designer read assigned"
    ON public.project_cover_maps FOR SELECT
    USING (
      (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
      AND EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.id = project_cover_maps.project_id
          AND p.assigned_designer_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =============================================================================
-- DOWN (manual rollback — paste into SQL editor or a revert migration)
-- =============================================================================
--
-- DROP POLICY IF EXISTS "project_cover_maps: designer read assigned"
--   ON public.project_cover_maps;
--
-- =============================================================================
