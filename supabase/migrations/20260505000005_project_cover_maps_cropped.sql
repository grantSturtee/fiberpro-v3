-- Phase F — Cover Map auto-crop.
--
-- Adds a path to the auto-cropped PNG generated from the original cover map
-- upload. The renderer prefers this cropped image when present; legacy rows
-- (uploaded under Phase E without a crop) fall back to storage_path.

ALTER TABLE public.project_cover_maps
  ADD COLUMN IF NOT EXISTS cropped_storage_path text;
