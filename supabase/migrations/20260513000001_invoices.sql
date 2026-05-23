-- =============================================================================
-- Phase A — Invoice data foundation
-- =============================================================================
-- Introduces invoices as first-class entities, separate from the denormalized
-- billing columns currently stored on the projects row. This migration is
-- purely additive:
--   * creates two new tables (invoices, invoice_line_items)
--   * creates the invoice numbering sequence + BEFORE INSERT trigger
--   * reuses the existing touch_updated_at() function for the updated_at
--     trigger on invoices
--   * adds a nullable project_files.invoice_id FK so a generated invoice PDF
--     can be linked back to its invoice row (column unused until Phase B)
--
-- Nothing in this migration modifies existing rows, columns, or policies.
-- Rollback drops the two tables, the sequence, the trigger function, and the
-- project_files.invoice_id column.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoices (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid          NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,

  invoice_number      text          NOT NULL,
  status              text          NOT NULL DEFAULT 'draft',
  invoice_date        date          NOT NULL DEFAULT CURRENT_DATE,
  due_date            date,

  -- Money (all USD; numeric(10,2) for cent-accurate sums up to $99,999,999.99)
  subtotal            numeric(10,2) NOT NULL DEFAULT 0,
  discount_amount     numeric(10,2) NOT NULL DEFAULT 0,
  total_amount        numeric(10,2) NOT NULL DEFAULT 0,

  -- Frozen snapshot of every input that drove the total (shape: PricingSnapshotV1).
  pricing_snapshot    jsonb         NOT NULL DEFAULT '{}'::jsonb,

  -- Internal-only notes. Postgres has no column-level RLS; application code
  -- MUST avoid selecting this column in company-facing queries.
  invoice_notes       text,

  -- Delivery metadata (captured on send)
  recipient_name      text,
  recipient_email     text,
  send_notes          text,

  -- Lifecycle timestamps
  sent_at             timestamptz,
  sent_by             text,                                          -- display name snapshot (no FK)
  paid_at             timestamptz,
  paid_amount         numeric(10,2),                                 -- nullable; NULL = unpaid
  voided_at           timestamptz,
  voided_reason       text,

  -- Supplemental / credit notes (cheap to support now; FK is the only schema work)
  parent_invoice_id   uuid          REFERENCES invoices(id) ON DELETE RESTRICT,

  -- Persisted PDF location (bucket-relative path; set on first send)
  pdf_storage_path    text,

  -- Audit
  created_by          text          NOT NULL,                        -- display name snapshot
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),

  -- Constraints (named for clarity in error messages)
  CONSTRAINT invoices_status_check
    CHECK (status IN ('draft','sent','partially_paid','paid','void','hold')),

  CONSTRAINT invoices_invoice_number_unique
    UNIQUE (invoice_number),

  CONSTRAINT invoices_discount_nonneg
    CHECK (discount_amount >= 0),

  -- Negative totals only allowed for credit notes (parent_invoice_id set)
  CONSTRAINT invoices_total_nonneg
    CHECK (total_amount >= 0 OR parent_invoice_id IS NOT NULL),

  CONSTRAINT invoices_paid_amount_nonneg
    CHECK (paid_amount IS NULL OR paid_amount >= 0),

  -- Payment can't exceed total (1¢ tolerance for floating math)
  CONSTRAINT invoices_paid_amount_max
    CHECK (paid_amount IS NULL OR paid_amount <= total_amount + 0.01),

  -- Sent invoices must have a persisted PDF
  CONSTRAINT invoices_sent_has_pdf
    CHECK (status = 'draft' OR pdf_storage_path IS NOT NULL),

  -- Paid statuses require a sent_at
  CONSTRAINT invoices_paid_after_sent
    CHECK (status NOT IN ('partially_paid','paid') OR sent_at IS NOT NULL),

  -- Voided invoices require a reason
  CONSTRAINT invoices_voided_has_reason
    CHECK (status <> 'void' OR voided_reason IS NOT NULL)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_project_created
  ON invoices(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_status_active
  ON invoices(status)
  WHERE status IN ('draft','sent','partially_paid','hold');

CREATE INDEX IF NOT EXISTS idx_invoices_sent_aging
  ON invoices(sent_at DESC)
  WHERE status IN ('sent','partially_paid');

CREATE INDEX IF NOT EXISTS idx_invoices_parent
  ON invoices(parent_invoice_id)
  WHERE parent_invoice_id IS NOT NULL;

-- updated_at trigger (reuses the existing touch_updated_at function defined
-- in the initial schema migration).
DROP TRIGGER IF EXISTS touch_updated_at ON invoices;
CREATE TRIGGER touch_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- ---------------------------------------------------------------------------
-- invoice_line_items
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid          NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,

  description   text          NOT NULL,
  quantity      numeric(10,2) NOT NULL DEFAULT 1,
  unit_price    numeric(10,2) NOT NULL,
  line_total    numeric(10,2) NOT NULL,                              -- denormalized; computed by caller
  sort_order    integer       NOT NULL DEFAULT 0,

  -- Optional structured tagging (e.g., line item type for future accounting export)
  metadata      jsonb         NOT NULL DEFAULT '{}'::jsonb,

  created_at    timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT invoice_line_items_quantity_nonneg
    CHECK (quantity >= 0),

  -- unit_price may be negative for credit-note rows; line_total must always
  -- equal round(quantity * unit_price, 2) so the caller can't desync it.
  CONSTRAINT invoice_line_items_total_matches
    CHECK (line_total = ROUND(quantity * unit_price, 2))
);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_sort
  ON invoice_line_items(invoice_id, sort_order);


-- ---------------------------------------------------------------------------
-- Invoice number generation
--
-- Format:
--   Standalone:    INV-YYYY-NNNN   (e.g. INV-2026-0001)
--   Supplemental:  {parent}-S{N}   (e.g. INV-2026-0042-S1, -S2)
--
-- A single global sequence is used (not per-year reset). The year prefix is
-- purely a display element. This mirrors the existing generate_job_number()
-- pattern for projects (FP-YYYY-NNNN) — concurrency-safe and simple.
--
-- Tradeoff vs per-year-reset: numbers grow monotonically across years
-- (e.g. INV-2026-9999 → INV-2027-10000). Acceptable for GRANTED's volume.
-- A future migration could swap in per-year sequences via dynamic SQL if
-- needed; this version trades that flexibility for reliability.
--
-- Concurrency note for supplementals: two parallel inserts on the same parent
-- could both compute the same -SN suffix. The UNIQUE (invoice_number) constraint
-- will reject the second; callers must retry. Document this in the supplemental
-- creation action when it lands in Phase B.
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq;

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  parent_num    text;
  sibling_count integer;
BEGIN
  IF NEW.parent_invoice_id IS NULL THEN
    -- Standalone: INV-YYYY-NNNN, year from invoice_date
    NEW.invoice_number :=
      'INV-' || to_char(COALESCE(NEW.invoice_date, CURRENT_DATE), 'YYYY')
      || '-' || lpad(nextval('invoice_number_seq')::text, 4, '0');
  ELSE
    -- Supplemental / credit: parent's number + -S{n+1}
    SELECT invoice_number INTO parent_num
      FROM invoices
      WHERE id = NEW.parent_invoice_id;

    IF parent_num IS NULL THEN
      RAISE EXCEPTION 'parent_invoice_id % does not exist', NEW.parent_invoice_id;
    END IF;

    SELECT count(*) INTO sibling_count
      FROM invoices
      WHERE parent_invoice_id = NEW.parent_invoice_id;

    NEW.invoice_number := parent_num || '-S' || (sibling_count + 1)::text;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only fire if the caller did not supply an invoice_number explicitly.
-- This preserves the ability to backfill legacy invoices with hand-chosen
-- numbers without bypassing the column NOT NULL constraint.
DROP TRIGGER IF EXISTS set_invoice_number ON invoices;
CREATE TRIGGER set_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW
  WHEN (NEW.invoice_number IS NULL OR NEW.invoice_number = '')
  EXECUTE FUNCTION generate_invoice_number();


-- ---------------------------------------------------------------------------
-- project_files.invoice_id
--
-- Nullable FK back to invoices. When a generated invoice PDF is uploaded
-- in Phase B, a project_files row of file_category = 'invoice_attachment'
-- will be inserted with this column populated, making the linkage queryable
-- in both directions.
--
-- ON DELETE SET NULL so deleting an invoice (which is itself restricted) does
-- not cascade-delete the file row should we ever soft-delete differently.
-- ---------------------------------------------------------------------------

ALTER TABLE project_files
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_files_invoice
  ON project_files(invoice_id)
  WHERE invoice_id IS NOT NULL;
