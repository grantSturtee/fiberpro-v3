/**
 * refreshProjectBillingCache(supabase, projectId)
 *
 * Mirrors the latest non-void invoice's state onto the legacy projects cache
 * columns (billing_status, base_price, discount_amount, invoice_*). Callers
 * (the new invoice server actions) invoke this after every mutation so the
 * existing BillingPanel and admin dashboards — which still read from
 * projects.invoice_* — stay accurate.
 *
 * Three cases (Phase F stabilization):
 *   1. A non-void invoice exists → mirror it onto the cache.
 *   2. ALL invoices for this project are voided (i.e. project went through
 *      the new flow and ended up with only voided records) → clear the
 *      invoice mirror fields and reset billing_status to ready_to_invoice
 *      so the queue doesn't keep showing this project as having a draft.
 *   3. NO invoices have ever existed → leave the cache unchanged so legacy
 *      admin edits to projects.invoice_* are preserved.
 *
 * Status mapping for case 1:
 *   draft           → draft_invoice
 *   sent            → invoiced
 *   partially_paid  → partially_paid
 *   paid            → paid
 *   hold            → hold
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillingStatus } from "@/types/domain";
import type { InvoiceStatus } from "@/types/invoice";
import { resolveUnifiedStatus, shouldSetBillingHold } from "@/lib/status/unifiedMapping";

function mapInvoiceStatusToBillingStatus(s: InvoiceStatus): BillingStatus {
  switch (s) {
    case "draft":          return "draft_invoice";
    case "sent":           return "invoiced";
    case "partially_paid": return "partially_paid";
    case "paid":           return "paid";
    case "hold":           return "hold";
    case "void":
      // void invoices are excluded by the query; this branch exists only
      // to satisfy exhaustiveness. Fall back to a safe value.
      return "ready_to_invoice";
  }
}

export async function refreshProjectBillingCache(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ error: string | null }> {
  // Need the current legacy status to derive unified_status alongside billing writes.
  const { data: projectRow, error: projErr } = await supabase
    .from("projects")
    .select("status")
    .eq("id", projectId)
    .single();
  if (projErr) {
    console.error("refreshProjectBillingCache: project read error", projErr);
    return { error: "Failed to read project status for cache refresh." };
  }
  const currentStatus = (projectRow?.status as string) ?? "";

  const { data: latest, error: fetchError } = await supabase
    .from("invoices")
    .select(
      `
        id, status, invoice_number, invoice_notes,
        subtotal, discount_amount, total_amount,
        recipient_name, recipient_email, send_notes,
        sent_at, sent_by, paid_at
      `
    )
    .eq("project_id", projectId)
    .neq("status", "void")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    console.error("refreshProjectBillingCache: fetch error", fetchError);
    return { error: "Failed to read invoice for cache refresh." };
  }

  if (!latest) {
    // No non-void invoices remain. Distinguish "voided everything" from
    // "never had an invoice" — only clear the cache in the former case so
    // legacy projects untouched by the new flow keep their admin edits.
    const { count: voidedCount, error: countError } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    if (countError) {
      console.error("refreshProjectBillingCache: void count error", countError);
      return { error: null }; // best-effort; legacy path stays intact
    }

    if ((voidedCount ?? 0) === 0) {
      // Pure legacy project. Leave cache alone.
      return { error: null };
    }

    // All invoices are voided. Reset invoice-specific mirror fields and put
    // the project back into the queue at ready_to_invoice so the admin can
    // recreate a draft. We intentionally do NOT touch base_price /
    // discount_amount / invoice_notes — those may have been set by legacy
    // actions or carry useful pre-invoice pricing intent.
    const { error: clearError } = await supabase
      .from("projects")
      .update({
        billing_status:          "ready_to_invoice",
        unified_status:          resolveUnifiedStatus(currentStatus, "ready_to_invoice"),
        billing_on_hold:         false,
        invoice_number:          null,
        invoice_sent_at:         null,
        invoice_paid_at:         null,
        invoice_sent_by:         null,
        invoice_recipient_name:  null,
        invoice_recipient_email: null,
        invoice_send_notes:      null,
      })
      .eq("id", projectId);
    if (clearError) {
      console.error("refreshProjectBillingCache: clear error", clearError);
      return { error: "Failed to clear billing cache after void." };
    }
    return { error: null };
  }

  const billingStatus = mapInvoiceStatusToBillingStatus(latest.status as InvoiceStatus);
  const isHold = shouldSetBillingHold(billingStatus);

  // Legacy projects.base_price was "pre-discount price"; reconstruct as
  // total_amount + discount_amount so existing UI does (base - discount) and
  // gets back the invoice's total.
  const basePriceMirror =
    Number(latest.total_amount ?? 0) + Number(latest.discount_amount ?? 0);

  const updatePayload: Record<string, unknown> = {
    billing_status:           billingStatus,
    billing_on_hold:          isHold,
    base_price:               basePriceMirror,
    discount_amount:          Number(latest.discount_amount ?? 0),
    invoice_number:           latest.invoice_number,
    invoice_notes:            latest.invoice_notes,
    invoice_sent_at:          latest.sent_at,
    invoice_paid_at:          latest.paid_at,
    invoice_sent_by:          latest.sent_by,
    invoice_recipient_name:   latest.recipient_name,
    invoice_recipient_email:  latest.recipient_email,
    invoice_send_notes:       latest.send_notes,
  };
  // Only set unified_status when NOT on hold — hold is modeled as an
  // orthogonal flag that does not change the lifecycle stage.
  if (!isHold) {
    updatePayload.unified_status = resolveUnifiedStatus(currentStatus, billingStatus);
  }

  const { error: updateError } = await supabase
    .from("projects")
    .update(updatePayload)
    .eq("id", projectId);

  if (updateError) {
    console.error("refreshProjectBillingCache: update error", updateError);
    return { error: "Failed to write billing cache." };
  }

  return { error: null };
}
