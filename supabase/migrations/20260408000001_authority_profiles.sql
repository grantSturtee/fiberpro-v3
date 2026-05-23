-- ── Authority Profiles ────────────────────────────────────────────────────────
-- Represents a permitting authority: state DOT, county, or municipality.
-- Used to drive template selection and output format decisions.

CREATE TABLE IF NOT EXISTS authority_profiles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  type                 text NOT NULL CHECK (type IN ('state', 'county', 'municipality')),
  requires_pe          boolean NOT NULL DEFAULT false,
  requires_coi         boolean NOT NULL DEFAULT false,
  requires_application boolean NOT NULL DEFAULT false,
  submission_method    text,   -- e.g. 'email', 'portal', 'mail'
  output_format        text,   -- e.g. 'plan_set', '8.5x11'
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ── Add authority_id to projects ──────────────────────────────────────────────
-- Nullable initially — existing projects are unaffected.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS authority_id uuid
    REFERENCES authority_profiles(id) ON DELETE SET NULL;
