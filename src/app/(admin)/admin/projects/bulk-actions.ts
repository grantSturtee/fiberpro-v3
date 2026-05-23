"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveUnifiedStatus } from "@/lib/status/unifiedMapping";
import type { UnifiedProjectStatus } from "@/types/domain";

export type BulkActionResult = {
  updated: number;
  // `id` is included so the client can reconstruct which rows remain to be acted on.
  skipped: { id: string; jobNumber: string; reason: string }[];
  error: string | null;
};

// ── Shared helpers ────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireAdminClient() {
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

function validateIds(
  projectIds: string[]
): string | null {
  if (!Array.isArray(projectIds) || projectIds.length === 0) return "No projects selected.";
  if (projectIds.length > 100) return "Select 100 or fewer projects at a time.";
  if (projectIds.some((id) => !UUID_RE.test(id))) return "Invalid project ID in selection.";
  return null;
}

// ── Bulk: submitted → waiting_on_authority ────────────────────────────────────
//
// Eligibility: status = 'submitted'
//
// Writes: status → waiting_on_authority
//
// updated count and activity log both derive from rows the DB actually changed
// (via .select("id")), not from the pre-write eligibility check, so a race that
// transitions a row between the read and the write cannot inflate the count or
// produce a phantom activity log entry.

export async function bulkMarkWaitingOnAuthority(
  projectIds: string[]
): Promise<BulkActionResult> {
  const empty: BulkActionResult = { updated: 0, skipped: [], error: null };

  const { supabase, actorLabel, error: authError } = await requireAdminClient();
  if (authError || !supabase || !actorLabel) return { ...empty, error: authError };

  const inputError = validateIds(projectIds);
  if (inputError) return { ...empty, error: inputError };

  // ── Server-side status validation ─────────────────────────────────────────────
  const { data: rows, error: fetchError } = await supabase
    .from("projects")
    .select("id, job_number, status, billing_status")
    .in("id", projectIds);

  if (fetchError || !rows) return { ...empty, error: "Failed to read project statuses." };

  const skipped: BulkActionResult["skipped"] = [];
  const eligible: typeof rows = [];

  for (const r of rows) {
    if (r.status === "submitted") {
      eligible.push(r);
    } else {
      skipped.push({
        id:        r.id as string,
        jobNumber: r.job_number as string,
        reason:    `Status is "${r.status}" (expected "submitted")`,
      });
    }
  }

  // IDs in the caller's input that the DB didn't return — project doesn't exist.
  const foundIds = new Set(rows.map((r) => r.id));
  for (const id of projectIds) {
    if (!foundIds.has(id)) {
      skipped.push({ id, jobNumber: id, reason: "Project not found" });
    }
  }

  if (eligible.length === 0) return { updated: 0, skipped, error: null };

  // ── Write — group eligible rows by target unified_status, then bulk-update ────
  // per group. The new project status is the same for all rows
  // ('waiting_on_authority'), but unified_status depends on each row's current
  // billing_status. The WHERE status = 'submitted' guard handles races: any row
  // that transitioned between our read and this write is silently excluded from
  // both the count and the activity log.
  const groups = new Map<UnifiedProjectStatus, string[]>();
  for (const r of eligible) {
    const u = resolveUnifiedStatus("waiting_on_authority", r.billing_status as string);
    const arr = groups.get(u) ?? [];
    arr.push(r.id as string);
    groups.set(u, arr);
  }

  const actuallyUpdatedIds: string[] = [];
  for (const [unified, ids] of groups.entries()) {
    const { data: updatedRows, error: updateError } = await supabase
      .from("projects")
      .update({ status: "waiting_on_authority", unified_status: unified })
      .in("id", ids)
      .eq("status", "submitted")
      .select("id");

    if (updateError) {
      console.error("bulkMarkWaitingOnAuthority update error:", updateError);
      return { ...empty, skipped, error: "Database update failed." };
    }
    actuallyUpdatedIds.push(...(updatedRows ?? []).map((r) => r.id as string));
  }

  // ── Activity log — only for rows the DB confirmed as changed ─────────────────
  await Promise.all(
    actuallyUpdatedIds.map((id) =>
      supabase.from("project_activity").insert({
        project_id:  id,
        actor_label: actorLabel,
        action:      "Marked awaiting authority response (bulk)",
        metadata:    { bulk: true, batch_size: actuallyUpdatedIds.length },
      })
    )
  );

  revalidatePath("/admin/projects");

  return { updated: actuallyUpdatedIds.length, skipped, error: null };
}

// ── Bulk: draft_invoice → invoiced ────────────────────────────────────────────
//
// Eligibility (both required):
//   1. billing_status = 'draft_invoice'
//   2. invoice_number IS NOT NULL and not blank
//
// Writes:
//   billing_status  → invoiced
//   invoice_sent_at → now()
//   invoice_sent_by → actorLabel
//
// Does NOT capture recipient metadata — that belongs to the per-project
// markInvoiceSent flow. This action is for batch housekeeping when invoices
// have already been sent outside the system.

export async function bulkMarkInvoiceSent(
  projectIds: string[]
): Promise<BulkActionResult> {
  const empty: BulkActionResult = { updated: 0, skipped: [], error: null };

  const { supabase, actorLabel, error: authError } = await requireAdminClient();
  if (authError || !supabase || !actorLabel) return { ...empty, error: authError };

  const inputError = validateIds(projectIds);
  if (inputError) return { ...empty, error: inputError };

  // ── Server-side eligibility validation ───────────────────────────────────────
  const { data: rows, error: fetchError } = await supabase
    .from("projects")
    .select("id, job_number, status, billing_status, invoice_number")
    .in("id", projectIds);

  if (fetchError || !rows) return { ...empty, error: "Failed to read project data." };

  // Phase F: pre-check for new-system invoices. If a selected project has a
  // non-void invoice in the new table, the legacy bulk-mark-sent flow would
  // change projects.billing_status without going through sendInvoice (no PDF
  // persisted, no snapshot frozen, no project_files row). Skip those rows
  // with a clear reason rather than corrupting their state.
  const { data: authoritativeRows, error: invFetchError } = await supabase
    .from("invoices")
    .select("project_id")
    .in("project_id", projectIds)
    .neq("status", "void");
  if (invFetchError) {
    console.error("bulkMarkInvoiceSent: invoice precheck failed", invFetchError);
    return { ...empty, error: "Failed to verify invoice state for the selection." };
  }
  const blockedByInvoice = new Set(
    (authoritativeRows ?? []).map((r) => r.project_id as string)
  );

  const skipped: BulkActionResult["skipped"] = [];
  const eligible: typeof rows = [];

  for (const r of rows) {
    if (blockedByInvoice.has(r.id as string)) {
      skipped.push({
        id:        r.id as string,
        jobNumber: r.job_number as string,
        reason:    "Has a new-system invoice — use the invoice's Send action instead.",
      });
    } else if (r.billing_status !== "draft_invoice") {
      skipped.push({
        id:        r.id as string,
        jobNumber: r.job_number as string,
        reason:    `Billing status is "${r.billing_status}" (expected "draft_invoice")`,
      });
    } else if (!r.invoice_number || (r.invoice_number as string).trim() === "") {
      skipped.push({
        id:        r.id as string,
        jobNumber: r.job_number as string,
        reason:    "No invoice number set — add one before marking sent",
      });
    } else {
      eligible.push(r);
    }
  }

  const foundIds = new Set(rows.map((r) => r.id));
  for (const id of projectIds) {
    if (!foundIds.has(id)) {
      skipped.push({ id, jobNumber: id, reason: "Project not found" });
    }
  }

  if (eligible.length === 0) return { updated: 0, skipped, error: null };

  const sentAt = new Date().toISOString();

  // ── Write — group by target unified_status, then bulk-update per group. ───────
  // New billing is the same for all eligible rows ('invoiced'), but unified
  // depends on each row's current project status (ready_for_submission →
  // invoice_sent, submitted/waiting_on_authority/etc. → permit_billed).
  // WHERE guards: status, billing_status, invoice_number (and .neq covers
  // the empty-string race).
  const groups = new Map<UnifiedProjectStatus, string[]>();
  for (const r of eligible) {
    const u = resolveUnifiedStatus(r.status as string, "invoiced");
    const arr = groups.get(u) ?? [];
    arr.push(r.id as string);
    groups.set(u, arr);
  }

  const actuallyUpdatedIds: string[] = [];
  for (const [unified, ids] of groups.entries()) {
    const { data: updatedRows, error: updateError } = await supabase
      .from("projects")
      .update({
        billing_status:  "invoiced",
        unified_status:  unified,
        invoice_sent_at: sentAt,
        invoice_sent_by: actorLabel,
      })
      .in("id", ids)
      .eq("billing_status", "draft_invoice")
      .not("invoice_number", "is", null)
      .neq("invoice_number", "")
      .select("id");

    if (updateError) {
      console.error("bulkMarkInvoiceSent update error:", updateError);
      return { ...empty, skipped, error: "Database update failed." };
    }
    actuallyUpdatedIds.push(...(updatedRows ?? []).map((r) => r.id as string));
  }

  // ── Activity log — keyed to invoice_number from the pre-read ─────────────────
  // Build a lookup so each log entry records the invoice number for that project.
  const invoiceNumberById = new Map(
    eligible.map((r) => [r.id as string, r.invoice_number as string])
  );

  await Promise.all(
    actuallyUpdatedIds.map((id) =>
      supabase.from("project_activity").insert({
        project_id:  id,
        actor_label: actorLabel,
        action:      `Invoice marked sent (bulk) — ${invoiceNumberById.get(id) ?? ""}`,
        metadata:    {
          bulk:            true,
          batch_size:      actuallyUpdatedIds.length,
          invoice_sent_at: sentAt,
          invoice_sent_by: actorLabel,
        },
      })
    )
  );

  revalidatePath("/admin/projects");

  return { updated: actuallyUpdatedIds.length, skipped, error: null };
}
