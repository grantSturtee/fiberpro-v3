-- =============================================================================
-- Drop company_memberships.client_admin_id
-- =============================================================================
-- The client_admin role was eliminated in migration 20260520000002. All
-- values in this column were forced to NULL at that time, and the Pass 3
-- app-code cleanup removed every read and write of the column. It is now
-- safe to drop.
--
-- Note: projects.client_admin_id was added by migration 20260429000001 but is
-- already absent from the projects table in the current schema (it was either
-- never applied or rolled back via a later migration not present in the
-- migrations/ directory). Nothing to drop there.
-- =============================================================================

-- The supporting index idx_company_memberships_client_admin is cascaded
-- automatically when the column is dropped.
ALTER TABLE company_memberships
  DROP COLUMN IF EXISTS client_admin_id;
