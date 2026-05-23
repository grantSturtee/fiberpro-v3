-- =============================================================================
-- Submission Tracking Fields
-- =============================================================================
-- Adds the per-project submission detail columns needed to track what happened
-- when the permit package was actually submitted to the authority.
--
-- The project's existing status enum already has the right progression:
--   ready_for_submission → submitted → waiting_on_authority
--   → authority_action_needed → permit_received → closed
--
-- These fields record the specifics of an individual submission:
--   submission_method  — the actual delivery method used (may differ from the
--                        authority's default; admin selects at submission time)
--   recipient_name     — person at the authority who received the package
--   recipient_email    — email address for the receiving contact
--
-- Existing columns that map to the required data model:
--   submission_date           → submitted_at (date)
--   authority_tracking_number → tracking_reference
--   expected_response_date    → expected_response_at
--   permit_received_date      → permit_received_at
--   permit_notes              → submission_notes
-- =============================================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS submission_method  text CHECK (
    submission_method IS NULL OR
    submission_method IN ('email', 'portal', 'mail', 'courier', 'in_person')
  ),
  ADD COLUMN IF NOT EXISTS recipient_name     text,
  ADD COLUMN IF NOT EXISTS recipient_email    text;
