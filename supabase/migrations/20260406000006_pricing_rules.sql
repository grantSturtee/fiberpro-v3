-- =============================================================================
-- Pricing Rules Engine
-- Replaces the old cents-based pricing_rules table with the new decimal schema.
-- =============================================================================

-- Drop old table (dev environment, no real data)
DROP TABLE IF EXISTS pricing_rules CASCADE;

CREATE TABLE pricing_rules (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text        NOT NULL,

  -- Scope (null = wildcard / applies to all)
  state                    text,
  county                   text,
  authority_type           text,

  -- Pricing factors
  base_project_fee         numeric(10,2) NOT NULL DEFAULT 0,
  per_sheet_fee            numeric(10,2) NOT NULL DEFAULT 0,
  per_mile_fee             numeric(10,2),
  rush_fee                 numeric(10,2),

  -- Plan-type multipliers (applied to base + sheet subtotal)
  aerial_multiplier        numeric(6,4)  NOT NULL DEFAULT 1,
  underground_multiplier   numeric(6,4)  NOT NULL DEFAULT 1,
  complexity_multiplier    numeric(6,4)  NOT NULL DEFAULT 1,

  -- Jurisdiction fee pass-throughs
  include_application_fee  boolean       NOT NULL DEFAULT false,
  include_jurisdiction_fee boolean       NOT NULL DEFAULT false,
  fiberpro_admin_fee       numeric(10,2) NOT NULL DEFAULT 0,

  -- Sheet count gate (optional range filter)
  min_sheets               integer,
  max_sheets               integer,

  -- Metadata
  is_active                boolean       NOT NULL DEFAULT true,
  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now()
);

-- Trigger: keep updated_at current
CREATE OR REPLACE FUNCTION set_pricing_rules_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER pricing_rules_updated_at
  BEFORE UPDATE ON pricing_rules
  FOR EACH ROW EXECUTE FUNCTION set_pricing_rules_updated_at();

-- RLS
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "admin_all_pricing_rules" ON pricing_rules
    FOR ALL USING (
      (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "internal_read_active_pricing_rules" ON pricing_rules
    FOR SELECT USING (
      is_active = true AND
      (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' IN ('admin', 'designer')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- Add estimated_price to projects
-- =============================================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS estimated_price   numeric(10,2),
  ADD COLUMN IF NOT EXISTS pricing_rule_id   uuid REFERENCES pricing_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sheet_count       integer;
