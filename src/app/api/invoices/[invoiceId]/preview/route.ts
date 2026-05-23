/**
 * GET /api/invoices/[invoiceId]/preview
 *
 * Admin-only ephemeral invoice PDF preview.
 *
 * Behavior:
 *   * Auth: admin only. Designers / company users get 403.
 *   * For draft invoices: generates a fresh PDF from the current invoice row +
 *     invoice_line_items every request. Does NOT touch storage, does NOT set
 *     pdf_storage_path. invoice_notes (admin-only) ARE included so the admin
 *     can review them before sending.
 *   * For sent invoices with a persisted PDF: streams the persisted bytes.
 *     This is the SAFEST behavior — re-rendering a sent invoice live would
 *     produce a different PDF than the byte-frozen artifact that was sent to
 *     the client, defeating the whole "frozen at send time" guarantee.
 *   * For sent invoices missing pdf_storage_path: errors with 500.
 *   * Filename always includes "-preview" so the admin can tell at a glance
 *     that this URL is the preview surface, not the canonical download.
 *
 * No project_activity logging — previews would be too noisy.
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

  // ── Auth: admin only ────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const role = (user.app_metadata as { role?: string })?.role;
  if (role !== "admin") return new NextResponse("Forbidden", { status: 403 });

  // ── Fetch invoice ───────────────────────────────────────────────────────────
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select(
      `
        id, project_id, status, invoice_number,
        invoice_date, due_date,
        subtotal, discount_amount, total_amount,
        invoice_notes, pdf_storage_path
      `
    )
    .eq("id", invoiceId)
    .single();
  if (invErr || !invoice) {
    return new NextResponse("Invoice not found", { status: 404 });
  }

  const invoiceNumber = (invoice.invoice_number as string) ?? "invoice";
  const slug          = sanitizeForFilename(invoiceNumber);
  const previewName   = `invoice-${slug}-preview.pdf`;

  // ── Sent invoices with a persisted PDF → stream the canonical artifact ─────
  if (invoice.status !== "draft" && invoice.pdf_storage_path) {
    const service = createServiceClient();
    const { data: blob, error: dlErr } = await service.storage
      .from("invoices")
      .download(invoice.pdf_storage_path as string);

    if (dlErr || !blob) {
      console.error("preview: storage download error", dlErr);
      return new NextResponse(
        "Persisted invoice PDF could not be read from storage.",
        { status: 500 }
      );
    }

    const bytes = Buffer.from(await blob.arrayBuffer());
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `inline; filename="${previewName}"`,
        "Cache-Control":       "private, no-store",
      },
    });
  }

  // ── Sent invoice with no persisted PDF → error rather than fake-regenerate ─
  if (invoice.status !== "draft" && !invoice.pdf_storage_path) {
    return new NextResponse(
      "Persisted invoice PDF is missing for a sent invoice. Re-send not yet implemented.",
      { status: 500 }
    );
  }

  // ── Draft path: live PDF generation ─────────────────────────────────────────
  const { data: items, error: itemsErr } = await supabase
    .from("invoice_line_items")
    .select("description, quantity, unit_price, line_total")
    .eq("invoice_id", invoiceId)
    .order("sort_order", { ascending: true });
  if (itemsErr) {
    console.error("preview: read line items error", itemsErr);
    return new NextResponse("Failed to read line items", { status: 500 });
  }

  // Read project + company + authority for the PDF header block.
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select(
      `
        job_number, job_name, submission_date,
        company_id, authority_id
      `
    )
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
    invoiceNumber:  invoiceNumber,
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
    // Admin-only preview — include notes for admin review.
    invoiceNotes:   (invoice.invoice_notes as string | null) ?? null,
    billingStatus:  "draft",
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="${previewName}"`,
      "Cache-Control":       "private, no-store",
    },
  });
}
