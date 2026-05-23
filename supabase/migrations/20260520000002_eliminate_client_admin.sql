-- =============================================================================
-- Eliminate client_admin role
-- =============================================================================
-- Consolidates the company role model by removing 'client_admin'. Any user
-- previously holding that role becomes a 'project_manager'. The
-- company_memberships.client_admin_id column is left in place (nullable, but
-- forced to NULL here) and will be dropped in a follow-up migration after the
-- application code has stopped reading it.
--
-- DEVIATIONS from original spec (see PR description for context):
--   - 'Null out projects.client_admin_id': SKIPPED — the column does not exist
--     on the projects table in the current schema (was likely dropped or never
--     actually added). Nothing to null.
--   - DROP RLS policy `pm_assignments: client_admin manage own pms`: ADDED.
--     The policy gates on JWT app_metadata.role = 'client_admin', which can
--     never be true after this migration. Removed to avoid dead code.
--   - DROP+ADD company_memberships_role_check CHECK constraint: ADDED. The
--     existing CHECK still lists 'client_admin' as allowed; updated to only
--     permit ('company_admin', 'project_manager').
--
-- Enum-swap technique: Postgres can't drop enum values, so we create a new
-- enum (user_role_v2), migrate the two consuming columns onto it, drop the
-- old type, then rename v2 → user_role.
-- =============================================================================

-- 1. Demote any existing client_admin roles to project_manager (both tables) -
-- user_profiles handled here too because the column type change in step 6
-- requires the data to be coercible to the new enum; any lingering
-- 'client_admin' value would block the ALTER COLUMN TYPE.
UPDATE company_memberships
SET role = 'project_manager'
WHERE role = 'client_admin';

UPDATE user_profiles
SET role = 'project_manager'
WHERE role = 'client_admin';

-- 2. Null out client_admin_id on company_memberships --------------------------
-- (projects.client_admin_id does not exist — skipped, see header.)
UPDATE company_memberships
SET client_admin_id = NULL
WHERE client_admin_id IS NOT NULL;

-- 3. Drop the RLS policy that hard-codes the 'client_admin' role --------------
DROP POLICY IF EXISTS "pm_assignments: client_admin manage own pms"
  ON project_manager_assignments;

-- 4. Drop CHECK constraint that lists 'client_admin' --------------------------
ALTER TABLE company_memberships
  DROP CONSTRAINT IF EXISTS company_memberships_role_check;

-- 5. Create the new enum type --------------------------------------------------
CREATE TYPE user_role_v2 AS ENUM (
  'admin',
  'designer',
  'company_admin',
  'project_manager'
);

-- 6. Migrate the two consuming columns to the new enum ------------------------
ALTER TABLE company_memberships
  ALTER COLUMN role TYPE user_role_v2 USING role::text::user_role_v2;

ALTER TABLE user_profiles
  ALTER COLUMN role TYPE user_role_v2 USING role::text::user_role_v2;

-- 7. Drop the old enum and rename ---------------------------------------------
DROP TYPE user_role;
ALTER TYPE user_role_v2 RENAME TO user_role;

-- 8. Re-add CHECK constraint without 'client_admin' ---------------------------
ALTER TABLE company_memberships
  ADD CONSTRAINT company_memberships_role_check
    CHECK (role IN ('company_admin', 'project_manager'));

-- NOTE: company_memberships.client_admin_id is intentionally LEFT IN PLACE
-- as a nullable column. A follow-up migration will drop it after application
-- code that still references it (if any) has been updated.
