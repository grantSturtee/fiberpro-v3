/**
 * Invoice queries.
 *
 * Most helpers in this file are admin-only — they select the FULL row,
 * including admin-only fields (invoice_notes, pricing_snapshot, send_notes,
 * sent_by, created_by). Those are intended for use inside admin server
 * actions and admin pages.
 *
 * The one exception is `getCompanyInvoices` at the bottom: it explicitly
 * selects only the InvoicePublic column set so that company users (who can
 * see the row under RLS) don't receive admin-only fields in their payload.
 * Keep that helper as the single source of truth for company-facing queries.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Invoice,
  InvoiceLineItem,
  InvoicePublic,
  InvoiceStatus,
  PricingSnapshotV1,
} from "@/types/invoice";
import type { BillingStatus } from "@/types/domain";

const INVOICE_COLUMNS = `
  id, project_id,
  invoice_number, status,
  invoice_date, due_date,
  subtotal, discount_amount, total_amount,
  pricing_snapshot,
  invoice_notes, send_notes, sent_by, created_by,
  recipient_name, recipient_email,
  sent_at, paid_at, paid_amount,
  voided_at, voided_reason,
  parent_invoice_id, pdf_storage_path,
  created_at, updated_at
` as const;

const LINE_ITEM_COLUMNS = `
  id, invoice_id, description, quantity, unit_price, line_total,
  sort_order, metadata, created_at
` as const;

// ── Get all invoices for a project ────────────────────────────────────────────
//
// Returns invoices newest-first with each row's line items attached. Phase E2
// surfaces (BillingPanel, InvoiceListSection) all need line items to support
// inline editing for drafts and frozen display for sent invoices.

export type InvoiceWithItems = Invoice & {
  line_items: InvoiceLineItem[];
};

export async function getProjectInvoices(
  supabase: SupabaseClient,
  projectId: string
): Promise<InvoiceWithItems[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getProjectInvoices error:", error);
    return [];
  }
  const invoices = (data ?? []) as unknown as Invoice[];
  if (invoices.length === 0) return [];

  const ids = invoices.map((i) => i.id);
  const { data: items, error: itemsError } = await supabase
    .from("invoice_line_items")
    .select(LINE_ITEM_COLUMNS)
    .in("invoice_id", ids)
    .order("sort_order", { ascending: true });

  if (itemsError) {
    console.error("getProjectInvoices line items error:", itemsError);
    return invoices.map((inv) => ({ ...inv, line_items: [] }));
  }

  const itemsByInvoice = new Map<string, InvoiceLineItem[]>();
  for (const it of (items ?? []) as unknown as InvoiceLineItem[]) {
    const list = itemsByInvoice.get(it.invoice_id) ?? [];
    list.push(it);
    itemsByInvoice.set(it.invoice_id, list);
  }

  return invoices.map((inv) => ({
    ...inv,
    line_items: itemsByInvoice.get(inv.id) ?? [],
  }));
}

// ── Get a single invoice by id, optionally with line items ───────────────────

export async function getInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
  options?: { includeLineItems?: boolean }
): Promise<{ invoice: Invoice; lineItems?: InvoiceLineItem[] } | null> {
  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_COLUMNS)
    .eq("id", invoiceId)
    .single();

  if (error || !data) {
    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows (PostgREST single-row error). Suppress that log;
      // surface anything else.
      console.error("getInvoice error:", error);
    }
    return null;
  }

  const invoice = data as unknown as Invoice;

  if (!options?.includeLineItems) {
    return { invoice };
  }

  const { data: items, error: itemError } = await supabase
    .from("invoice_line_items")
    .select(LINE_ITEM_COLUMNS)
    .eq("invoice_id", invoiceId)
    .order("sort_order", { ascending: true });

  if (itemError) {
    console.error("getInvoice line items error:", itemError);
    return { invoice, lineItems: [] };
  }

  return { invoice, lineItems: (items ?? []) as unknown as InvoiceLineItem[] };
}

// ── Get an invoice + line items for PDF generation ────────────────────────────
// Bundled accessor used by future PDF generation code (Phase C). Always
// includes line items. Returns null if the invoice is missing.

export async function getInvoiceForPdf(
  supabase: SupabaseClient,
  invoiceId: string
): Promise<{ invoice: Invoice; lineItems: InvoiceLineItem[] } | null> {
  const result = await getInvoice(supabase, invoiceId, { includeLineItems: true });
  if (!result) return null;
  return { invoice: result.invoice, lineItems: result.lineItems ?? [] };
}

// =============================================================================
// Phase E1 — billing-page helpers
// =============================================================================

// ── Billing queue: projects that need invoice action ─────────────────────────
//
// A project is queued when its mirrored billing_status is "ready_to_invoice"
// or "draft_invoice" — those are the two operationally-actionable states
// where an admin should either create a draft or finalize an existing one.
//
// Returns rows flat-enough for the UI to render without further joins.
// Capped to 100 to keep the page snappy even on busy days.

export type BillingQueueRow = {
  id: string;
  job_number: string;
  job_name: string;
  billing_status: BillingStatus;
  estimated_price: number | null;
  base_price: number | null;
  discount_amount: number;
  updated_at: string;
  created_at: string;
  company_name: string | null;
  authority_name: string | null;
  jurisdiction_name: string | null;
  package_generated_at: string | null;
  latest_invoice: {
    id: string;
    status: InvoiceStatus;
    invoice_number: string;
    total_amount: number;
    paid_amount: number | null;
    recipient_email: string | null;
  } | null;
};

export async function getBillingQueue(
  supabase: SupabaseClient,
  opts?: { limit?: number }
): Promise<BillingQueueRow[]> {
  const limit = opts?.limit ?? 100;

  // 1. Projects in actionable billing states (E3: include sent + partial so the
  //    queue covers the full "needs admin touch" lifecycle. Paid and hold and
  //    not_ready are intentionally excluded — they're not actionable).
  const { data: projects, error: pErr } = await supabase
    .from("projects")
    .select(
      `
        id, job_number, job_name,
        billing_status, estimated_price, base_price, discount_amount,
        updated_at, created_at,
        companies ( name ),
        authority_profiles ( name ),
        jurisdictions ( authority_name )
      `
    )
    .in("billing_status", [
      "ready_to_invoice",
      "draft_invoice",
      "invoiced",
      "partially_paid",
      "paid",
      "hold",
    ])
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (pErr) {
    console.error("getBillingQueue: projects fetch error", pErr);
    return [];
  }
  if (!projects || projects.length === 0) return [];

  const projectIds = projects.map((p) => p.id as string);

  // 2 + 3. Latest non-void invoice and latest completed package generation
  //        per project. Both depend on projectIds from step 1, but are
  //        independent of each other — fire in parallel.
  const [{ data: invoices }, { data: pkgJobs }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, project_id, status, invoice_number, total_amount, paid_amount, recipient_email, created_at"
      )
      .in("project_id", projectIds)
      .neq("status", "void")
      .order("created_at", { ascending: false }),
    supabase
      .from("workflow_jobs")
      .select("project_id, completed_at")
      .in("project_id", projectIds)
      .eq("job_type", "generate_permit_package")
      .eq("status", "completed")
      .order("completed_at", { ascending: false }),
  ]);

  const invoiceByProject = new Map<
    string,
    {
      id: string;
      status: InvoiceStatus;
      invoice_number: string;
      total_amount: number;
      paid_amount: number | null;
      recipient_email: string | null;
    }
  >();
  for (const inv of invoices ?? []) {
    const pid = inv.project_id as string;
    if (!invoiceByProject.has(pid)) {
      invoiceByProject.set(pid, {
        id: inv.id as string,
        status: inv.status as InvoiceStatus,
        invoice_number: inv.invoice_number as string,
        total_amount: Number(inv.total_amount ?? 0),
        paid_amount: inv.paid_amount != null ? Number(inv.paid_amount) : null,
        recipient_email: (inv.recipient_email as string | null) ?? null,
      });
    }
  }

  const pkgByProject = new Map<string, string>();
  for (const j of pkgJobs ?? []) {
    const pid = j.project_id as string;
    if (!pkgByProject.has(pid) && j.completed_at) {
      pkgByProject.set(pid, j.completed_at as string);
    }
  }

  // 4. Flatten
  return projects.map((p) => {
    const company   = Array.isArray(p.companies)          ? p.companies[0]          : p.companies;
    const authority = Array.isArray(p.authority_profiles) ? p.authority_profiles[0] : p.authority_profiles;
    const jur       = Array.isArray(p.jurisdictions)       ? p.jurisdictions[0]       : p.jurisdictions;
    return {
      id: p.id as string,
      job_number: (p.job_number as string) ?? "",
      job_name: (p.job_name as string) ?? "",
      billing_status: p.billing_status as BillingStatus,
      estimated_price: p.estimated_price != null ? Number(p.estimated_price) : null,
      base_price: p.base_price != null ? Number(p.base_price) : null,
      discount_amount: Number(p.discount_amount ?? 0),
      updated_at: p.updated_at as string,
      created_at: p.created_at as string,
      company_name: (company?.name as string | undefined) ?? null,
      authority_name: (authority?.name as string | undefined) ?? null,
      jurisdiction_name: (jur?.authority_name as string | undefined) ?? null,
      package_generated_at: pkgByProject.get(p.id as string) ?? null,
      latest_invoice: invoiceByProject.get(p.id as string) ?? null,
    };
  });
}

// ── Invoice list with flat project/company joins ─────────────────────────────
//
// Returns the most recent N invoices for the operational list. The UI does
// in-memory filtering on the returned slice — typical operational batches
// fit easily in 200 rows. Voided invoices ARE included so admin can search
// historical records; the UI filters can hide them by default if needed.

export type InvoiceListRow = {
  id: string;
  invoice_number: string;
  status: InvoiceStatus;
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  total_amount: number;
  discount_amount: number;
  recipient_email: string | null;
  recipient_name: string | null;
  send_notes: string | null;
  invoice_notes: string | null;
  sent_at: string | null;
  sent_by: string | null;
  paid_at: string | null;
  paid_amount: number | null;
  voided_at: string | null;
  voided_reason: string | null;
  pdf_storage_path: string | null;
  created_at: string;
  created_by: string;
  parent_invoice_id: string | null;
  // joined
  project_id: string;
  project_job_number: string;
  project_job_name: string;
  company_name: string | null;
  // Phase E2: line items for inline editing / read-only frozen display.
  line_items: InvoiceLineItem[];
  // Phase E3: snapshot for the human-readable summary + audit block.
  pricing_snapshot: PricingSnapshotV1 | Record<string, never>;
};

export async function searchInvoices(
  supabase: SupabaseClient,
  opts?: { limit?: number }
): Promise<InvoiceListRow[]> {
  const limit = opts?.limit ?? 200;
  const { data, error } = await supabase
    .from("invoices")
    .select(
      `
        id, invoice_number, status,
        invoice_date, due_date,
        subtotal, total_amount, discount_amount,
        recipient_email, recipient_name, send_notes, invoice_notes,
        sent_at, sent_by, paid_at, paid_amount,
        voided_at, voided_reason,
        pdf_storage_path, created_at, created_by, parent_invoice_id,
        pricing_snapshot,
        projects!inner (
          id, job_number, job_name,
          companies ( name )
        )
      `
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("searchInvoices error:", error);
    return [];
  }
  if (!data) return [];

  // Bucket line items for the loaded slice in one round trip.
  const ids = data.map((r) => r.id as string);
  const itemsByInvoice = new Map<string, InvoiceLineItem[]>();
  if (ids.length > 0) {
    const { data: items, error: itemsError } = await supabase
      .from("invoice_line_items")
      .select(LINE_ITEM_COLUMNS)
      .in("invoice_id", ids)
      .order("sort_order", { ascending: true });
    if (itemsError) {
      console.error("searchInvoices line items error:", itemsError);
    } else {
      for (const it of (items ?? []) as unknown as InvoiceLineItem[]) {
        const list = itemsByInvoice.get(it.invoice_id) ?? [];
        list.push(it);
        itemsByInvoice.set(it.invoice_id, list);
      }
    }
  }

  return data.map((row) => {
    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    const company = project
      ? (Array.isArray(project.companies) ? project.companies[0] : project.companies)
      : null;
    return {
      id: row.id as string,
      invoice_number: row.invoice_number as string,
      status: row.status as InvoiceStatus,
      invoice_date: row.invoice_date as string,
      due_date: (row.due_date as string | null) ?? null,
      subtotal: Number(row.subtotal ?? 0),
      total_amount: Number(row.total_amount ?? 0),
      discount_amount: Number(row.discount_amount ?? 0),
      recipient_email: (row.recipient_email as string | null) ?? null,
      recipient_name: (row.recipient_name as string | null) ?? null,
      send_notes: (row.send_notes as string | null) ?? null,
      invoice_notes: (row.invoice_notes as string | null) ?? null,
      sent_at: (row.sent_at as string | null) ?? null,
      sent_by: (row.sent_by as string | null) ?? null,
      paid_at: (row.paid_at as string | null) ?? null,
      paid_amount: row.paid_amount != null ? Number(row.paid_amount) : null,
      voided_at: (row.voided_at as string | null) ?? null,
      voided_reason: (row.voided_reason as string | null) ?? null,
      pdf_storage_path: (row.pdf_storage_path as string | null) ?? null,
      created_at: row.created_at as string,
      created_by: (row.created_by as string) ?? "",
      parent_invoice_id: (row.parent_invoice_id as string | null) ?? null,
      project_id: (project?.id as string) ?? "",
      project_job_number: (project?.job_number as string) ?? "",
      project_job_name: (project?.job_name as string) ?? "",
      company_name: (company?.name as string | undefined) ?? null,
      line_items: itemsByInvoice.get(row.id as string) ?? [],
      pricing_snapshot:
        (row.pricing_snapshot as PricingSnapshotV1 | Record<string, never> | null | undefined) ??
        ({} as Record<string, never>),
    };
  });
}

// ── Bulk-download lookup ─────────────────────────────────────────────────────
//
// Resolves a set of invoice IDs to the rows needed by the bulk-download route.
// Filters out drafts and rows without a persisted PDF up front so the route
// doesn't have to repeat that logic. Includes `void` because the spec lets
// admins re-download historical voided invoices for audit.

export type BulkDownloadInvoice = {
  id: string;
  invoice_number: string;
  status: InvoiceStatus;
  pdf_storage_path: string;
};

export async function getBulkDownloadInvoices(
  supabase: SupabaseClient,
  invoiceIds: string[]
): Promise<BulkDownloadInvoice[]> {
  if (invoiceIds.length === 0) return [];

  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, status, pdf_storage_path")
    .in("id", invoiceIds)
    .in("status", ["sent", "partially_paid", "paid", "void"])
    .not("pdf_storage_path", "is", null);

  if (error) {
    console.error("getBulkDownloadInvoices error:", error);
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    invoice_number: r.invoice_number as string,
    status: r.status as InvoiceStatus,
    pdf_storage_path: r.pdf_storage_path as string,
  }));
}

// ─── Company-facing invoice list ─────────────────────────────────────────────
//
// Selects only the InvoicePublic column set so admin-only fields
// (invoice_notes, pricing_snapshot, send_notes, sent_by, created_by) never
// reach the company UI even though RLS would otherwise allow them to be read.
//
// Project scoping rules mirror getCompanyProjectListForUser:
//   * company_admin / project_manager → all projects under the company
//
// Status filter (`status IN ('sent','partially_paid','paid','void')`) mirrors
// the `invoices: company member read` RLS policy — drafts and holds aren't
// surfaced to company users from this helper.

export type CompanyInvoiceRow = InvoicePublic & {
  project_job_name: string;
  project_job_number: string;
};

const COMPANY_INVOICE_COLUMNS = `
  id, project_id,
  invoice_number, status,
  invoice_date, due_date,
  subtotal, discount_amount, total_amount,
  recipient_name, recipient_email,
  sent_at, paid_at, paid_amount,
  voided_at, voided_reason,
  parent_invoice_id, pdf_storage_path,
  created_at, updated_at
` as const;

export async function getCompanyInvoices(
  supabase: SupabaseClient,
  companyId: string,
  _userId: string,   // kept for caller signature stability; PMs now see all company projects
  _role: string,
): Promise<CompanyInvoiceRow[]> {
  // Both company_admin and project_manager see all projects in the company.
  const projectQuery = supabase
    .from("projects")
    .select("id, job_name, job_number")
    .eq("company_id", companyId);

  const { data: projectRows, error: projError } = await projectQuery;
  if (projError) {
    console.error("getCompanyInvoices: project fetch error", projError);
    return [];
  }
  if (!projectRows || projectRows.length === 0) return [];

  const projects = projectRows as Array<{
    id: string;
    job_name: string | null;
    job_number: string | null;
  }>;
  const projectIds = projects.map((p) => p.id);
  const projectMap = new Map<string, { job_name: string; job_number: string }>(
    projects.map((p) => [
      p.id,
      { job_name: p.job_name ?? "—", job_number: p.job_number ?? "—" },
    ])
  );

  const { data: invoices, error } = await supabase
    .from("invoices")
    .select(COMPANY_INVOICE_COLUMNS)
    .in("project_id", projectIds)
    .in("status", ["sent", "partially_paid", "paid", "void"])
    .order("invoice_date", { ascending: false });

  if (error) {
    console.error("getCompanyInvoices error:", error);
    return [];
  }

  return ((invoices ?? []) as unknown as Array<InvoicePublic & { project_id: string }>).map(
    (inv) => {
      const lookup = projectMap.get(inv.project_id);
      return {
        ...inv,
        project_job_name: lookup?.job_name ?? "—",
        project_job_number: lookup?.job_number ?? "—",
      };
    }
  );
}
