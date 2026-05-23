-- =============================================================================
-- Unified project status: collapses (status, billing_status) into one column
-- =============================================================================
-- Introduces a single canonical `unified_status` column on projects, plus an
-- orthogonal `billing_on_hold` boolean to carry the 'hold' flag that
-- previously lived inside billing_status.
--
-- The legacy `status` and `billing_status` columns are intentionally LEFT IN
-- PLACE. A follow-up migration will drop them once all reads/writes are
-- switched over and any analytics/reporting jobs have been updated.
--
-- WARNING — Fallback behavior:
-- Any project row whose existing (status, billing_status) pair is not
-- explicitly mapped below falls through to 'new_project'. The DO block at the
-- end of this migration counts those rows and emits a RAISE WARNING with the
-- count so it shows up in migration output. Inspect the listed rows after the
-- migration and either correct them manually or extend the mapping.
-- =============================================================================

-- 1. New enum type --------------------------------------------------------------
CREATE TYPE unified_project_status AS ENUM (
  'new_project',
  'in_production',
  'pending_review',
  'billing_ready',
  'invoice_sent',
  'sub_bill_now',
  'permit_billed',
  'paid_complete',
  'cancelled'
);

-- 2. Add columns (nullable for now so we can populate before SET NOT NULL) ------
ALTER TABLE projects
  ADD COLUMN unified_status   unified_project_status,
  ADD COLUMN billing_on_hold  boolean NOT NULL DEFAULT false;

-- 3. Populate billing_on_hold ---------------------------------------------------
UPDATE projects
SET billing_on_hold = true
WHERE billing_status = 'hold';

-- 4. Populate unified_status from existing (status, billing_status) -------------
UPDATE projects
SET unified_status = CASE
  -- Cancelled (any billing_status)
  WHEN status = 'cancelled' THEN 'cancelled'::unified_project_status

  -- Early stage (billing always not_ready)
  WHEN status = 'intake_review'            AND billing_status = 'not_ready'        THEN 'new_project'::unified_project_status
  WHEN status = 'waiting_on_client'        AND billing_status = 'not_ready'        THEN 'new_project'::unified_project_status
  WHEN status = 'ready_for_assignment'     AND billing_status = 'not_ready'        THEN 'new_project'::unified_project_status
  WHEN status = 'assigned'                 AND billing_status = 'not_ready'        THEN 'in_production'::unified_project_status
  WHEN status = 'in_design'                AND billing_status = 'not_ready'        THEN 'in_production'::unified_project_status
  WHEN status = 'revisions_required'       AND billing_status = 'not_ready'        THEN 'in_production'::unified_project_status
  WHEN status = 'waiting_for_admin_review' AND billing_status = 'not_ready'        THEN 'pending_review'::unified_project_status
  WHEN status = 'approved'                 AND billing_status = 'not_ready'        THEN 'pending_review'::unified_project_status
  WHEN status = 'approved'                 AND billing_status = 'ready_to_invoice' THEN 'billing_ready'::unified_project_status
  WHEN status = 'approved'                 AND billing_status = 'draft_invoice'    THEN 'billing_ready'::unified_project_status
  WHEN status = 'approved'                 AND billing_status = 'invoiced'         THEN 'invoice_sent'::unified_project_status
  WHEN status = 'approved'                 AND billing_status = 'partially_paid'   THEN 'invoice_sent'::unified_project_status
  WHEN status = 'package_generating'       AND billing_status = 'not_ready'        THEN 'pending_review'::unified_project_status

  -- Package exists, ready_for_submission
  WHEN status = 'ready_for_submission'     AND billing_status = 'ready_to_invoice' THEN 'billing_ready'::unified_project_status
  WHEN status = 'ready_for_submission'     AND billing_status = 'draft_invoice'    THEN 'billing_ready'::unified_project_status
  WHEN status = 'ready_for_submission'     AND billing_status = 'invoiced'         THEN 'invoice_sent'::unified_project_status
  WHEN status = 'ready_for_submission'     AND billing_status = 'partially_paid'   THEN 'invoice_sent'::unified_project_status

  -- Submitted
  WHEN status = 'submitted'                AND billing_status = 'ready_to_invoice' THEN 'sub_bill_now'::unified_project_status
  WHEN status = 'submitted'                AND billing_status = 'draft_invoice'    THEN 'sub_bill_now'::unified_project_status
  WHEN status = 'submitted'                AND billing_status = 'invoiced'         THEN 'permit_billed'::unified_project_status
  WHEN status = 'submitted'                AND billing_status = 'partially_paid'   THEN 'permit_billed'::unified_project_status

  -- Waiting on authority
  WHEN status = 'waiting_on_authority'     AND billing_status = 'ready_to_invoice' THEN 'sub_bill_now'::unified_project_status
  WHEN status = 'waiting_on_authority'     AND billing_status = 'draft_invoice'    THEN 'sub_bill_now'::unified_project_status
  WHEN status = 'waiting_on_authority'     AND billing_status = 'invoiced'         THEN 'permit_billed'::unified_project_status
  WHEN status = 'waiting_on_authority'     AND billing_status = 'partially_paid'   THEN 'permit_billed'::unified_project_status

  -- Authority action needed
  WHEN status = 'authority_action_needed'  AND billing_status = 'ready_to_invoice' THEN 'sub_bill_now'::unified_project_status
  WHEN status = 'authority_action_needed'  AND billing_status = 'invoiced'         THEN 'permit_billed'::unified_project_status

  -- Permit received
  WHEN status = 'permit_received'          AND billing_status = 'invoiced'         THEN 'permit_billed'::unified_project_status
  WHEN status = 'permit_received'          AND billing_status = 'partially_paid'   THEN 'permit_billed'::unified_project_status
  WHEN status = 'permit_received'          AND billing_status = 'paid'             THEN 'paid_complete'::unified_project_status

  -- Closed
  WHEN status = 'closed'                   AND billing_status = 'paid'             THEN 'paid_complete'::unified_project_status
  WHEN status = 'closed'                   AND billing_status = 'invoiced'         THEN 'permit_billed'::unified_project_status

  -- Fallback: see RAISE WARNING below
  ELSE 'new_project'::unified_project_status
END;

-- 5. Warn on any unmapped (status, billing_status) pairs ------------------------
-- Recomputes the "did not match the explicit mapping" predicate so we can
-- surface a count in migration output. If unmatched_count > 0, run the
-- diagnostic SELECT below against the live DB to inspect the offenders.
DO $$
DECLARE
  unmatched_count integer;
BEGIN
  SELECT count(*) INTO unmatched_count
  FROM projects
  WHERE status <> 'cancelled'
    AND (status::text, billing_status::text) NOT IN (
      ('intake_review','not_ready'),
      ('waiting_on_client','not_ready'),
      ('ready_for_assignment','not_ready'),
      ('assigned','not_ready'),
      ('in_design','not_ready'),
      ('revisions_required','not_ready'),
      ('waiting_for_admin_review','not_ready'),
      ('approved','not_ready'),
      ('approved','ready_to_invoice'),
      ('approved','draft_invoice'),
      ('approved','invoiced'),
      ('approved','partially_paid'),
      ('package_generating','not_ready'),
      ('ready_for_submission','ready_to_invoice'),
      ('ready_for_submission','draft_invoice'),
      ('ready_for_submission','invoiced'),
      ('ready_for_submission','partially_paid'),
      ('submitted','ready_to_invoice'),
      ('submitted','draft_invoice'),
      ('submitted','invoiced'),
      ('submitted','partially_paid'),
      ('waiting_on_authority','ready_to_invoice'),
      ('waiting_on_authority','draft_invoice'),
      ('waiting_on_authority','invoiced'),
      ('waiting_on_authority','partially_paid'),
      ('authority_action_needed','ready_to_invoice'),
      ('authority_action_needed','invoiced'),
      ('permit_received','invoiced'),
      ('permit_received','partially_paid'),
      ('permit_received','paid'),
      ('closed','paid'),
      ('closed','invoiced')
    );

  IF unmatched_count > 0 THEN
    RAISE WARNING
      'unified_project_status: % project row(s) had an unmapped (status, billing_status) pair and were defaulted to ''new_project''. Diagnose with: SELECT id, job_number, status, billing_status FROM projects WHERE unified_status = ''new_project'' AND status NOT IN (''intake_review'', ''waiting_on_client'', ''ready_for_assignment'');',
      unmatched_count;
  END IF;
END
$$;

-- 6. Lock the column down -------------------------------------------------------
ALTER TABLE projects
  ALTER COLUMN unified_status SET NOT NULL;
