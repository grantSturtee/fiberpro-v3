-- =============================================================================
-- Invoice Send Metadata
-- =============================================================================
-- Adds operational metadata to track who an invoice was sent to and by whom.
-- These fields are written by markInvoiceSent at the moment the invoice is
-- formally dispatched. They are not auto-populated and are never required —
-- billing lifecycle works the same if they're null.
--
-- Fields:
--   invoice_recipient_name  — name of the person/department the invoice
--                             was addressed to (e.g. "AP Department",
--                             "Jane Smith")
--   invoice_recipient_email — email address the invoice was sent to
--   invoice_sent_by         — display name of the admin who clicked
--                             "Mark Invoice Sent" (auto-captured from session)
--   invoice_send_notes      — optional free-text notes about the send
--                             (e.g. "CC'd project manager", "Per client request")
-- =============================================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS invoice_recipient_name   text,
  ADD COLUMN IF NOT EXISTS invoice_recipient_email  text,
  ADD COLUMN IF NOT EXISTS invoice_sent_by          text,
  ADD COLUMN IF NOT EXISTS invoice_send_notes       text;
