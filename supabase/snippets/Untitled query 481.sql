ALTER TABLE company_memberships
  DROP CONSTRAINT IF EXISTS company_memberships_role_check;

ALTER TABLE company_memberships
  ADD CONSTRAINT company_memberships_role_check
  CHECK (role IN ('company_admin', 'client_admin', 'project_manager'));

ALTER TABLE company_memberships
  ADD COLUMN IF NOT EXISTS client_admin_id uuid
  REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_company_memberships_client_admin
  ON company_memberships (client_admin_id);

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS client_admin_id uuid
  REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_client_admin
  ON projects (client_admin_id);