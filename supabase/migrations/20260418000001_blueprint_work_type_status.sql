-- Migration: Add work_type and status to package_blueprints
--
-- Phase 1 of blueprint-first refactor.
-- Adds work_type (aerial|underground) and status (draft|active|inactive).
-- Backfills status from is_active.
-- is_active and the existing unique index are intentionally preserved
-- for backward compatibility — they will be removed in a later phase.
-- The new status-based unique index is deferred until work_type is
-- populated on all rows.

ALTER TABLE package_blueprints
  ADD COLUMN IF NOT EXISTS work_type text
    CHECK (work_type IN ('aerial', 'underground')),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'inactive'));

-- Backfill status from is_active on all existing rows
UPDATE package_blueprints
  SET status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END;
