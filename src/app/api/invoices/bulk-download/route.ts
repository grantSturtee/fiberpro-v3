/**
 * POST /api/invoices/bulk-download
 *
 * Admin-only. Builds a ZIP archive of persisted invoice PDFs and streams it
 * back as a single download.
 *
 * Input (FormData):
 *   invoice_ids[]   one entry per invoice ID to include
 *
 * Output:
 *   application/zip with one PDF per included invoice:
 *     granted-invoices-YYYY-MM-DD.zip
 *       INV-2026-0042.pdf
 *       INV-2026-0042-S1.pdf
 *       …
 *
 * Rules:
 *   * Drafts are silently dropped (they have no persisted PDF).
 *   * Invoices in status sent / partially_paid / paid / void are included.
 *   * Missing storage objects are skipped and logged; if every requested
 *     invoice is missing, the route returns 400 with a clear message.
 *   * No PDF regeneration. The ZIP only contains byte-frozen artifacts.
 *
 * Uses the JSZip library (added in Phase E1) with default compression. PDFs
 * are already internally compressed so compression here is largely a no-op
 * by design, but JSZip handles that gracefully.
 */

import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getBulkDownloadInvoices } from "@/lib/queries/invoices";

function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sanitizeForFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9_\-]/g, "-");
}

export async function POST(req: NextRequest) {
  // ── Auth: admin only ────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const role = (user.app_metadata as { role?: string })?.role;
  if (role !== "admin") return new NextResponse("Forbidden", { status: 403 });

  // ── Parse input ─────────────────────────────────────────────────────────────
  let invoiceIds: string[] = [];
  try {
    const formData = await req.formData();
    invoiceIds = formData
      .getAll("invoice_ids")
      .map((v) => String(v))
      .filter(Boolean);
  } catch (e) {
    console.error("bulk-download: form parse error", e);
    return new NextResponse("Invalid form data", { status: 400 });
  }

  if (invoiceIds.length === 0) {
    return new NextResponse("No invoice IDs supplied", { status: 400 });
  }
  if (invoiceIds.length > 200) {
    // Soft cap — prevents accidentally downloading thousands of files at once
    return new NextResponse("Too many invoices selected (max 200)", { status: 400 });
  }

  // ── Resolve invoices (drafts dropped here by status filter) ─────────────────
  const invoices = await getBulkDownloadInvoices(supabase, invoiceIds);
  if (invoices.length === 0) {
    return new NextResponse(
      "No downloadable invoices in your selection. Drafts and invoices without a persisted PDF are excluded — finalize and send the draft first, then retry.",
      { status: 400 }
    );
  }

  // ── Fetch each PDF via service client (bypasses bucket RLS) ─────────────────
  const service = createServiceClient();
  const zip = new JSZip();
  const skipped: Array<{ invoice_number: string; reason: string }> = [];
  let included = 0;

  for (const inv of invoices) {
    const { data: blob, error } = await service.storage
      .from("invoices")
      .download(inv.pdf_storage_path);

    if (error || !blob) {
      console.warn(
        `bulk-download: missing PDF for invoice ${inv.invoice_number} (${inv.id}) at ${inv.pdf_storage_path}`,
        error
      );
      skipped.push({
        invoice_number: inv.invoice_number,
        reason: "PDF missing from storage",
      });
      continue;
    }

    const bytes = await blob.arrayBuffer();
    const fileName = `${sanitizeForFilename(inv.invoice_number)}.pdf`;
    zip.file(fileName, bytes);
    included++;
  }

  if (included === 0) {
    return new NextResponse(
      `Could not read any invoice PDFs from storage (${skipped.length} skipped). The storage bucket may be unreachable or the files may have been deleted. Try again, and if it persists contact admin support.`,
      { status: 500 }
    );
  }

  // ── Generate ZIP and stream it ──────────────────────────────────────────────
  // ArrayBuffer output is the simplest BodyInit-compatible form on modern
  // TypeScript libs (Uint8Array generic args trip the BodyInit constraint in
  // recent typings).
  const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });
  const zipName   = `granted-invoices-${todayStamp()}.zip`;

  return new NextResponse(zipBuffer, {
    status: 200,
    headers: {
      "Content-Type":        "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
      "Cache-Control":       "private, no-store",
      // Surface skipped invoices so the UI can warn the admin if needed.
      "X-Invoices-Included": String(included),
      "X-Invoices-Skipped":  String(skipped.length),
    },
  });
}
