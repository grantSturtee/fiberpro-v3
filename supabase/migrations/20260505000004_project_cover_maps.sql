-- Phase E — Project Cover Map Upload (storage layer).
--
-- A per-project image used as the cover-sheet hero map. One active cover map
-- per project for now. Upload accepts PNG / JPEG / WebP; the renderer embeds
-- it into any page-template image_region bound to sourceKey "project_cover_map".
--
-- Files live in the existing `project-files` bucket under
--   cover-maps/{project_id}/{timestamp}_{safeFileName}.
-- No new bucket; no new file_category enum value (we want this asset isolated
-- from the project_files document workflow — separate table = clean lifecycle).
--
-- Crop / annotation columns are intentionally NOT added here; this phase is
-- upload + storage + render only.

CREATE TABLE IF NOT EXISTS public.project_cover_maps (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  storage_path    text        NOT NULL,
  file_name       text,
  mime_type       text,
  file_size_bytes bigint,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- One active cover map per project. Re-upload UPSERTs against this key.
  CONSTRAINT project_cover_maps_project_id_key UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS project_cover_maps_project_id_idx
  ON public.project_cover_maps (project_id);

-- ── Touch updated_at on UPDATE ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_project_cover_maps_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS project_cover_maps_set_updated_at ON public.project_cover_maps;
CREATE TRIGGER project_cover_maps_set_updated_at
  BEFORE UPDATE ON public.project_cover_maps
  FOR EACH ROW EXECUTE FUNCTION public.tg_project_cover_maps_set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Admins manage cover maps via the admin project page. Service role bypasses
-- RLS, which the renderer and the admin upload action both use anyway.
ALTER TABLE public.project_cover_maps ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "project_cover_maps: admin all"
    ON public.project_cover_maps FOR ALL
    USING ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin')
    WITH CHECK ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin');
EXCEPTION WHEN duplicate_object THEN null; END $$;
