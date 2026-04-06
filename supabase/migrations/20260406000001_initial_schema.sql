-- =============================================================================
-- FiberPro V3 — Initial Schema
-- =============================================================================
-- Run this via: supabase db push  OR  paste into Supabase SQL editor
--
-- Design notes:
--   · All IDs are UUIDs with gen_random_uuid() defaults
--   · Timestamps are UTC, using timestamptz
--   · auth.users is the identity source; user_profiles extends it
--   · app_metadata.role drives route access (set server-side by admin)
--   · project job_number is auto-generated: FP-{year}-{seq:04d}
--   · RLS is enabled on all tables; policies are conservative by default
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enumerations (stored as text with check constraints for flexibility)
-- These match the TypeScript types in src/types/
-- ---------------------------------------------------------------------------

-- project_status values
DO $$ BEGIN
  CREATE TYPE project_status AS ENUM (
    'intake_review',
    'waiting_on_client',
    'ready_for_assignment',
    'assigned',
    'in_design',
    'waiting_for_admin_review',
    'revisions_required',
    'approved',
    'package_generating',
    'ready_for_submission',
    'submitted',
    'waiting_on_authority',
    'authority_action_needed',
    'permit_received',
    'closed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- billing_status values
DO $$ BEGIN
  CREATE TYPE billing_status AS ENUM (
    'not_ready',
    'ready_to_invoice',
    'draft_invoice',
    'invoiced',
    'partially_paid',
    'paid',
    'hold'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- file_category values
DO $$ BEGIN
  CREATE TYPE file_category AS ENUM (
    'intake_attachment',
    'source_map',
    'client_reference',
    'tcp_pdf',
    'tcp_source',
    'tcd_sheet',
    'sld_sheet',
    'application_form',
    'cover_sheet',
    'permit_package',
    'permit_document',
    'coi',
    'pe_stamp',
    'invoice_attachment',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- user_role values
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'admin',
    'designer',
    'company_admin',
    'project_manager'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- authority_type values
DO $$ BEGIN
  CREATE TYPE authority_type AS ENUM (
    'county',
    'njdot',
    'municipal',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- plan_type values
DO $$ BEGIN
  CREATE TYPE plan_type AS ENUM (
    'aerial',
    'underground',
    'mixed',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- job_type values
DO $$ BEGIN
  CREATE TYPE job_type AS ENUM (
    'tcp',
    'sld',
    'full_package',
    'revision',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- workflow_job_status values
DO $$ BEGIN
  CREATE TYPE workflow_job_status AS ENUM (
    'queued',
    'running',
    'completed',
    'failed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- workflow_job_type values
DO $$ BEGIN
  CREATE TYPE workflow_job_type AS ENUM (
    'package_generation',
    'pdf_assembly',
    'permit_submission',
    'invoice_generation'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- Sequence for FP job numbers
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS project_job_number_seq START 1;

-- ---------------------------------------------------------------------------
-- user_profiles
-- Extends auth.users with app-level profile data.
-- Role is authoritative here; must also be set in auth.users.app_metadata.role
-- for middleware JWT access without DB round-trip.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role            user_role NOT NULL,
  display_name    text NOT NULL DEFAULT '',
  email           text NOT NULL DEFAULT '',  -- denormalized, sync from auth.users
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile; admins can read all
CREATE POLICY "user_profiles: own read"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "user_profiles: admin read all"
  ON user_profiles FOR SELECT
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
  );

CREATE POLICY "user_profiles: admin manage"
  ON user_profiles FOR ALL
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
  );

-- ---------------------------------------------------------------------------
-- companies
-- External client companies that submit projects.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS companies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text UNIQUE,              -- url-safe identifier
  billing_email   text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Admins can do anything
CREATE POLICY "companies: admin all"
  ON companies FOR ALL
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
  );

-- ---------------------------------------------------------------------------
-- company_memberships
-- Links external users (company_admin / project_manager) to a company.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS company_memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            user_role NOT NULL CHECK (role IN ('company_admin', 'project_manager')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);

ALTER TABLE company_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_memberships: admin all"
  ON company_memberships FOR ALL
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
  );

CREATE POLICY "company_memberships: own read"
  ON company_memberships FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "companies: member read"
  ON companies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM company_memberships cm
      WHERE cm.company_id = companies.id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "companies: designer read"
  ON companies FOR SELECT
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
  );
  
-- ---------------------------------------------------------------------------
-- projects
-- Core project record. All workflow state lives here and in related tables.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS projects (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number                text UNIQUE NOT NULL,   -- FP-{year}-{seq:04d}, set by trigger
  company_id                uuid NOT NULL REFERENCES companies(id),
  submitted_by              uuid REFERENCES auth.users(id),

  -- Workflow state
  status                    project_status NOT NULL DEFAULT 'intake_review',
  billing_status            billing_status NOT NULL DEFAULT 'not_ready',

  -- Intake fields (submitted by company user)
  job_name                  text NOT NULL,
  job_number_client         text,             -- client's internal reference
  rhino_pm                  text,             -- Rhino project manager name
  comcast_manager           text,             -- client-side manager name
  submitted_to_fiberpro     date,             -- date client submitted to FiberPro
  requested_approval_date   date,
  job_address               text,
  authority_type            authority_type,
  county                    text,
  city                      text,
  township                  text,
  type_of_plan              plan_type,
  job_type                  job_type,
  notes                     text,

  -- Assignment (set by admin)
  assigned_designer_id      uuid REFERENCES auth.users(id),
  assigned_at               timestamptz,

  -- Permit tracking (set by admin after submission)
  submission_date           date,
  authority_tracking_number text,
  expected_response_date    date,
  permit_received_date      date,
  permit_notes              text,

  -- Timestamps
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Admins can do anything
CREATE POLICY "projects: admin all"
  ON projects FOR ALL
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
  );

-- Designers can read assigned projects (and all projects for list view)
CREATE POLICY "projects: designer read"
  ON projects FOR SELECT
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
  );

-- Company members can read their own company's projects
CREATE POLICY "projects: company member read"
  ON projects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM company_memberships cm
      WHERE cm.company_id = projects.company_id
        AND cm.user_id = auth.uid()
    )
  );

-- Company members can create projects for their company
CREATE POLICY "projects: company member insert"
  ON projects FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_memberships cm
      WHERE cm.company_id = projects.company_id
        AND cm.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Function + Trigger: auto-generate job_number
-- Format: FP-{YYYY}-{NNNN zero-padded to 4 digits}
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION generate_job_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.job_number := 'FP-' || to_char(now(), 'YYYY') || '-' ||
                    lpad(nextval('project_job_number_seq')::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_job_number ON projects;
CREATE TRIGGER set_job_number
  BEFORE INSERT ON projects
  FOR EACH ROW
  WHEN (NEW.job_number IS NULL OR NEW.job_number = '')
  EXECUTE FUNCTION generate_job_number();

-- ---------------------------------------------------------------------------
-- project_files
-- File records for all uploads associated with a project.
-- Actual bytes live in Supabase Storage bucket "project-files".
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS project_files (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_by     uuid REFERENCES auth.users(id),
  file_category   file_category NOT NULL,
  file_name       text NOT NULL,
  storage_path    text NOT NULL,  -- path within "project-files" bucket
  file_size_bytes bigint,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_files: admin all"
  ON project_files FOR ALL
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
  );

CREATE POLICY "project_files: designer read"
  ON project_files FOR SELECT
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
  );

CREATE POLICY "project_files: designer upload tcp"
  ON project_files FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
    AND file_category = 'tcp_pdf'
  );

CREATE POLICY "project_files: company member read"
  ON project_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM projects p
      JOIN company_memberships cm ON cm.company_id = p.company_id
      WHERE p.id = project_files.project_id
        AND cm.user_id = auth.uid()
    )
    -- Only show intake attachments and permit-related docs to company
    AND file_category IN ('intake_attachment', 'permit_package', 'permit_document')
  );

-- Company members can upload intake attachments during submission
CREATE POLICY "project_files: company member intake upload"
  ON project_files FOR INSERT
  WITH CHECK (
    file_category = 'intake_attachment'
    AND EXISTS (
      SELECT 1
      FROM projects p
      JOIN company_memberships cm ON cm.company_id = p.company_id
      WHERE p.id = project_files.project_id
        AND cm.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- tcd_library
-- Reusable TCD (Traffic Control Device) sheet library — system-level config.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tcd_library (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text UNIQUE NOT NULL,       -- e.g. "TCD-1"
  description     text NOT NULL,
  category        text,                       -- e.g. "shoulder", "lane", "highway"
  storage_path    text,                       -- PDF file in "tcd-library" bucket
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tcd_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tcd_library: admin all"
  ON tcd_library FOR ALL
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
  );

CREATE POLICY "tcd_library: designer read"
  ON tcd_library FOR SELECT
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' IN ('admin', 'designer')
  );

-- ---------------------------------------------------------------------------
-- project_tcd_selections
-- Which TCD library items have been attached to a project by admin.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS project_tcd_selections (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tcd_library_item_id uuid NOT NULL REFERENCES tcd_library(id),
  added_by            uuid REFERENCES auth.users(id),
  sort_order          integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, tcd_library_item_id)
);

ALTER TABLE project_tcd_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_tcd_selections: admin all"
  ON project_tcd_selections FOR ALL
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
  );

CREATE POLICY "project_tcd_selections: designer read"
  ON project_tcd_selections FOR SELECT
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' IN ('admin', 'designer')
  );

-- ---------------------------------------------------------------------------
-- cover_sheet_templates
-- Authority-specific cover sheet templates — system-level config.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cover_sheet_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  authority_type  authority_type,
  county          text,                       -- county-specific override
  storage_path    text,                       -- PDF in "cover-templates" bucket
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cover_sheet_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cover_sheet_templates: admin all"
  ON cover_sheet_templates FOR ALL
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
  );

CREATE POLICY "cover_sheet_templates: designer read"
  ON cover_sheet_templates FOR SELECT
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' IN ('admin', 'designer')
  );

-- ---------------------------------------------------------------------------
-- pricing_rules
-- Per-job-type / per-authority base pricing rules — settings-level.
-- Actual invoicing is handled in a future billing phase.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pricing_rules (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label                 text NOT NULL,
  job_type              job_type,             -- NULL = applies to all job types
  authority_type        authority_type,       -- NULL = applies to all authorities
  base_amount_cents     integer,              -- in cents (USD)
  notes                 text,
  is_active             boolean NOT NULL DEFAULT true,
  sort_order            integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pricing_rules: admin all"
  ON pricing_rules FOR ALL
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
  );

-- ---------------------------------------------------------------------------
-- project_activity
-- Internal audit trail for all significant project events.
-- Not visible to company users.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS project_activity (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_id        uuid REFERENCES auth.users(id),
  actor_label     text NOT NULL DEFAULT '',   -- display name snapshot
  action          text NOT NULL,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_activity: admin all"
  ON project_activity FOR ALL
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
  );

CREATE POLICY "project_activity: designer read own"
  ON project_activity FOR SELECT
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_activity.project_id
        AND p.assigned_designer_id = auth.uid()
    )
  );

CREATE POLICY "project_activity: internal insert"
  ON project_activity FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' IN ('admin', 'designer')
  );

-- ---------------------------------------------------------------------------
-- project_messages
-- Comment/message thread on a project. Can be internal-only or visible to company.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS project_messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sender_id             uuid REFERENCES auth.users(id),
  sender_label          text NOT NULL DEFAULT '',
  body                  text NOT NULL,
  visible_to_company    boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_messages: admin all"
  ON project_messages FOR ALL
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
  );

CREATE POLICY "project_messages: designer read assigned"
  ON project_messages FOR SELECT
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_messages.project_id
        AND p.assigned_designer_id = auth.uid()
    )
  );

CREATE POLICY "project_messages: company read visible"
  ON project_messages FOR SELECT
  USING (
    visible_to_company = true
    AND EXISTS (
      SELECT 1
      FROM projects p
      JOIN company_memberships cm ON cm.company_id = p.company_id
      WHERE p.id = project_messages.project_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "project_messages: company insert"
  ON project_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM projects p
      JOIN company_memberships cm ON cm.company_id = p.company_id
      WHERE p.id = project_messages.project_id
        AND cm.user_id = auth.uid()
    )
    -- Company messages are always sent to FiberPro; company cannot set visible_to_company
    AND visible_to_company = false
  );

-- ---------------------------------------------------------------------------
-- workflow_jobs
-- Tracks async jobs (package generation, etc.). n8n consumes these.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workflow_jobs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_type            workflow_job_type NOT NULL,
  status              workflow_job_status NOT NULL DEFAULT 'queued',
  triggered_by        uuid REFERENCES auth.users(id),
  n8n_execution_id    text,
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);

ALTER TABLE workflow_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_jobs: admin all"
  ON workflow_jobs FOR ALL
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
  );

CREATE POLICY "workflow_jobs: designer read"
  ON workflow_jobs FOR SELECT
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
  );

-- ---------------------------------------------------------------------------
-- updated_at triggers — keep updated_at current on writes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_updated_at ON user_profiles;
CREATE TRIGGER touch_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS touch_updated_at ON companies;
CREATE TRIGGER touch_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS touch_updated_at ON projects;
CREATE TRIGGER touch_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes — support common query patterns
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_projects_company_id       ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_status            ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_assigned_designer ON projects(assigned_designer_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_at        ON projects(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_files_project_id  ON project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_project_activity_project   ON project_activity(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_messages_project   ON project_messages(project_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_workflow_jobs_project      ON workflow_jobs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_memberships_user   ON company_memberships(user_id);

-- ---------------------------------------------------------------------------
-- Seed: TCD Library placeholder data (mirrors TCD_LIBRARY_PLACEHOLDER in constants)
-- These should be replaced/extended with real TCD sheets via admin UI later.
-- ---------------------------------------------------------------------------

INSERT INTO tcd_library (code, description, category, sort_order) VALUES
  ('TCD-1', 'Single lane shoulder closure, no flaggers',        'shoulder',     10),
  ('TCD-2', 'Divided highway shoulder closure, no flaggers',    'shoulder',     20),
  ('TCD-3', 'Single lane closure with flaggers',                'lane',         30),
  ('TCD-4', 'Two-way, one-lane alternating traffic',            'lane',         40),
  ('TCD-5', 'Ramp closure — standard configuration',           'ramp',         50),
  ('TCD-6', 'Expressway work zone with lane shift',             'highway',      60),
  ('TCD-7', 'Intersection work zone — T-configuration',        'intersection', 70)
ON CONFLICT (code) DO NOTHING;
