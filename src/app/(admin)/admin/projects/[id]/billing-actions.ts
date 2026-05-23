"use server";

/**
 * Server actions for the project billing/invoice lifecycle.
 *
 * Status flow (admin-driven):
 *   not_ready → [auto on package generation] → ready_to_invoice
 *   ready_to_invoice → [Create Draft] → draft_invoice
 *   draft_invoice    → [Mark Sent]   → invoiced  (+ invoice_sent_at)
 *   invoiced         → [Mark Partially Paid] → partially_paid
 *   invoiced / partially_paid → [Mark Paid] → paid  (+ invoice_paid_at)
 *   ready_to_invoice / draft_invoice / invoiced → [Put on Hold] → hold
 *   hold → [Remove Hold] → invoiced (if invoice_sent_at set) | ready_to_invoice
 *
 * Every transition action guards the DB update with a WHERE on the
 * expected prior billing_status so bad transitions fail with a clear error
 * rather than silently succeeding.
 *
 * saveBillingFields updates price/number/notes without changing status.
 * recalculateEstimate re-runs the pricing engine; writes estimated_price only.
 * applyRecommendedPrice copies estimated_price → base_price.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { calculateProjectPrice } from "@/lib/queries/pricing";
import { resolveUnifiedStatus } from "@/lib/status/unifiedMapping";

export type BillingActionState = {
  error: string | null;
  success?: boolean;
};

// ── Shared helpers ─────────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase: null, actorLabel: null, error: "Not signed in." };
  const role = (user.app_metadata as { role?: string })?.role;
  if (role !== "admin") return { supabase: null, actorLabel: null, error: "Admin required." };

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  return { supabase, actorLabel: profile?.display_name ?? "Admin", error: null };
}

async function logActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  actorLabel: string,
  action: string,
  metadata: Record<string, unknown> = {}
) {
  await supabase.from("project_activity").insert({
    project_id:  projectId,
    actor_label: actorLabel,
    action,
    metadata,
  });
}

function parseMoney(raw: string | null): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

// Phase F: legacy guard. When a project has any non-void invoice in the new
// invoices table, the legacy mutation paths (this file) must NOT change the
// cached invoice_* columns or billing_status — otherwise a stale form / direct
// API call could overwrite the authoritative invoice's mirrored state. The
// UI (Phase D2) hides these forms, but the actions are still exported and
// callable. This guard closes that backdoor.
async function rejectIfAuthoritativeInvoice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string
): Promise<string | null> {
  const { count, error } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .neq("status", "void");
  if (error) {
    console.error("rejectIfAuthoritativeInvoice: check failed", error);
    // Fail-closed: if we can't verify, refuse the legacy mutation rather than
    // risk silently overwriting invoice-mirrored fields.
    return "Could not verify invoice state — try again.";
  }
  if ((count ?? 0) > 0) {
    return "This project has an active invoice — use the invoice controls instead of the legacy billing form.";
  }
  return null;
}

// ── Save price / invoice fields (no status change) ─────────────────────────────
// No billing_status guard — editing price/notes is always permitted as a
// manual correction capability regardless of state.

export async function saveBillingFields(
  _prev: BillingActionState,
  formData: FormData
): Promise<BillingActionState> {
  const { supabase, actorLabel, error } = await requireAdmin();
  if (error || !supabase || !actorLabel) return { error };

  const projectId = (formData.get("project_id") as string)?.trim();
  if (!projectId) return { error: "Missing project ID." };

  const guard = await rejectIfAuthoritativeInvoice(supabase, projectId);
  if (guard) return { error: guard };

  const basePrice      = parseMoney(formData.get("base_price") as string);
  const discountRaw    = parseMoney(formData.get("discount_amount") as string);
  const discountAmount = discountRaw ?? 0;
  const invoiceNumber  = (formData.get("invoice_number") as string)?.trim() || null;
  const invoiceNotes   = (formData.get("invoice_notes") as string)?.trim()  || null;

  const { error: updateError } = await supabase
    .from("projects")
    .update({
      base_price:      basePrice,
      discount_amount: discountAmount,
      invoice_number:  invoiceNumber,
      invoice_notes:   invoiceNotes,
    })
    .eq("id", projectId);

  if (updateError) {
    console.error("saveBillingFields error:", updateError);
    return { error: "Failed to save billing fields." };
  }

  const priceStr = basePrice != null
    ? `$${(basePrice - discountAmount).toFixed(2)}`
    : null;

  await logActivity(
    supabase, projectId, actorLabel,
    priceStr ? `Billing fields saved (total: ${priceStr})` : "Billing fields saved",
    { base_price: basePrice, discount_amount: discountAmount, invoice_number: invoiceNumber }
  );

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Recalculate price estimate ─────────────────────────────────────────────────
// Re-runs the pricing engine (sheet count + rule matching + multipliers) and
// writes the new estimated_price, pricing_rule_id, sheet_count to the project.
// Does NOT change base_price — admin reviews the result and applies it manually.

export async function recalculateEstimate(
  _prev: BillingActionState,
  formData: FormData
): Promise<BillingActionState> {
  const { supabase, actorLabel, error } = await requireAdmin();
  if (error || !supabase || !actorLabel) return { error };

  const projectId = (formData.get("project_id") as string)?.trim();
  if (!projectId) return { error: "Missing project ID." };

  const breakdown = await calculateProjectPrice(supabase, projectId);

  if (!breakdown) {
    return {
      error: "No pricing rule matched for this project. Check state, county, and authority type in project settings.",
    };
  }

  await logActivity(
    supabase, projectId, actorLabel,
    `Pricing estimate recalculated: $${breakdown.total.toFixed(2)} (${breakdown.rule_name}, ${breakdown.sheet_count} sheets)`,
    { total: breakdown.total, rule_name: breakdown.rule_name, sheet_count: breakdown.sheet_count }
  );

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Apply recommended price as base price ─────────────────────────────────────
// Copies the current estimated_price → base_price.
// Only allowed in editable billing states (before invoice is sent).
// Admin can still edit base_price manually after applying.

export async function applyRecommendedPrice(
  _prev: BillingActionState,
  formData: FormData
): Promise<BillingActionState> {
  const { supabase, actorLabel, error } = await requireAdmin();
  if (error || !supabase || !actorLabel) return { error };

  const projectId = (formData.get("project_id") as string)?.trim();
  if (!projectId) return { error: "Missing project ID." };

  const guard = await rejectIfAuthoritativeInvoice(supabase, projectId);
  if (guard) return { error: guard };

  // Fetch current state
  const { data: project, error: fetchErr } = await supabase
    .from("projects")
    .select("estimated_price, billing_status")
    .eq("id", projectId)
    .single();

  if (fetchErr || !project) return { error: "Project not found." };
  if (project.estimated_price == null) return { error: "No estimated price available to apply." };

  // Only allow before invoice is sent — once invoiced the price is locked
  const editableStates = ["not_ready", "ready_to_invoice", "draft_invoice"];
  if (!editableStates.includes(project.billing_status as string)) {
    return { error: "Cannot change base price — invoice has already been sent." };
  }

  const { error: updateError } = await supabase
    .from("projects")
    .update({ base_price: project.estimated_price })
    .eq("id", projectId);

  if (updateError) return { error: "Failed to apply recommended price." };

  await logActivity(
    supabase, projectId, actorLabel,
    `Recommended price applied as base price ($${(project.estimated_price as number).toFixed(2)})`,
    { base_price: project.estimated_price }
  );

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Create draft invoice ───────────────────────────────────────────────────────
// Valid prior state: ready_to_invoice

export async function markDraftInvoice(
  _prev: BillingActionState,
  formData: FormData
): Promise<BillingActionState> {
  const { supabase, actorLabel, error } = await requireAdmin();
  if (error || !supabase || !actorLabel) return { error };

  const projectId = (formData.get("project_id") as string)?.trim();
  if (!projectId) return { error: "Missing project ID." };

  const guard = await rejectIfAuthoritativeInvoice(supabase, projectId);
  if (guard) return { error: guard };

  const { data: currentRow } = await supabase
    .from("projects")
    .select("status")
    .eq("id", projectId)
    .single();
  const currentStatus = (currentRow?.status as string) ?? "";

  const { data, error: updateError } = await supabase
    .from("projects")
    .update({
      billing_status: "draft_invoice",
      unified_status: resolveUnifiedStatus(currentStatus, "draft_invoice"),
    })
    .eq("id", projectId)
    .eq("billing_status", "ready_to_invoice")
    .select("id");

  if (updateError) return { error: "Failed to update billing status." };
  if (!data?.length) return { error: "Cannot create draft — project is not in 'Ready to Invoice' state." };

  await logActivity(supabase, projectId, actorLabel, "Draft invoice created");
  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Mark invoice sent ──────────────────────────────────────────────────────────
// Valid prior state: draft_invoice
// Captures delivery metadata: who it was sent to, by whom, and any send notes.

export async function markInvoiceSent(
  _prev: BillingActionState,
  formData: FormData
): Promise<BillingActionState> {
  const { supabase, actorLabel, error } = await requireAdmin();
  if (error || !supabase || !actorLabel) return { error };

  const projectId      = (formData.get("project_id") as string)?.trim();
  if (!projectId) return { error: "Missing project ID." };

  const guard = await rejectIfAuthoritativeInvoice(supabase, projectId);
  if (guard) return { error: guard };

  const { data: currentRow } = await supabase
    .from("projects")
    .select("status")
    .eq("id", projectId)
    .single();
  const currentStatus = (currentRow?.status as string) ?? "";

  const invoiceNumber    = (formData.get("invoice_number")          as string)?.trim() || null;
  const recipientName    = (formData.get("invoice_recipient_name")  as string)?.trim() || null;
  const recipientEmail   = (formData.get("invoice_recipient_email") as string)?.trim() || null;
  const sendNotes        = (formData.get("invoice_send_notes")      as string)?.trim() || null;
  const sentAt           = new Date().toISOString();

  const patch: Record<string, unknown> = {
    billing_status:          "invoiced",
    unified_status:          resolveUnifiedStatus(currentStatus, "invoiced"),
    invoice_sent_at:         sentAt,
    invoice_sent_by:         actorLabel,   // auto-captured from session
    invoice_recipient_name:  recipientName,
    invoice_recipient_email: recipientEmail,
    invoice_send_notes:      sendNotes,
  };
  if (invoiceNumber) patch.invoice_number = invoiceNumber;

  const { data, error: updateError } = await supabase
    .from("projects")
    .update(patch)
    .eq("id", projectId)
    .eq("billing_status", "draft_invoice")
    .select("id");

  if (updateError) return { error: "Failed to update billing status." };
  if (!data?.length) return { error: "Cannot mark sent — project is not in 'Draft Invoice' state." };

  const recipientStr = recipientName
    ? recipientEmail ? `${recipientName} <${recipientEmail}>` : recipientName
    : recipientEmail ?? null;

  await logActivity(
    supabase, projectId, actorLabel,
    invoiceNumber ? `Invoice sent (${invoiceNumber})` : "Invoice sent",
    {
      invoice_number:    invoiceNumber,
      invoice_sent_at:   sentAt,
      invoice_sent_by:   actorLabel,
      recipient:         recipientStr,
      send_notes:        sendNotes,
    }
  );

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Mark partially paid ────────────────────────────────────────────────────────
// Valid prior state: invoiced

export async function markPartiallyPaid(
  _prev: BillingActionState,
  formData: FormData
): Promise<BillingActionState> {
  const { supabase, actorLabel, error } = await requireAdmin();
  if (error || !supabase || !actorLabel) return { error };

  const projectId = (formData.get("project_id") as string)?.trim();
  if (!projectId) return { error: "Missing project ID." };

  const guard = await rejectIfAuthoritativeInvoice(supabase, projectId);
  if (guard) return { error: guard };

  const { data: currentRow } = await supabase
    .from("projects")
    .select("status")
    .eq("id", projectId)
    .single();
  const currentStatus = (currentRow?.status as string) ?? "";

  const { data, error: updateError } = await supabase
    .from("projects")
    .update({
      billing_status: "partially_paid",
      unified_status: resolveUnifiedStatus(currentStatus, "partially_paid"),
    })
    .eq("id", projectId)
    .eq("billing_status", "invoiced")
    .select("id");

  if (updateError) return { error: "Failed to update billing status." };
  if (!data?.length) return { error: "Cannot record partial payment — project is not in 'Invoiced' state." };

  await logActivity(supabase, projectId, actorLabel, "Partial payment received");
  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Mark paid ─────────────────────────────────────────────────────────────────
// Valid prior states: invoiced, partially_paid

export async function markPaid(
  _prev: BillingActionState,
  formData: FormData
): Promise<BillingActionState> {
  const { supabase, actorLabel, error } = await requireAdmin();
  if (error || !supabase || !actorLabel) return { error };

  const projectId = (formData.get("project_id") as string)?.trim();
  if (!projectId) return { error: "Missing project ID." };

  const guard = await rejectIfAuthoritativeInvoice(supabase, projectId);
  if (guard) return { error: guard };

  const paidAt = new Date().toISOString();

  const { data: currentRow } = await supabase
    .from("projects")
    .select("status")
    .eq("id", projectId)
    .single();
  const currentStatus = (currentRow?.status as string) ?? "";

  const { data, error: updateError } = await supabase
    .from("projects")
    .update({
      billing_status: "paid",
      unified_status: resolveUnifiedStatus(currentStatus, "paid"),
      invoice_paid_at: paidAt,
    })
    .eq("id", projectId)
    .in("billing_status", ["invoiced", "partially_paid"])
    .select("id");

  if (updateError) return { error: "Failed to update billing status." };
  if (!data?.length) return { error: "Cannot mark paid — project must be 'Invoiced' or 'Partially Paid'." };

  await logActivity(
    supabase, projectId, actorLabel,
    "Payment received — invoice paid",
    { invoice_paid_at: paidAt }
  );

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Put on hold ────────────────────────────────────────────────────────────────
// Valid prior states: ready_to_invoice, draft_invoice, invoiced
// Note: partially_paid is intentionally excluded — no reliable restore path.

export async function setBillingHold(
  _prev: BillingActionState,
  formData: FormData
): Promise<BillingActionState> {
  const { supabase, actorLabel, error } = await requireAdmin();
  if (error || !supabase || !actorLabel) return { error };

  const projectId = (formData.get("project_id") as string)?.trim();
  if (!projectId) return { error: "Missing project ID." };

  const guard = await rejectIfAuthoritativeInvoice(supabase, projectId);
  if (guard) return { error: guard };

  const { data, error: updateError } = await supabase
    .from("projects")
    .update({ billing_status: "hold", billing_on_hold: true })
    .eq("id", projectId)
    .in("billing_status", ["ready_to_invoice", "draft_invoice", "invoiced"])
    .select("id");

  if (updateError) return { error: "Failed to update billing status." };
  if (!data?.length) return { error: "Cannot place on hold from current billing state." };

  await logActivity(supabase, projectId, actorLabel, "Billing put on hold");
  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Remove hold ────────────────────────────────────────────────────────────────
// Restores to the appropriate pre-hold state:
//   • invoiced       — if invoice_sent_at is set (hold was placed after sending)
//   • ready_to_invoice — otherwise

export async function removeBillingHold(
  _prev: BillingActionState,
  formData: FormData
): Promise<BillingActionState> {
  const { supabase, actorLabel, error } = await requireAdmin();
  if (error || !supabase || !actorLabel) return { error };

  const projectId = (formData.get("project_id") as string)?.trim();
  if (!projectId) return { error: "Missing project ID." };

  const guard = await rejectIfAuthoritativeInvoice(supabase, projectId);
  if (guard) return { error: guard };

  // Fetch current state to determine where to restore and verify hold status.
  const { data: projectRow, error: fetchErr } = await supabase
    .from("projects")
    .select("billing_status, invoice_sent_at")
    .eq("id", projectId)
    .single();

  if (fetchErr || !projectRow) return { error: "Project not found." };
  if (projectRow.billing_status !== "hold") return { error: "Project billing is not on hold." };

  // Restore to invoiced if the invoice was already sent before hold was placed;
  // otherwise return to ready_to_invoice.
  const restoreStatus = projectRow.invoice_sent_at ? "invoiced" : "ready_to_invoice";

  const { data, error: updateError } = await supabase
    .from("projects")
    .update({ billing_status: restoreStatus, billing_on_hold: false })
    .eq("id", projectId)
    .eq("billing_status", "hold")   // extra guard against race condition
    .select("id");

  if (updateError || !data?.length) return { error: "Failed to remove billing hold." };

  await logActivity(
    supabase, projectId, actorLabel,
    `Billing hold removed — restored to ${restoreStatus === "invoiced" ? "Invoiced" : "Ready to Invoice"}`,
    { restored_to: restoreStatus }
  );

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}
