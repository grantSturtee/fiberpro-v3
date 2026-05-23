-- Phase 1 — Cover Map Crop Editor foundation.
--
-- Adds the storage pointer for the full rasterized PDF page and the metadata
-- the future crop editor needs to round-trip a manual crop:
--
--   raster_storage_path  — full-page PNG produced from the uploaded PDF
--                          (always present alongside cropped_storage_path on
--                          new uploads; legacy rows leave it NULL until the
--                          crop editor lazily re-rasterizes them).
--   raster_width / _height — pixel dimensions of the persisted raster, so
--                          the editor can compute zoom/pan in pixel space
--                          without re-reading the file.
--   crop_transform       — authoritative crop in raster pixel coordinates
--                          plus editor-friendly state. Shape (validated in
--                          the server action, not the DB):
--                            {
--                              "cropBox": { "left", "top", "width", "height" },
--                              "output":  { "width": 550, "height": 300 },
--                              "ratio":   1.8333…,
--                              "source":  "auto" | "manual",
--                              "version": 1
--                            }
--
-- All columns are nullable. No constraints, no triggers — the crop editor
-- will validate on write. The renderer continues to read only
-- cropped_storage_path so existing rows render unchanged.

ALTER TABLE public.project_cover_maps
  ADD COLUMN IF NOT EXISTS raster_storage_path text,
  ADD COLUMN IF NOT EXISTS raster_width        integer,
  ADD COLUMN IF NOT EXISTS raster_height       integer,
  ADD COLUMN IF NOT EXISTS crop_transform      jsonb;
