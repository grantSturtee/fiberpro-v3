-- =============================================================================
-- Billing Invoice Fields
-- =============================================================================
-- Adds invoice-level detail columns to the projects table.
--
-- billing_status and estimated_price already exist.
-- These new columns cover the admin-managed invoice lifecycle:
--
--   base_price       — final amount charged (may differ from estimated_price)
--   discount_amount  — any discount applied; total = base_price - discount_amount
--   invoice_number   — reference number assigned at invoicing
--   invoice_notes    — internal billing notes (not visible to company)
--   invoice_sent_at  — when invoice was dispatched to client
--   invoice_paid_at  — when payment was confirmed
-- =============================================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS base_price       numeric(10,2),
  ADD COLUMN IF NOT EXISTS discount_amount  numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_number   text,
  ADD COLUMN IF NOT EXISTS invoice_notes    text,
  ADD COLUMN IF NOT EXISTS invoice_sent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_paid_at  timestamptz;
