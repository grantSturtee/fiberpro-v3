-- =============================================================================
-- client_admin role: schema alignment
-- =============================================================================
-- Adds client_admin as a first-class role in the user_role enum, updates the
-- company_memberships CHECK constraint to allow it, and adds the two
-- client_admin_id foreign-key columns required by the team hierarchy:
--
--   company_memberships.client_admin_id  → which CA a project_manager reports to
--   projects.client_admin_id             → which CA is marked as the project owner
--
-- This migration is purely additive. No existing rows are modified. No RLS
-- policies are changed. No visibility logic is changed.
-- =============================================================================

-- 1. Extend the user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'client_admin';

-- 2. Replace the company_memberships.role CHECK constraint to allow client_admin.
--    PostgreSQL requires DROP + ADD because ALTER CONSTRAINT cannot change the
--    expression, only deferability.
ALTER TABLE company_memberships
  DROP CONSTRAINT IF EXISTS company_memberships_role_check;

ALTER TABLE company_memberships
  ADD CONSTRAINT company_memberships_role_check
    CHECK (role IN ('company_admin', 'client_admin', 'project_manager'));

-- 3. Add client_admin_id to company_memberships
--    Tracks which Client Admin a Project Manager reports to (nullable; PMs can
--    be unassigned or later reassigned to a different Client Admin).
ALTER TABLE company_memberships
  ADD COLUMN IF NOT EXISTS client_admin_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_company_memberships_client_admin
  ON company_memberships (client_admin_id);

-- 4. Add client_admin_id to projects
--    Marks which Client Admin owns / organises this project. Nullable; not all
--    projects will have a Client Admin assigned.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS client_admin_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_client_admin
  ON projects (client_admin_id);
