"use server";

/**
 * Admin-only server actions for the new invoice engine (Phase B).
 *
 * Implements:
 *   - createInvoiceFromProject
 *   - updateDraftInvoice
 *   - addInvoiceLineItem
 *   - updateInvoiceLineItem
 *   - deleteInvoiceLineItem
 *   - markInvoicePartiallyPaid
 *   - markInvoicePaid
 *   - voidInvoice
 *
 * NOT implemented in this phase:
 *   - sendInvoice (Phase C — owns PDF generation + persistence)
 *   - any UI integration (BillingPanel changes, billing-actions.ts dual-write)
 *
 * Conventions:
 *   - Every mutation runs as admin (requireAdmin guard).
 *   - Every mutation that affects a project calls refreshProjectBillingCache
 *     so the legacy projects.invoice_* cache stays in sync with the latest
 *     non-void invoice. Existing UI keeps working without modification.
 *   - Every meaningful mutation logs to project_activity.
 *   - All draft mutations are guarded with `.eq("status", "draft")` in the
 *     UPDATE so a concurrent status transition cannot silently allow the edit.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildPricingSnapshot } from "@/lib/invoices/buildPricingSnapshot";
import { refreshProjectBillingCache } from "@/lib/invoices/refreshProjectBillingCache";
import { generateInvoiceFromLineItems } from "@/lib/pdf/invoice";
import { resolveUnifiedStatus } from "@/lib/status/unifiedMapping";
import type {
  InvoiceLineItemInput,
  PricingSnapshotV1,
} from "@/types/invoice";

export type InvoiceActionState = {
  error: string | null;
  success?: string;
  invoiceId?: string;
  itemId?: string;
};

// ── Shared helpers ─────────────────────────────────────────────────────────────

type AdminContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  actorLabel: string;
  actorId: string;
};

async function requireAdmin(): Promise<
  { ctx: AdminContext; error: null } | { ctx: null; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ctx: null, error: "Not signed in." };

  const role = (user.app_metadata as { role?: string })?.role;
  if (role !== "admin") return { ctx: null, error: "Admin required." };

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  return {
    ctx: {
      supabase,
      actorLabel: profile?.display_name ?? "Admin",
      actorId: user.id,
    },
    error: null,
  };
}

async function logActivity(
  ctx: AdminContext,
  projectId: string,
  action: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await ctx.supabase.from("project_activity").insert({
    project_id: projectId,
    actor_id: ctx.actorId,
    actor_label: ctx.actorLabel,
    action,
    metadata,
  });
}

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function parseMoney(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = parseFloat(String(raw).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? roundMoney(n) : null;
}

function parseInteger(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * Recompute and persist invoice.subtotal + total_amount from the current
 * line items. Called after every line-item or discount change.
 *
 * If `overrideDiscount` is provided, uses that value (caller is updating
 * discount and totals atomically). Otherwise reads invoices.discount_amount.
 */
async function recomputeInvoiceTotals(
  ctx: AdminContext,
  invoiceId: string,
  overrideDiscount?: number
): Promise<{ subtotal: number; total: number; error: string | null }> {
  const { data: items, error: itemsErr } = await ctx.supabase
    .from("invoice_line_items")
    .select("line_total")
    .eq("invoice_id", invoiceId);

  if (itemsErr) {
    console.error("recomputeInvoiceTotals: read items error", itemsErr);
    return { subtotal: 0, total: 0, error: "Failed to read line items." };
  }

  const subtotal = roundMoney(
    (items ?? []).reduce((sum, r) => sum + Number(r.line_total ?? 0), 0)
  );

  let discount = overrideDiscount;
  if (discount === undefined) {
    const { data: inv, error: invErr } = await ctx.supabase
      .from("invoices")
      .select("discount_amount")
      .eq("id", invoiceId)
      .single();
    if (invErr || !inv) {
      console.error("recomputeInvoiceTotals: read invoice error", invErr);
      return { subtotal, total: subtotal, error: "Failed to read invoice." };
    }
    discount = Number(inv.discount_amount ?? 0);
  }

  const total = roundMoney(subtotal - discount);

  const { error: updErr } = await ctx.supabase
    .from("invoices")
    .update({ subtotal, total_amount: total })
    .eq("id", invoiceId);

  if (updErr) {
    console.error("recomputeInvoiceTotals: update error", updErr);
    return { subtotal, total, error: "Failed to update invoice totals." };
  }

  return { subtotal, total, error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// createInvoiceFromProject
// ─────────────────────────────────────────────────────────────────────────────

export async function createInvoiceFromProject(
  _prev: InvoiceActionState,
  formData: FormData
): Promise<InvoiceActionState> {
  const auth = await requireAdmin();
  if (auth.error) return { error: auth.error };
  const ctx = auth.ctx!;

  const projectId = (formData.get("project_id") as string | null)?.trim();
  if (!projectId) return { error: "Missing project ID." };

  // 1. Read project + guard ----------------------------------------------------
  const { data: project, error: projErr } = await ctx.supabase
    .from("projects")
    .select(
      "id, billing_status, estimated_price, base_price, discount_amount, invoice_notes"
    )
    .eq("id", projectId)
    .single();

  if (projErr || !project) return { error: "Project not found." };

  const allowedStates = ["not_ready", "ready_to_invoice", "draft_invoice"];
  if (!allowedStates.includes(project.billing_status as string)) {
    return {
      error: `Cannot create invoice — billing status is "${project.billing_status}". Only not_ready, ready_to_invoice, or draft_invoice projects can spawn a draft.`,
    };
  }

  // 2. Reject if a non-void invoice already exists ----------------------------
  const { data: existing, error: existErr } = await ctx.supabase
    .from("invoices")
    .select("id, invoice_number, status")
    .eq("project_id", projectId)
    .neq("status", "void")
    .limit(1)
    .maybeSingle();

  if (existErr) {
    console.error("createInvoiceFromProject: existing-invoice check", existErr);
    return { error: "Failed to check for existing invoices." };
  }
  if (existing) {
    return {
      error: `Project already has an active invoice (${existing.invoice_number}).`,
    };
  }

  // 3. Build the pricing snapshot ----------------------------------------------
  const snapshot = await buildPricingSnapshot(
    ctx.supabase,
    projectId,
    ctx.actorLabel
  );

  // 4. Compose default line items ---------------------------------------------
  const basePrice = project.base_price != null ? Number(project.base_price) : null;
  const estimatedPrice =
    project.estimated_price != null ? Number(project.estimated_price) : null;

  const defaultItems: InvoiceLineItemInput[] = (() => {
    if (basePrice != null) {
      return [
        {
          description: "Permit Package Services",
          quantity: 1,
          unit_price: roundMoney(basePrice),
          line_total: roundMoney(basePrice),
          sort_order: 0,
        },
      ];
    }
    if (estimatedPrice != null) {
      return [
        {
          description: "Permit Package Services",
          quantity: 1,
          unit_price: roundMoney(estimatedPrice),
          line_total: roundMoney(estimatedPrice),
          sort_order: 0,
        },
      ];
    }
    return [
      {
        description: "Manual invoice item",
        quantity: 1,
        unit_price: 0,
        line_total: 0,
        sort_order: 0,
      },
    ];
  })();

  const subtotal = roundMoney(
    defaultItems.reduce((sum, it) => sum + Number(it.line_total), 0)
  );
  const discount = roundMoney(Number(project.discount_amount ?? 0));
  const total = roundMoney(subtotal - discount);

  // 5. Insert invoice (trigger generates invoice_number) ----------------------
  const { data: inserted, error: insertErr } = await ctx.supabase
    .from("invoices")
    .insert({
      project_id: projectId,
      status: "draft",
      subtotal,
      discount_amount: discount,
      total_amount: total,
      pricing_snapshot: snapshot,
      invoice_notes: project.invoice_notes ?? null,
      created_by: ctx.actorLabel,
    })
    .select("id, invoice_number")
    .single();

  if (insertErr || !inserted) {
    console.error("createInvoiceFromProject: insert error", insertErr);
    return { error: "Failed to create invoice." };
  }

  const invoiceId = inserted.id as string;
  const invoiceNumber = inserted.invoice_number as string;

  // 6. Insert default line items (clean up invoice on failure) ----------------
  const { error: itemErr } = await ctx.supabase
    .from("invoice_line_items")
    .insert(
      defaultItems.map((it) => ({
        invoice_id: invoiceId,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        line_total: it.line_total,
        sort_order: it.sort_order ?? 0,
        metadata: it.metadata ?? {},
      }))
    );

  if (itemErr) {
    console.error("createInvoiceFromProject: line items insert error", itemErr);
    // Best-effort rollback of the orphaned invoice row.
    await ctx.supabase.from("invoices").delete().eq("id", invoiceId);
    return { error: "Failed to create invoice line items." };
  }

  // 7. Activity + cache refresh ----------------------------------------------
  await logActivity(ctx, projectId, `Invoice draft created (${invoiceNumber})`, {
    invoice_id: invoiceId,
    invoice_number: invoiceNumber,
    total_amount: total,
    subtotal,
    discount_amount: discount,
    line_item_count: defaultItems.length,
    snapshot_resolution_trail: snapshot.resolution_trail,
  });

  await refreshProjectBillingCache(ctx.supabase, projectId);

  revalidatePath(`/admin/projects/${projectId}`);

  return {
    error: null,
    success: `Invoice ${invoiceNumber} created.`,
    invoiceId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// updateDraftInvoice
// ─────────────────────────────────────────────────────────────────────────────

export async function updateDraftInvoice(
  _prev: InvoiceActionState,
  formData: FormData
): Promise<InvoiceActionState> {
  const auth = await requireAdmin();
  if (auth.error) return { error: auth.error };
  const ctx = auth.ctx!;

  const invoiceId = (formData.get("invoice_id") as string | null)?.trim();
  if (!invoiceId) return { error: "Missing invoice ID." };

  // Load current state to:
  //   (a) verify it exists and is a draft
  //   (b) get project_id for activity + cache refresh
  const { data: invoice, error: readErr } = await ctx.supabase
    .from("invoices")
    .select("id, project_id, status, discount_amount, invoice_number")
    .eq("id", invoiceId)
    .single();
  if (readErr || !invoice) {
    return {
      error:
        "Invoice not found. It may have been voided or deleted — refresh the page and try again.",
    };
  }
  if (invoice.status !== "draft") {
    return {
      error:
        "This invoice has already been sent — fields are frozen. To make a correction, void it and create a new draft.",
    };
  }

  // Allowed editable fields:
  const patch: Record<string, unknown> = {};
  const changed: string[] = [];

  const has = (k: string) => formData.has(k);
  const str = (k: string) => (formData.get(k) as string | null)?.trim() ?? "";

  if (has("invoice_date")) {
    const v = str("invoice_date") || null;
    patch.invoice_date = v;
    changed.push("invoice_date");
  }
  if (has("due_date")) {
    const v = str("due_date") || null;
    patch.due_date = v;
    changed.push("due_date");
  }
  if (has("recipient_name")) {
    const v = str("recipient_name") || null;
    patch.recipient_name = v;
    changed.push("recipient_name");
  }
  if (has("recipient_email")) {
    const v = str("recipient_email") || null;
    patch.recipient_email = v;
    changed.push("recipient_email");
  }
  if (has("invoice_notes")) {
    const v = str("invoice_notes") || null;
    patch.invoice_notes = v;
    changed.push("invoice_notes");
  }

  let discountChanged = false;
  let newDiscount: number | null = null;
  if (has("discount_amount")) {
    const parsed = parseMoney(str("discount_amount"));
    if (parsed === null) return { error: "Invalid discount amount." };
    if (parsed < 0) return { error: "Discount cannot be negative." };
    patch.discount_amount = parsed;
    newDiscount = parsed;
    discountChanged = true;
    changed.push("discount_amount");
  }

  if (Object.keys(patch).length === 0) {
    return { error: "No editable fields supplied." };
  }

  // Update with status guard to catch concurrent transitions.
  const { data: updRows, error: updErr } = await ctx.supabase
    .from("invoices")
    .update(patch)
    .eq("id", invoiceId)
    .eq("status", "draft")
    .select("id");

  if (updErr) {
    console.error("updateDraftInvoice: update error", updErr);
    return { error: "Failed to update invoice." };
  }
  if (!updRows?.length) {
    return {
      error:
        "Invoice changed state in another tab (no longer a draft). Refresh the page to see the latest status.",
    };
  }

  // Recompute totals if discount changed.
  if (discountChanged && newDiscount !== null) {
    const recomp = await recomputeInvoiceTotals(ctx, invoiceId, newDiscount);
    if (recomp.error) return { error: recomp.error };
  }

  await logActivity(
    ctx,
    invoice.project_id as string,
    `Invoice draft updated (${invoice.invoice_number})`,
    {
      invoice_id: invoiceId,
      invoice_number: invoice.invoice_number,
      changed_fields: changed,
    }
  );

  await refreshProjectBillingCache(ctx.supabase, invoice.project_id as string);

  revalidatePath(`/admin/projects/${invoice.project_id}`);
  return { error: null, success: "Invoice updated.", invoiceId };
}

// ─────────────────────────────────────────────────────────────────────────────
// addInvoiceLineItem
// ─────────────────────────────────────────────────────────────────────────────

export async function addInvoiceLineItem(
  _prev: InvoiceActionState,
  formData: FormData
): Promise<InvoiceActionState> {
  const auth = await requireAdmin();
  if (auth.error) return { error: auth.error };
  const ctx = auth.ctx!;

  const invoiceId = (formData.get("invoice_id") as string | null)?.trim();
  if (!invoiceId) return { error: "Missing invoice ID." };

  const description = (formData.get("description") as string | null)?.trim() ?? "";
  if (!description) return { error: "Description is required." };

  const quantity = parseMoney(formData.get("quantity") as string | null) ?? 1;
  const unitPrice = parseMoney(formData.get("unit_price") as string | null);
  if (unitPrice === null) return { error: "Unit price is required." };
  if (quantity < 0) return { error: "Quantity must be non-negative." };

  const sortOrder =
    parseInteger(formData.get("sort_order") as string | null) ?? 0;
  const lineTotal = roundMoney(quantity * unitPrice);

  // Guard parent invoice is draft.
  const { data: invoice, error: readErr } = await ctx.supabase
    .from("invoices")
    .select("id, project_id, status, invoice_number")
    .eq("id", invoiceId)
    .single();
  if (readErr || !invoice) {
    return {
      error:
        "Invoice not found. It may have been voided or deleted — refresh the page and try again.",
    };
  }
  if (invoice.status !== "draft") {
    return { error: "Line items can only be added to draft invoices." };
  }

  const { data: inserted, error: insErr } = await ctx.supabase
    .from("invoice_line_items")
    .insert({
      invoice_id: invoiceId,
      description,
      quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
      sort_order: sortOrder,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    console.error("addInvoiceLineItem: insert error", insErr);
    return { error: "Failed to add line item." };
  }

  const recomp = await recomputeInvoiceTotals(ctx, invoiceId);
  if (recomp.error) return { error: recomp.error };

  await logActivity(
    ctx,
    invoice.project_id as string,
    `Invoice line item added: '${description}'`,
    {
      invoice_id: invoiceId,
      invoice_number: invoice.invoice_number,
      item_id: inserted.id,
      description,
      quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
      new_subtotal: recomp.subtotal,
      new_total: recomp.total,
    }
  );

  await refreshProjectBillingCache(ctx.supabase, invoice.project_id as string);
  revalidatePath(`/admin/projects/${invoice.project_id}`);

  return {
    error: null,
    success: "Line item added.",
    invoiceId,
    itemId: inserted.id as string,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// updateInvoiceLineItem
// ─────────────────────────────────────────────────────────────────────────────

export async function updateInvoiceLineItem(
  _prev: InvoiceActionState,
  formData: FormData
): Promise<InvoiceActionState> {
  const auth = await requireAdmin();
  if (auth.error) return { error: auth.error };
  const ctx = auth.ctx!;

  const itemId = (formData.get("item_id") as string | null)?.trim();
  if (!itemId) return { error: "Missing line item ID." };

  // Read current item + parent invoice (need status guard + project_id).
  const { data: item, error: readErr } = await ctx.supabase
    .from("invoice_line_items")
    .select(
      `
        id, description, quantity, unit_price, sort_order,
        invoices!inner ( id, project_id, status, invoice_number )
      `
    )
    .eq("id", itemId)
    .single();
  if (readErr || !item) return { error: "Line item not found." };

  // The embed comes back as an object (single row via FK), but supabase types
  // it as an array in some cases — normalize.
  const parent = Array.isArray(item.invoices) ? item.invoices[0] : item.invoices;
  if (!parent) return { error: "Parent invoice not found." };
  if (parent.status !== "draft") {
    return { error: "Line items can only be edited on draft invoices." };
  }

  const patch: Record<string, unknown> = {};
  const changed: string[] = [];

  if (formData.has("description")) {
    const v = (formData.get("description") as string).trim();
    if (!v) return { error: "Description cannot be empty." };
    patch.description = v;
    changed.push("description");
  }

  let newQty = Number(item.quantity);
  let newUnit = Number(item.unit_price);
  let priceChanged = false;

  if (formData.has("quantity")) {
    const q = parseMoney(formData.get("quantity") as string | null);
    if (q === null) return { error: "Invalid quantity." };
    if (q < 0) return { error: "Quantity must be non-negative." };
    newQty = q;
    patch.quantity = q;
    priceChanged = true;
    changed.push("quantity");
  }
  if (formData.has("unit_price")) {
    const u = parseMoney(formData.get("unit_price") as string | null);
    if (u === null) return { error: "Invalid unit price." };
    newUnit = u;
    patch.unit_price = u;
    priceChanged = true;
    changed.push("unit_price");
  }
  if (priceChanged) {
    patch.line_total = roundMoney(newQty * newUnit);
    changed.push("line_total");
  }

  if (formData.has("sort_order")) {
    const so = parseInteger(formData.get("sort_order") as string | null);
    if (so === null) return { error: "Invalid sort order." };
    patch.sort_order = so;
    changed.push("sort_order");
  }

  if (Object.keys(patch).length === 0) {
    return { error: "No editable fields supplied." };
  }

  const { error: updErr } = await ctx.supabase
    .from("invoice_line_items")
    .update(patch)
    .eq("id", itemId);

  if (updErr) {
    console.error("updateInvoiceLineItem: update error", updErr);
    return { error: "Failed to update line item." };
  }

  // Recompute totals only if money fields changed.
  if (priceChanged) {
    const recomp = await recomputeInvoiceTotals(ctx, parent.id as string);
    if (recomp.error) return { error: recomp.error };
  }

  await logActivity(
    ctx,
    parent.project_id as string,
    `Invoice line item updated: '${patch.description ?? item.description}'`,
    {
      invoice_id: parent.id,
      invoice_number: parent.invoice_number,
      item_id: itemId,
      changed_fields: changed,
      new_line_total: patch.line_total ?? Number(item.unit_price) * Number(item.quantity),
    }
  );

  await refreshProjectBillingCache(ctx.supabase, parent.project_id as string);
  revalidatePath(`/admin/projects/${parent.project_id}`);

  return {
    error: null,
    success: "Line item updated.",
    invoiceId: parent.id as string,
    itemId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// deleteInvoiceLineItem
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteInvoiceLineItem(
  _prev: InvoiceActionState,
  formData: FormData
): Promise<InvoiceActionState> {
  const auth = await requireAdmin();
  if (auth.error) return { error: auth.error };
  const ctx = auth.ctx!;

  const itemId = (formData.get("item_id") as string | null)?.trim();
  if (!itemId) return { error: "Missing line item ID." };

  const { data: item, error: readErr } = await ctx.supabase
    .from("invoice_line_items")
    .select(
      `
        id, description,
        invoices!inner ( id, project_id, status, invoice_number )
      `
    )
    .eq("id", itemId)
    .single();
  if (readErr || !item) return { error: "Line item not found." };

  const parent = Array.isArray(item.invoices) ? item.invoices[0] : item.invoices;
  if (!parent) return { error: "Parent invoice not found." };
  if (parent.status !== "draft") {
    return { error: "Line items can only be deleted from draft invoices." };
  }

  // Don't leave an invoice with zero line items.
  const { count } = await ctx.supabase
    .from("invoice_line_items")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", parent.id);

  if ((count ?? 0) <= 1) {
    return {
      error: "Cannot delete the last line item — invoice must have at least one.",
    };
  }

  const { error: delErr } = await ctx.supabase
    .from("invoice_line_items")
    .delete()
    .eq("id", itemId);
  if (delErr) {
    console.error("deleteInvoiceLineItem: delete error", delErr);
    return { error: "Failed to delete line item." };
  }

  const recomp = await recomputeInvoiceTotals(ctx, parent.id as string);
  if (recomp.error) return { error: recomp.error };

  await logActivity(
    ctx,
    parent.project_id as string,
    `Invoice line item removed: '${item.description}'`,
    {
      invoice_id: parent.id,
      invoice_number: parent.invoice_number,
      item_id: itemId,
      description: item.description,
      new_subtotal: recomp.subtotal,
      new_total: recomp.total,
    }
  );

  await refreshProjectBillingCache(ctx.supabase, parent.project_id as string);
  revalidatePath(`/admin/projects/${parent.project_id}`);

  return {
    error: null,
    success: "Line item removed.",
    invoiceId: parent.id as string,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// markInvoicePartiallyPaid
// ─────────────────────────────────────────────────────────────────────────────

export async function markInvoicePartiallyPaid(
  _prev: InvoiceActionState,
  formData: FormData
): Promise<InvoiceActionState> {
  const auth = await requireAdmin();
  if (auth.error) return { error: auth.error };
  const ctx = auth.ctx!;

  const invoiceId = (formData.get("invoice_id") as string | null)?.trim();
  if (!invoiceId) return { error: "Missing invoice ID." };

  const amount = parseMoney(formData.get("paid_amount") as string | null);
  if (amount === null) return { error: "Paid amount is required." };
  if (amount <= 0) return { error: "Paid amount must be greater than zero." };

  const { data: invoice, error: readErr } = await ctx.supabase
    .from("invoices")
    .select("id, project_id, status, total_amount, invoice_number")
    .eq("id", invoiceId)
    .single();
  if (readErr || !invoice) {
    return {
      error:
        "Invoice not found. It may have been voided or deleted — refresh the page and try again.",
    };
  }
  if (!["sent", "partially_paid"].includes(invoice.status as string)) {
    return {
      error: "Partial payment can only be recorded on sent or partially paid invoices.",
    };
  }

  const total = Number(invoice.total_amount ?? 0);
  if (amount >= total) {
    return {
      error: `Partial payment must be less than the total (${fmtMoney(total)}). Use "Mark Paid" instead.`,
    };
  }

  const { data: updRows, error: updErr } = await ctx.supabase
    .from("invoices")
    .update({ status: "partially_paid", paid_amount: amount })
    .eq("id", invoiceId)
    .in("status", ["sent", "partially_paid"])
    .select("id");
  if (updErr) {
    console.error("markInvoicePartiallyPaid: update error", updErr);
    return { error: "Failed to record partial payment." };
  }
  if (!updRows?.length) {
    return {
      error:
        "Invoice state changed in another tab — refresh the page to see the current status, then retry.",
    };
  }

  await logActivity(
    ctx,
    invoice.project_id as string,
    `Partial payment recorded: ${fmtMoney(amount)} (${invoice.invoice_number})`,
    {
      invoice_id: invoiceId,
      invoice_number: invoice.invoice_number,
      paid_amount: amount,
      total_amount: total,
      outstanding: roundMoney(total - amount),
    }
  );

  await refreshProjectBillingCache(ctx.supabase, invoice.project_id as string);
  revalidatePath(`/admin/projects/${invoice.project_id}`);

  return { error: null, success: "Partial payment recorded.", invoiceId };
}

// ─────────────────────────────────────────────────────────────────────────────
// markInvoicePaid
// ─────────────────────────────────────────────────────────────────────────────

export async function markInvoicePaid(
  _prev: InvoiceActionState,
  formData: FormData
): Promise<InvoiceActionState> {
  const auth = await requireAdmin();
  if (auth.error) return { error: auth.error };
  const ctx = auth.ctx!;

  const invoiceId = (formData.get("invoice_id") as string | null)?.trim();
  if (!invoiceId) return { error: "Missing invoice ID." };

  const { data: invoice, error: readErr } = await ctx.supabase
    .from("invoices")
    .select("id, project_id, status, total_amount, invoice_number")
    .eq("id", invoiceId)
    .single();
  if (readErr || !invoice) {
    return {
      error:
        "Invoice not found. It may have been voided or deleted — refresh the page and try again.",
    };
  }
  if (!["sent", "partially_paid"].includes(invoice.status as string)) {
    return {
      error: "Invoice must be sent or partially paid before marking paid.",
    };
  }

  const paidAt = new Date().toISOString();
  const total = Number(invoice.total_amount ?? 0);

  const { data: updRows, error: updErr } = await ctx.supabase
    .from("invoices")
    .update({
      status: "paid",
      paid_amount: total,
      paid_at: paidAt,
    })
    .eq("id", invoiceId)
    .in("status", ["sent", "partially_paid"])
    .select("id");
  if (updErr) {
    console.error("markInvoicePaid: update error", updErr);
    return { error: "Failed to mark invoice paid." };
  }
  if (!updRows?.length) {
    return {
      error:
        "Invoice state changed in another tab — refresh the page to see the current status, then retry.",
    };
  }

  await logActivity(
    ctx,
    invoice.project_id as string,
    `Invoice paid (${invoice.invoice_number})`,
    {
      invoice_id: invoiceId,
      invoice_number: invoice.invoice_number,
      paid_at: paidAt,
      paid_amount: total,
    }
  );

  await refreshProjectBillingCache(ctx.supabase, invoice.project_id as string);
  revalidatePath(`/admin/projects/${invoice.project_id}`);

  return { error: null, success: "Invoice marked paid.", invoiceId };
}

// ─────────────────────────────────────────────────────────────────────────────
// voidInvoice
// ─────────────────────────────────────────────────────────────────────────────

export async function voidInvoice(
  _prev: InvoiceActionState,
  formData: FormData
): Promise<InvoiceActionState> {
  const auth = await requireAdmin();
  if (auth.error) return { error: auth.error };
  const ctx = auth.ctx!;

  const invoiceId = (formData.get("invoice_id") as string | null)?.trim();
  if (!invoiceId) return { error: "Missing invoice ID." };

  const reason = (formData.get("voided_reason") as string | null)?.trim();
  if (!reason) return { error: "A reason is required to void an invoice." };

  const { data: invoice, error: readErr } = await ctx.supabase
    .from("invoices")
    .select("id, project_id, status, invoice_number")
    .eq("id", invoiceId)
    .single();
  if (readErr || !invoice) {
    return {
      error:
        "Invoice not found. It may have been voided or deleted — refresh the page and try again.",
    };
  }
  if (invoice.status === "void") {
    return { error: "Invoice is already voided." };
  }

  const voidedAt = new Date().toISOString();

  const { data: updRows, error: updErr } = await ctx.supabase
    .from("invoices")
    .update({
      status: "void",
      voided_at: voidedAt,
      voided_reason: reason,
    })
    .eq("id", invoiceId)
    .neq("status", "void")
    .select("id");
  if (updErr) {
    console.error("voidInvoice: update error", updErr);
    return { error: "Failed to void invoice." };
  }
  if (!updRows?.length) {
    return {
      error:
        "Invoice state changed in another tab — refresh the page to see the current status, then retry.",
    };
  }

  await logActivity(
    ctx,
    invoice.project_id as string,
    `Invoice voided: ${reason} (${invoice.invoice_number})`,
    {
      invoice_id: invoiceId,
      invoice_number: invoice.invoice_number,
      voided_reason: reason,
      voided_at: voidedAt,
    }
  );

  await refreshProjectBillingCache(ctx.supabase, invoice.project_id as string);
  revalidatePath(`/admin/projects/${invoice.project_id}`);
  revalidatePath("/admin/billing");

  return { error: null, success: "Invoice voided.", invoiceId };
}

// ─────────────────────────────────────────────────────────────────────────────
// deleteDraftInvoice
//
// Hard-delete a draft invoice and reset the project's billing_status back to
// `ready_to_invoice`. Only drafts can be deleted — sent / paid / void invoices
// must be voided instead (they have a persisted PDF + downstream consumers).
//
// Exposed in two shapes:
//   * `deleteDraftInvoice(prev, formData)` — useActionState shape, for the
//     BillingPanel inline button which surfaces error/success state.
//   * `deleteDraftInvoiceFromForm(formData)` — void wrapper for the queue's
//     trash icon, which binds directly to <form action> and doesn't need a
//     reactive error channel (confirm() guards user intent up front).
//
// Both go through the same body so the audit log + cache refresh + revalidate
// behavior is identical.
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteDraftInvoice(
  _prev: InvoiceActionState,
  formData: FormData
): Promise<InvoiceActionState> {
  const auth = await requireAdmin();
  if (auth.error) return { error: auth.error };
  const ctx = auth.ctx!;

  const invoiceId = (formData.get("invoice_id") as string | null)?.trim();
  if (!invoiceId) return { error: "Missing invoice ID." };

  const { data: invoice, error: readErr } = await ctx.supabase
    .from("invoices")
    .select("id, project_id, status, invoice_number")
    .eq("id", invoiceId)
    .single();
  if (readErr || !invoice) return { error: "Invoice not found." };
  if (invoice.status !== "draft") {
    return { error: "Only draft invoices can be deleted." };
  }

  // Status guard on the DELETE catches a concurrent send: if the invoice
  // flipped to "sent" between the read and the delete, no rows match.
  const { error: delErr, count } = await ctx.supabase
    .from("invoices")
    .delete({ count: "exact" })
    .eq("id", invoiceId)
    .eq("status", "draft");
  if (delErr) {
    console.error("deleteDraftInvoice: delete error", delErr);
    return { error: "Failed to delete invoice." };
  }
  if (!count) {
    return {
      error:
        "Invoice changed state in another tab (no longer a draft). Refresh the page to see the latest status.",
    };
  }

  // Project flips back to ready_to_invoice — the package is still good,
  // we just removed the draft. Admins can create a new draft immediately.
  const { data: currentRow } = await ctx.supabase
    .from("projects")
    .select("status")
    .eq("id", invoice.project_id)
    .single();
  const currentStatus = (currentRow?.status as string) ?? "";

  await ctx.supabase
    .from("projects")
    .update({
      billing_status: "ready_to_invoice",
      unified_status: resolveUnifiedStatus(currentStatus, "ready_to_invoice"),
    })
    .eq("id", invoice.project_id);

  await refreshProjectBillingCache(ctx.supabase, invoice.project_id as string);

  await logActivity(
    ctx,
    invoice.project_id as string,
    `Draft invoice deleted: ${invoice.invoice_number}`,
    { invoice_id: invoiceId, invoice_number: invoice.invoice_number }
  );

  revalidatePath(`/admin/projects/${invoice.project_id}`);
  revalidatePath("/admin/billing");

  return { error: null, success: "Draft deleted.", invoiceId };
}

/**
 * Void-returning wrapper for use with `<form action={...}>` (no useActionState).
 * Errors get logged inside `deleteDraftInvoice`; this caller surface trades
 * inline error UI for a simpler binding suited to the queue's trash icon
 * (which already guards intent with a native confirm).
 */
export async function deleteDraftInvoiceFromForm(
  formData: FormData
): Promise<void> {
  const result = await deleteDraftInvoice({ error: null }, formData);
  if (result.error) {
    console.error("deleteDraftInvoiceFromForm:", result.error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// sendInvoice — Phase C
//
// Freezes a draft invoice into a sent invoice:
//   1. Verifies guards (admin, status=draft, ≥1 line item, totals consistent).
//   2. Refinalizes the pricing_snapshot so calculation.discount_amount /
//      calculation.total match the actual invoice row, and embeds the current
//      line items as line_items_snapshot. Adds a "Finalized at send time."
//      resolution_trail entry.
//   3. Generates a PDF from invoice + line items via generateInvoiceFromLineItems.
//      invoice_notes are NEVER baked into the persisted PDF — they are
//      admin-only and the same byte-frozen PDF will be served to company users.
//   4. Uploads the PDF to the invoices bucket at {invoice_id}/invoice.pdf.
//   5. Updates the invoice row: status='sent', sent_at, sent_by, recipient_*,
//      send_notes, pdf_storage_path, pricing_snapshot.
//      Status guard `.eq('status', 'draft')` so a concurrent transition does
//      not allow this to silently corrupt a non-draft.
//   6. Inserts a project_files row of category 'invoice_attachment' linked
//      back to the invoice via invoice_id (added in Phase A migration).
//   7. Logs to project_activity, refreshes the project billing cache,
//      revalidates the project page.
//
// Failure semantics:
//   * PDF generation / upload failure → invoice stays draft. Return error.
//   * Invoice update failure AFTER upload → orphan PDF in storage. Logged
//     loudly; subsequent send retry will overwrite (same path).
//   * project_files insert failure → non-fatal. Invoice is already sent and
//     downloadable. Warning logged.
//
// This action does NOT send email. "Send" here means "finalize + persist".
// ─────────────────────────────────────────────────────────────────────────────

export async function sendInvoice(
  _prev: InvoiceActionState,
  formData: FormData
): Promise<InvoiceActionState> {
  const auth = await requireAdmin();
  if (auth.error) return { error: auth.error };
  const ctx = auth.ctx!;

  const invoiceId = (formData.get("invoice_id") as string | null)?.trim();
  if (!invoiceId) return { error: "Missing invoice ID." };

  // ── 1. Read invoice + project context ───────────────────────────────────────
  const { data: invoice, error: readErr } = await ctx.supabase
    .from("invoices")
    .select(
      `
        id, project_id, status, invoice_number,
        invoice_date, due_date,
        subtotal, discount_amount, total_amount,
        recipient_name, recipient_email, send_notes,
        pricing_snapshot
      `
    )
    .eq("id", invoiceId)
    .single();
  if (readErr || !invoice) {
    return {
      error:
        "Invoice not found. It may have been voided or deleted — refresh the page and try again.",
    };
  }
  if (invoice.status !== "draft") {
    return { error: "Only draft invoices can be sent." };
  }

  // ── 2. Read line items + verify ─────────────────────────────────────────────
  const { data: items, error: itemsErr } = await ctx.supabase
    .from("invoice_line_items")
    .select("id, description, quantity, unit_price, line_total, sort_order")
    .eq("invoice_id", invoiceId)
    .order("sort_order", { ascending: true });
  if (itemsErr) {
    console.error("sendInvoice: read line items error", itemsErr);
    return { error: "Failed to read line items." };
  }
  if (!items || items.length === 0) {
    return { error: "Invoice must have at least one line item before sending." };
  }

  // Totals consistency: subtotal should equal sum of line_totals; total =
  // subtotal − discount. Defensive — Phase B keeps these in sync, but bad
  // direct DB edits could desync. Reject loudly rather than persisting a
  // mismatch in the snapshot.
  const computedSubtotal = roundMoney(
    items.reduce((sum, r) => sum + Number(r.line_total ?? 0), 0)
  );
  const invoiceSubtotal = Number(invoice.subtotal ?? 0);
  const invoiceDiscount = Number(invoice.discount_amount ?? 0);
  const invoiceTotal    = Number(invoice.total_amount ?? 0);
  const expectedTotal   = roundMoney(invoiceSubtotal - invoiceDiscount);

  if (Math.abs(computedSubtotal - invoiceSubtotal) > 0.01) {
    return {
      error: `Subtotal mismatch (line items: ${fmtMoney(computedSubtotal)}, invoice: ${fmtMoney(invoiceSubtotal)}). Edit a line item to trigger a recompute, then try again.`,
    };
  }
  if (Math.abs(invoiceTotal - expectedTotal) > 0.01) {
    return {
      error: `Total mismatch (subtotal − discount: ${fmtMoney(expectedTotal)}, invoice: ${fmtMoney(invoiceTotal)}). Edit the discount to trigger a recompute, then try again.`,
    };
  }

  // ── 3. Read project + company + authority for PDF rendering ─────────────────
  const { data: project, error: projErr } = await ctx.supabase
    .from("projects")
    .select(
      `
        id, job_number, job_name, submission_date,
        company_id, authority_id
      `
    )
    .eq("id", invoice.project_id)
    .single();
  if (projErr || !project) return { error: "Project not found for invoice." };

  let companyName = "—";
  if (project.company_id) {
    const { data: companyRow } = await ctx.supabase
      .from("companies")
      .select("name")
      .eq("id", project.company_id)
      .single();
    if (companyRow?.name) companyName = companyRow.name as string;
  }

  let authorityName: string | null = null;
  if (project.authority_id) {
    const { data: authRow } = await ctx.supabase
      .from("authority_profiles")
      .select("name")
      .eq("id", project.authority_id)
      .single();
    authorityName = (authRow?.name as string | null) ?? null;
  }

  // ── 4. Capture optional send-time inputs ────────────────────────────────────
  // If formData supplies a field, use it; otherwise preserve any value
  // already on the invoice (set via updateDraftInvoice).
  const formHas = (k: string) => formData.has(k);
  const formStr = (k: string) =>
    (formData.get(k) as string | null)?.trim() ?? "";

  const recipientName: string | null = formHas("recipient_name")
    ? formStr("recipient_name") || null
    : (invoice.recipient_name as string | null) ?? null;
  const recipientEmail: string | null = formHas("recipient_email")
    ? formStr("recipient_email") || null
    : (invoice.recipient_email as string | null) ?? null;
  const sendNotes: string | null = formHas("send_notes")
    ? formStr("send_notes") || null
    : (invoice.send_notes as string | null) ?? null;

  // ── 5. Refinalize the pricing snapshot ──────────────────────────────────────
  // Take the existing snapshot if it's already V1-shaped; otherwise build a
  // fresh one. Then overwrite the calculation block to match the actual
  // invoice totals, embed the canonical line items, and append a finalization
  // entry to resolution_trail.
  let baseSnapshot: PricingSnapshotV1;
  const existing = invoice.pricing_snapshot as unknown;
  if (
    existing &&
    typeof existing === "object" &&
    (existing as { schema_version?: number }).schema_version === 1
  ) {
    baseSnapshot = existing as PricingSnapshotV1;
  } else {
    baseSnapshot = await buildPricingSnapshot(
      ctx.supabase,
      invoice.project_id as string,
      ctx.actorLabel
    );
  }

  const finalSnapshot: PricingSnapshotV1 = {
    ...baseSnapshot,
    generated_at: new Date().toISOString(),
    calculation: {
      ...baseSnapshot.calculation,
      discount_amount: invoiceDiscount,
      total: invoiceTotal,
    },
    line_items_snapshot: items.map((it) => ({
      id: it.id as string,
      description: (it.description as string) ?? "",
      quantity: Number(it.quantity ?? 0),
      unit_price: Number(it.unit_price ?? 0),
      line_total: Number(it.line_total ?? 0),
      sort_order: Number(it.sort_order ?? 0),
    })),
    resolution_trail: [
      ...(baseSnapshot.resolution_trail ?? []),
      `Finalized at send time by ${ctx.actorLabel}.`,
    ],
  };

  // ── 6. Generate the PDF (invoice_notes intentionally omitted) ───────────────
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateInvoiceFromLineItems({
      invoiceNumber:  invoice.invoice_number as string,
      invoiceDate:    invoice.invoice_date as string,
      dueDate:        (invoice.due_date as string | null) ?? null,
      jobNumber:      (project.job_number as string) ?? "",
      jobName:        (project.job_name as string) ?? "",
      companyName,
      authorityName,
      submittedAt:    (project.submission_date as string | null) ?? null,
      lineItems: items.map((it) => ({
        description: (it.description as string) ?? "",
        quantity:    Number(it.quantity ?? 0),
        unit_price:  Number(it.unit_price ?? 0),
        line_total:  Number(it.line_total ?? 0),
      })),
      subtotal:       invoiceSubtotal,
      discountAmount: invoiceDiscount,
      total:          invoiceTotal,
      invoiceNotes:   null,          // admin-only; never baked into persisted PDF
      billingStatus:  "sent",
    });
  } catch (e) {
    console.error("sendInvoice: PDF generation error", e);
    return { error: "Failed to generate invoice PDF. Invoice remains draft." };
  }

  // ── 7. Upload to the invoices bucket ────────────────────────────────────────
  const pdfPath = `${invoiceId}/invoice.pdf`;
  const { error: uploadErr } = await ctx.supabase.storage
    .from("invoices")
    .upload(pdfPath, Buffer.from(pdfBytes), {
      contentType: "application/pdf",
      upsert: true,                  // re-send retries overwrite the same path
    });
  if (uploadErr) {
    console.error("sendInvoice: upload error", uploadErr);
    return { error: "Failed to upload invoice PDF to storage. Invoice remains draft." };
  }

  const sentAt = new Date().toISOString();

  // ── 8. Flip the invoice to sent (guarded on status='draft') ─────────────────
  const { data: updRows, error: updErr } = await ctx.supabase
    .from("invoices")
    .update({
      status:           "sent",
      sent_at:          sentAt,
      sent_by:          ctx.actorLabel,
      recipient_name:   recipientName,
      recipient_email:  recipientEmail,
      send_notes:       sendNotes,
      pdf_storage_path: pdfPath,
      pricing_snapshot: finalSnapshot,
    })
    .eq("id", invoiceId)
    .eq("status", "draft")
    .select("id");
  if (updErr) {
    console.error(
      "sendInvoice: CRITICAL — PDF uploaded but invoice update failed. Orphan PDF at",
      pdfPath,
      updErr
    );
    return {
      error:
        "PDF uploaded but invoice update failed. The invoice is still draft; retrying send will overwrite the storage file.",
    };
  }
  if (!updRows?.length) {
    console.error(
      "sendInvoice: CRITICAL — PDF uploaded but invoice was no longer draft. Orphan PDF at",
      pdfPath
    );
    return { error: "Invoice was no longer in draft state. PDF was uploaded but not linked." };
  }

  // ── 9. Link the file via project_files (non-fatal) ──────────────────────────
  const { error: fileErr } = await ctx.supabase.from("project_files").insert({
    project_id:      invoice.project_id,
    uploaded_by:     null,                 // system-generated; mirrors workflow webhook
    file_category:   "invoice_attachment",
    file_type:       "generated",
    file_name:       `invoice-${invoice.invoice_number}.pdf`,
    storage_path:    pdfPath,
    file_size_bytes: pdfBytes.byteLength,
    mime_type:       "application/pdf",
    uploader_label:  "System",
    source:          "system_generated",
    invoice_id:      invoiceId,
  });
  if (fileErr) {
    // Non-fatal — the invoice is still sent and downloadable via the
    // invoices route. Log so the admin can investigate if needed.
    console.warn(
      "sendInvoice: project_files insert failed; PDF is sent but not linked in project files list:",
      fileErr
    );
  }

  // ── 10. Activity + cache refresh ────────────────────────────────────────────
  await logActivity(
    ctx,
    invoice.project_id as string,
    `Invoice sent (${invoice.invoice_number})`,
    {
      invoice_id:       invoiceId,
      invoice_number:   invoice.invoice_number,
      total_amount:     invoiceTotal,
      subtotal:         invoiceSubtotal,
      discount_amount:  invoiceDiscount,
      recipient_name:   recipientName,
      recipient_email:  recipientEmail,
      send_notes:       sendNotes,
      pdf_storage_path: pdfPath,
      line_item_count:  items.length,
    }
  );

  await refreshProjectBillingCache(ctx.supabase, invoice.project_id as string);
  revalidatePath(`/admin/projects/${invoice.project_id}`);

  return {
    error: null,
    success: `Invoice ${invoice.invoice_number} sent.`,
    invoiceId,
  };
}
