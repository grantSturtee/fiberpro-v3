-- Phase A — Structured project address fields.
--
-- Adds street_address and zip_code to the projects table. Both nullable —
-- existing rows continue to load without backfill. job_name and job_address
-- are intentionally retained for backwards compatibility with PDF mappings
-- and existing display surfaces. Going forward, intake flows write the
-- structured fields and derive job_name / job_address from them server-side.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS street_address text,
  ADD COLUMN IF NOT EXISTS zip_code       text;
