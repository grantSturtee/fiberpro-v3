-- Phase G — Cover Map Work Path annotations.
--
-- Adds a nullable jsonb column where the admin can save lightweight polyline
-- linework drawn over the cropped cover map. Points are stored normalized
-- (0..1) to the cropped image dimensions so the same data renders correctly
-- into any template region regardless of size.
--
-- Shape (validated in the server action, not at the DB level):
-- {
--   "paths": [
--     {
--       "id": "uuid-or-string",
--       "points": [{ "x": 0..1, "y": 0..1 }, ...],
--       "stroke": "#ef4444",
--       "strokeWidth": 3
--     }
--   ]
-- }

ALTER TABLE public.project_cover_maps
  ADD COLUMN IF NOT EXISTS annotations jsonb;
