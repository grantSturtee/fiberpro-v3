-- =============================================================================
-- Phase 4.8: Jurisdictions system
-- Creates the jurisdictions table and links projects to it.
-- Distinct from jurisdiction_requirements (Phase 4.6 prototype — left intact).
-- =============================================================================

CREATE TABLE IF NOT EXISTS jurisdictions (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Location scope (used for auto-matching from project data)
  state                           text NOT NULL,
  county                          text,
  township                        text,
  authority_name                  text NOT NULL,

  -- Submission logistics
  submission_method               text CHECK (submission_method IN ('online', 'email', 'mail', 'portal')),
  submission_url                  text,
  submission_email                text,

  -- Document requirements
  requires_coi                    boolean NOT NULL DEFAULT false,
  requires_pe_stamp               boolean NOT NULL DEFAULT false,
  requires_traffic_control_plan   boolean NOT NULL DEFAULT false,
  requires_cover_sheet            boolean NOT NULL DEFAULT false,
  requires_application_form       boolean NOT NULL DEFAULT false,

  -- Template references (nullable — linked manually after templates are configured)
  cover_sheet_template_id         uuid REFERENCES cover_sheet_templates(id) ON DELETE SET NULL,
  application_form_template_id    uuid,  -- reserved, no FK constraint yet

  -- Fees (stored as decimals in dollars)
  application_fee                 numeric(10,2),
  jurisdiction_fee                numeric(10,2),

  -- Workflow flags
  requires_review_before_submission boolean NOT NULL DEFAULT false,
  allows_bulk_submission          boolean NOT NULL DEFAULT false,

  -- Timelines
  avg_approval_days               integer,

  -- Meta
  notes                           text,
  is_active                       boolean NOT NULL DEFAULT true,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

-- Add jurisdiction_id to projects (nullable — older projects have no match yet)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS jurisdiction_id uuid REFERENCES jurisdictions(id) ON DELETE SET NULL;

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE jurisdictions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "admin_all_jurisdictions" ON jurisdictions
    FOR ALL
    USING ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "internal_read_active_jurisdictions" ON jurisdictions
    FOR SELECT
    USING (
      is_active = true
      AND (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' IN ('admin', 'designer', 'company_admin', 'project_manager')
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── updated_at trigger ────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TRIGGER set_jurisdictions_updated_at
    BEFORE UPDATE ON jurisdictions
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
EXCEPTION WHEN duplicate_object THEN null; END $$;
