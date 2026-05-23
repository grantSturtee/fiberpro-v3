-- =============================================================================
-- Authority Profiles — Expanded Fields
-- =============================================================================
-- Adds operational intelligence fields to authority_profiles:
-- contacts, submission instructions, checklist flags, and internal notes.

ALTER TABLE authority_profiles
  ADD COLUMN IF NOT EXISTS requires_certification  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_hard_copies    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_certified_check boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_only       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contact_name            text,
  ADD COLUMN IF NOT EXISTS contact_email           text,
  ADD COLUMN IF NOT EXISTS contact_phone           text,
  ADD COLUMN IF NOT EXISTS submission_instructions text,
  ADD COLUMN IF NOT EXISTS internal_notes          text;
