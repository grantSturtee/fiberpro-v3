-- =============================================================================
-- Phase A — Invoices RLS
-- =============================================================================
-- Enables RLS on invoices and invoice_line_items and installs policies
-- matching the conventions used elsewhere in this repo:
--
--   * Admins (app_metadata.role = 'admin') get full access to both tables.
--   * Company members get SELECT-only access to invoices for projects under
--     their company membership, gated to statuses that are appropriate for
--     external visibility: sent, partially_paid, paid, void. Drafts and
--     holds are admin-only.
--   * Designers are not granted any policy — default-deny means they cannot
--     see invoices.
--   * Anonymous (unauthenticated) traffic is default-deny.
--
-- ─── invoice_notes privacy note ──────────────────────────────────────────────
-- Postgres has no column-level RLS. Once a company user can see a row,
-- they can theoretically select every column on it. The application layer
-- (PDF route, company-facing pages, queries in src/lib/queries/invoices.ts
-- once it is created) MUST avoid selecting these admin-only fields when
-- serving company users:
--
--     invoice_notes        — internal-only billing notes
--     pricing_snapshot     — exposes rule structure / margin
--     send_notes           — admin's notes about how the invoice was sent
--     sent_by              — internal actor name
--     created_by           — internal actor name
--
-- A future hardening pass may move invoice_notes to a sibling
-- invoices_internal_notes table with admin-only RLS. Deferred for now —
-- application-layer privacy is sufficient for this phase.
-- =============================================================================

-- ── invoices ─────────────────────────────────────────────────────────────────

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices: admin all"
  ON invoices FOR ALL
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
  )
  WITH CHECK (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
  );

CREATE POLICY "invoices: company member read"
  ON invoices FOR SELECT
  USING (
    status IN ('sent', 'partially_paid', 'paid', 'void')
    AND EXISTS (
      SELECT 1
      FROM projects p
      JOIN company_memberships cm ON cm.company_id = p.company_id
      WHERE p.id = invoices.project_id
        AND cm.user_id = auth.uid()
    )
  );


-- ── invoice_line_items ───────────────────────────────────────────────────────

ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_line_items: admin all"
  ON invoice_line_items FOR ALL
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
  )
  WITH CHECK (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
  );

-- Company members see line items only for invoices they can already see.
CREATE POLICY "invoice_line_items: company member read"
  ON invoice_line_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM invoices i
      JOIN projects p             ON p.id = i.project_id
      JOIN company_memberships cm ON cm.company_id = p.company_id
      WHERE i.id = invoice_line_items.invoice_id
        AND i.status IN ('sent', 'partially_paid', 'paid', 'void')
        AND cm.user_id = auth.uid()
    )
  );
