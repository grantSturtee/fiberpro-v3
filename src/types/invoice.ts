/**
 * Invoice types for Phase A — invoice data foundation.
 *
 * Mirrors the schema introduced in:
 *   supabase/migrations/20260513000001_invoices.sql
 *   supabase/migrations/20260513000002_invoices_rls.sql
 *
 * This file is types only. No logic, no DB access, no React.
 * Subsequent phases will add queries, server actions, and UI on top of these.
 */

// ── Status enum (matches the invoices_status_check CHECK constraint) ─────────

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "partially_paid"
  | "paid"
  | "void"
  | "hold";

// ── Pricing snapshot (jsonb on invoices.pricing_snapshot) ────────────────────

export interface PricingSnapshotProject {
  id: string;
  job_number: string;
  job_name: string;
  state: string | null;
  county: string | null;
  authority_type: string | null;
  type_of_plan: string | null;
  sheet_count: number;
  is_rush: boolean;
  pe_required: boolean | null;
  submission_date: string | null;
}

export interface PricingSnapshotCompany {
  id: string;
  name: string;
  default_billing_name: string | null;
  default_billing_email: string | null;
}

export interface PricingSnapshotAuthority {
  id: string | null;
  name: string | null;
}

export interface PricingSnapshotJurisdiction {
  id: string | null;
  authority_name: string | null;
  application_fee: number;
  jurisdiction_fee: number;
}

export interface PricingSnapshotRule {
  id: string;
  name: string;
  base_project_fee: number;
  per_sheet_fee: number;
  aerial_multiplier: number;
  underground_multiplier: number;
  complexity_multiplier: number;
  fiberpro_admin_fee: number;
  // Per-fee pass-throughs (Phase 3 replacement for the legacy
  // include_jurisdiction_fee + global fee_markup_percent shape).
  include_application_fee: boolean;
  application_fee_markup: boolean;
  application_fee_markup_percent: number;
  include_permit_fee: boolean;
  permit_fee_markup: boolean;
  permit_fee_markup_percent: number;
  include_review_fee: boolean;
  review_fee_markup: boolean;
  review_fee_markup_percent: number;
  // Forward-compatible — populated once the Phase 2 pricing engine extension
  // wires these fields up. May be absent on snapshots generated in Phase A/B.
  rush_fee?: number;
  pe_required_fee?: number;
}

export interface PricingSnapshotOverride {
  amount: number;
  reason: string;
}

export interface PricingSnapshotCalculation {
  base_project_fee: number;
  per_sheet_total: number;          // per_sheet_fee × sheet_count
  application_fee_included: number;
  jurisdiction_fee_included: number;
  subtotal_pre_multiplier: number;
  plan_multiplier: number;
  complexity_multiplier: number;
  rush_fee: number;                 // 0 if not applied
  pe_required_fee: number;          // 0 if not applied
  multiplied_subtotal: number;
  fiberpro_admin_fee: number;
  grand_total_before_discount: number;
  discount_amount: number;
  total: number;
}

export interface PricingSnapshotPackage {
  file_id: string | null;
  storage_path: string | null;
  generated_at: string | null;
}

/**
 * v1 of the pricing snapshot shape. Writers must set `schema_version: 1`.
 * Readers must branch on `schema_version` before parsing.
 */
export interface PricingSnapshotV1 {
  schema_version: 1;
  generated_at: string;             // ISO timestamp at snapshot time

  project: PricingSnapshotProject;
  company: PricingSnapshotCompany;
  authority: PricingSnapshotAuthority | null;
  jurisdiction: PricingSnapshotJurisdiction | null;
  pricing_rule: PricingSnapshotRule | null;     // null when override is used
  override: PricingSnapshotOverride | null;
  calculation: PricingSnapshotCalculation;
  package: PricingSnapshotPackage | null;

  created_by: string;                            // display name snapshot
  resolution_trail: string[];                    // human-readable explanation lines

  // Populated when the invoice is sent (Phase C). Captures the line items as
  // they existed at finalization, alongside the canonical invoice_line_items
  // rows. Optional because drafts and freshly-built snapshots may not have it.
  line_items_snapshot?: Array<{
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    sort_order: number;
  }>;

  /**
   * Phase H1 — frozen output of the authoritative pricing resolver at the time
   * the snapshot was built. Optional because pre-H1 snapshots predate this
   * block; readers must treat its absence as "no resolver output recorded".
   * The legacy `calculation` block above is still populated alongside this
   * for back-compat with the existing SnapshotSummary UI.
   */
  resolved_pricing?: {
    confidence: "high" | "medium" | "low";
    suggested_subtotal: number;
    suggested_total: number;
    line_items: Array<{
      description: string;
      quantity: number;
      unit_price: number;
      line_total: number;
      metadata?: Record<string, unknown>;
    }>;
    warnings: Array<{ code: string; message: string }>;
    blocking_inputs: Array<{ code: string; message: string }>;
  };
}

// ── invoice_line_items row ───────────────────────────────────────────────────

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Shape callers pass when inserting a line item. `line_total` and `sort_order`
 * are computable; including them here keeps the contract explicit.
 */
export interface InvoiceLineItemInput {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  sort_order?: number;
  metadata?: Record<string, unknown>;
}

// ── invoices row ─────────────────────────────────────────────────────────────

export interface Invoice {
  id: string;
  project_id: string;

  invoice_number: string;
  status: InvoiceStatus;
  invoice_date: string;            // ISO date (YYYY-MM-DD)
  due_date: string | null;

  subtotal: number;
  discount_amount: number;
  total_amount: number;

  pricing_snapshot: PricingSnapshotV1 | Record<string, never>;
  // ^ Allows the schema's `default '{}'::jsonb` empty-object case during
  //   the brief window between INSERT and snapshot population.

  // Admin-only fields. Application code MUST NOT select these in
  // company-facing queries. See migration 20260513000002 header note.
  invoice_notes: string | null;
  send_notes: string | null;
  sent_by: string | null;
  created_by: string;

  // Delivery metadata
  recipient_name: string | null;
  recipient_email: string | null;

  // Lifecycle timestamps
  sent_at: string | null;
  paid_at: string | null;
  paid_amount: number | null;
  voided_at: string | null;
  voided_reason: string | null;

  // Supplemental / credit linkage
  parent_invoice_id: string | null;

  // Persisted PDF
  pdf_storage_path: string | null;

  created_at: string;
  updated_at: string;
}

/**
 * Subset of invoice columns safe to surface to company users.
 * Phase B query helpers should select exactly these fields when serving
 * non-admin sessions. Maintained as an explicit type so the privacy
 * contract is reviewable in code.
 */
export type InvoicePublic = Pick<
  Invoice,
  | "id"
  | "project_id"
  | "invoice_number"
  | "status"
  | "invoice_date"
  | "due_date"
  | "subtotal"
  | "discount_amount"
  | "total_amount"
  | "recipient_name"
  | "recipient_email"
  | "sent_at"
  | "paid_at"
  | "paid_amount"
  | "voided_at"
  | "voided_reason"
  | "parent_invoice_id"
  | "pdf_storage_path"
  | "created_at"
  | "updated_at"
>;
