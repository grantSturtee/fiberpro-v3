/**
 * GET /api/invoices/[invoiceId]/pdf
 *
 * Canonical invoice PDF download. Serves the byte-frozen artifact written at
 * send time. NEVER regenerates a sent invoice — that guarantee is the whole
 * point of the persisted-PDF workflow.
 *
 * Access model:
 *   * Admin: any invoice in any status. If the invoice is still draft, the
 *     admin gets a live-generated preview as a fallback (filename will say
 *     "preview") so they can review before sending without going through the
 *     dedicated preview route.
 *   * Company user: only invoices for projects under their company membership,
 *     and only when invoice.status ∈ (sent, partially_paid, paid, void). RLS
 *     on the invoices table enforces this — if the SELECT returns no row, we
 *     return 404 to avoid enumeration of internal invoice IDs.
 *   * Designer: 403.
 *
 * For sent invoices with a missing pdf_storage_path (operational anomaly —
 * e.g. an upload that succeeded server-side but the row update raced), we
 * return an error rather than silently regenerating. Silent regeneration
 * could produce a different byte stream than what the client already has.
 *
 * The storage bucket path is never returned to the caller — bytes are read
 * server-side via the service client and streamed inline.
 *
 * No project_activity logging on download — too noisy.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { generateInvoiceFromLineItems } from "@/lib/pdf/invoice";

function sanitizeForFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9_\-]/g, "-");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  const { invoiceId } = await params;

  // ── Auth ────────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const role    = (user.app_metadata as { role?: string })?.role;
  const isAdmin = role === "admin";

  // Designers do not get invoice access. Company users are identified
  // implicitly by RLS — if the invoice SELECT returns null, they're either
  // not a company member or the invoice isn't in a company-visible status.
  if (!isAdmin && role === "designer") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // ── Fetch invoice via session client (RLS gates company-user access) ────────
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select(
      `
        id, project_id, status, invoice_number,
        invoice_date, due_date,
        subtotal, discount_amount, total_amount,
        pdf_storage_path
      `
    )
    .eq("id", invoiceId)
    .single();
  if (invErr || !invoice) {
    // 404 (not 403) to avoid enumeration of company/admin invoices.
    return new NextResponse("Invoice not found", { status: 404 });
  }

  const invoiceNumber = (invoice.invoice_number as string) ?? "invoice";
  const slug          = sanitizeForFilename(invoiceNumber);

  // ── Persisted PDF: stream it ────────────────────────────────────────────────
  if (invoice.pdf_storage_path) {
    const service = createServiceClient();
    const { data: blob, error: dlErr } = await service.storage
      .from("invoices")
      .download(invoice.pdf_storage_path as string);
    if (dlErr || !blob) {
      console.error(
        "invoice download: storage missing for",
        invoiceId,
        "path=",
        invoice.pdf_storage_path,
        "err=",
        dlErr
      );
      return new NextResponse(
        "Invoice PDF could not be read from storage.",
        { status: 500 }
      );
    }
    const bytes = Buffer.from(await blob.arrayBuffer());
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `inline; filename="invoice-${slug}.pdf"`,
        "Cache-Control":       "private, no-store",
      },
    });
  }

  // ── No persisted PDF ────────────────────────────────────────────────────────
  // For a sent/partially_paid/paid/void invoice this is an operational
  // anomaly — refuse rather than silently regenerating, which could produce
  // a different PDF than the byte-frozen artifact the client already has.
  if (invoice.status !== "draft") {
    return new NextResponse(
      "This sent invoice is missing its persisted PDF in storage. " +
      "Open the project, expand Snapshot & audit, and check the PDF status. " +
      "If the storage path is set but the file is gone, contact admin support; " +
      "do NOT void the invoice — your record of the invoice is still intact in the database.",
      { status: 500 }
    );
  }

  // Draft + admin → live regenerate as a preview fallback. Company users
  // cannot reach this branch because RLS filters out draft rows for them.
  if (!isAdmin) {
    return new NextResponse("Invoice not found", { status: 404 });
  }

  const { data: items, error: itemsErr } = await supabase
    .from("invoice_line_items")
    .select("description, quantity, unit_price, line_total")
    .eq("invoice_id", invoiceId)
    .order("sort_order", { ascending: true });
  if (itemsErr) {
    return new NextResponse("Failed to read line items", { status: 500 });
  }

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("job_number, job_name, submission_date, company_id, authority_id")
    .eq("id", invoice.project_id)
    .single();
  if (projErr || !project) {
    return new NextResponse("Project not found", { status: 404 });
  }

  let companyName = "—";
  if (project.company_id) {
    const { data: companyRow } = await supabase
      .from("companies")
      .select("name")
      .eq("id", project.company_id)
      .single();
    if (companyRow?.name) companyName = companyRow.name as string;
  }

  let authorityName: string | null = null;
  if (project.authority_id) {
    const { data: authRow } = await supabase
      .from("authority_profiles")
      .select("name")
      .eq("id", project.authority_id)
      .single();
    authorityName = (authRow?.name as string | null) ?? null;
  }

  const pdfBytes = await generateInvoiceFromLineItems({
    invoiceNumber,
    invoiceDate:    invoice.invoice_date as string,
    dueDate:        (invoice.due_date as string | null) ?? null,
    jobNumber:      (project.job_number as string) ?? "",
    jobName:        (project.job_name as string) ?? "",
    companyName,
    authorityName,
    submittedAt:    (project.submission_date as string | null) ?? null,
    lineItems: (items ?? []).map((it) => ({
      description: (it.description as string) ?? "",
      quantity:    Number(it.quantity ?? 0),
      unit_price:  Number(it.unit_price ?? 0),
      line_total:  Number(it.line_total ?? 0),
    })),
    subtotal:       Number(invoice.subtotal ?? 0),
    discountAmount: Number(invoice.discount_amount ?? 0),
    total:          Number(invoice.total_amount ?? 0),
    invoiceNotes:   null,                  // admin-fallback rendering — keep parity with persisted PDF (no notes)
    billingStatus:  "draft",
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${slug}-preview.pdf"`,
      "Cache-Control":       "private, no-store",
    },
  });
}
