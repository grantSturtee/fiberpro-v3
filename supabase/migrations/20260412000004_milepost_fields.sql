-- Add optional milepost start/end fields to projects.
-- Stored as text (not numeric) because milepost values may include decimals,
-- direction markers, or non-numeric formats (e.g. "MP 14.3 N").

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS milepost_start text,
  ADD COLUMN IF NOT EXISTS milepost_end   text;
