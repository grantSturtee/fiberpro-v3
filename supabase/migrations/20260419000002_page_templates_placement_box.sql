-- Add placement_box to page_templates so wrapper templates (tcp_wrapper,
-- tcd_wrapper, sld_wrapper) can declare the bounding box in which the
-- source drawing is placed.
--
-- Format (PDF coordinate points; 72 pt = 1 inch; origin = bottom-left):
--   { "x": 72, "y": 108, "width": 468, "height": 612 }
--
-- NULL means the wrapper has no configured placement box — runtime will
-- skip wrapper composition and fall back to raw + job-number overlay.
ALTER TABLE page_templates
  ADD COLUMN IF NOT EXISTS placement_box jsonb;
