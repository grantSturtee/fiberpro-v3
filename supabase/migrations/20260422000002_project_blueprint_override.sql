-- ── Project Blueprint Override ─────────────────────────────────────────────────
-- Allows admin to select a specific package blueprint for a project, overriding
-- the authority's default active blueprint.
--
-- NULL  = use the authority's current active blueprint (existing behaviour)
-- set   = use this specific blueprint regardless of authority default
--
-- ON DELETE SET NULL: if the selected blueprint is later deleted or deactivated,
-- the project silently reverts to authority-default behaviour (safer than blocking
-- the delete or leaving a dangling FK).

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS blueprint_id uuid
    REFERENCES package_blueprints(id) ON DELETE SET NULL;

COMMENT ON COLUMN projects.blueprint_id IS
  'NULL = use authority active blueprint; set = admin-selected package template override';
