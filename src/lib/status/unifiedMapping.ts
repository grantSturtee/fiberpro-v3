/**
 * Single source of truth for deriving `unified_status` from the legacy
 * `(status, billing_status)` columns.
 *
 * All write paths that update a project's status or billing_status MUST call
 * `resolveUnifiedStatus(...)` and write the result to `unified_status` in the
 * same `.update()` / `.insert()` call. Do not hardcode unified_status values
 * at call sites — every rule lives here so the mapping can be audited and
 * evolved in one place.
 *
 * @see migration 20260520000001_unified_project_status.sql for the initial
 *      backfill rules — kept in sync with this function.
 */

import type { UnifiedProjectStatus } from "@/types/domain";

/**
 * Derive the unified status from the legacy (status, billing_status) pair.
 * Defensive against unknown string values — falls back to `new_project`.
 */
export function resolveUnifiedStatus(
  status: string,
  billingStatus: string,
): UnifiedProjectStatus {
  switch (status) {
    // ── Early stage: billing always not_ready, doesn't affect outcome ────────
    case "intake_review":
    case "waiting_on_client":
    case "ready_for_assignment":
      return "new_project";

    // ── Active design ────────────────────────────────────────────────────────
    case "assigned":
    case "in_design":
    case "revisions_required":
      return "in_production";

    // ── Awaiting admin review / package generation ───────────────────────────
    case "waiting_for_admin_review":
    case "package_generating":
      return "pending_review";

    // ── Approved: billing-aware ──────────────────────────────────────────────
    // Once a design is approved, the project's lifecycle bucket advances with
    // billing state — package generation flips billing to ready_to_invoice and
    // moves the project into the billing_ready / invoice_sent buckets.
    case "approved":
      if (billingStatus === "ready_to_invoice" || billingStatus === "draft_invoice") {
        return "billing_ready";
      }
      if (billingStatus === "invoiced" || billingStatus === "partially_paid") {
        return "invoice_sent";
      }
      return "pending_review";

    // ── Terminal: cancelled ──────────────────────────────────────────────────
    case "cancelled":
      return "cancelled";

    // ── Package ready, pre-submission ────────────────────────────────────────
    case "ready_for_submission":
      if (billingStatus === "ready_to_invoice" || billingStatus === "draft_invoice") {
        return "billing_ready";
      }
      if (billingStatus === "invoiced" || billingStatus === "partially_paid") {
        return "invoice_sent";
      }
      return "billing_ready";

    // ── Submitted to authority through processing ────────────────────────────
    case "submitted":
    case "waiting_on_authority":
    case "authority_action_needed":
      if (
        billingStatus === "ready_to_invoice" ||
        billingStatus === "draft_invoice" ||
        billingStatus === "not_ready"
      ) {
        return "sub_bill_now";
      }
      if (billingStatus === "invoiced" || billingStatus === "partially_paid") {
        return "permit_billed";
      }
      // 'paid' alone is not enough for paid_complete — permit must be received
      // or the project closed first. Treat as permit_billed.
      if (billingStatus === "paid") {
        return "permit_billed";
      }
      return "sub_bill_now";

    // ── Permit received / project closed ─────────────────────────────────────
    case "permit_received":
    case "closed":
      if (billingStatus === "paid") {
        return "paid_complete";
      }
      if (billingStatus === "invoiced" || billingStatus === "partially_paid") {
        return "permit_billed";
      }
      return "permit_billed";

    default:
      return "new_project";
  }
}

/**
 * Returns true when the legacy billing_status value represents the "hold"
 * state, which is modeled as an orthogonal `billing_on_hold` boolean in the
 * unified schema rather than a status value.
 *
 * Call this anywhere code would have written `billing_status: "hold"` — set
 * `billing_on_hold = true` instead, and leave `unified_status` unchanged.
 */
export function shouldSetBillingHold(billingStatus: string): boolean {
  return billingStatus === "hold";
}
