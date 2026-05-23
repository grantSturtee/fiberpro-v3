import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateInvoice } from "@/lib/pdf/invoice";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const role    = (user.app_metadata as { role?: string })?.role;
  const isAdmin = role === "admin";

  // Non-admin roles other than company member are rejected immediately.
  // Company members are identified by having a company_memberships row —
  // we don't check a role flag; the RLS policy on projects enforces project
  // scoping, so a successful project fetch below implies company membership.
  if (!isAdmin && role === "designer") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // ── Authoritative invoice redirect (Phase D2) ────────────────────────────────
  //
  // If this project has any non-void invoice in the new system, the legacy
  // route MUST NOT regenerate a competing PDF from live project state. Redirect
  // to /api/invoices/{invoiceId}/pdf, which streams the byte-frozen artifact
  // (or, for drafts, returns an admin-only live preview that the new route
  // gates itself). RLS on the invoices SELECT below filters out drafts for
  // company users, so a company user redirected here for a draft is sent to
  // the legacy fallback path which already returns 400 for non-sent states.
  const { data: latestInvoice } = await supabase
    .from("invoices")
    .select("id")
    .eq("project_id", projectId)
    .neq("status", "void")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestInvoice) {
    return NextResponse.redirect(
      new URL(`/api/invoices/${latestInvoice.id}/pdf`, req.url),
      // 307 preserves the GET method; default for NextResponse.redirect is
      // 307 already but we make it explicit for documentation.
      { status: 307 }
    );
  }

  // ── Fetch project data ────────────────────────────────────────────────────────
  // Uses the session client: RLS restricts company users to their own company's
  // projects. If this query returns null for a non-admin, the user simply has
  // no access to this project — we return 404 (not 403) to avoid enumeration.
  const { data: project, error } = await supabase
    .from("projects")
    .select(`
      id,
      job_number,
      job_name,
      billing_status,
      base_price,
      estimated_price,
      discount_amount,
      invoice_number,
      invoice_notes,
      invoice_sent_at,
      submission_date,
      companies ( name ),
      authorities ( name )
    `)
    .eq("id", projectId)
    .single();

  if (error || !project) {
    return new NextResponse("Project not found", { status: 404 });
  }

  // ── State gate — differs by role ──────────────────────────────────────────────
  // Admins can download from draft_invoice onward (useful for pre-send review).
  // Company users can only download once the invoice has been formally sent.
  const billingStatus = project.billing_status as string;

  if (isAdmin) {
    const adminStates = ["draft_invoice", "invoiced", "partially_paid", "paid"];
    if (!adminStates.includes(billingStatus)) {
      return new NextResponse("Invoice not available for this billing status", { status: 400 });
    }
  } else {
    // Company user — invoice must be in a sent/settled state
    const companyStates = ["invoiced", "partially_paid", "paid"];
    if (!companyStates.includes(billingStatus)) {
      return new NextResponse("Invoice not available", { status: 400 });
    }
  }

  const basePrice = (project.base_price ?? project.estimated_price) as number | null;
  if (basePrice == null) {
    return new NextResponse("No price set for this project", { status: 400 });
  }

  const companies = project.companies as { name: string }[] | { name: string } | null;
  const companyName =
    Array.isArray(companies) ? (companies[0]?.name ?? "—") :
    companies ? (companies as { name: string }).name : "—";

  const authorities = project.authorities as { name: string }[] | { name: string } | null;
  const authorityName =
    Array.isArray(authorities) ? (authorities[0]?.name ?? null) :
    authorities ? (authorities as { name: string }).name : null;

  // ── Generate PDF ──────────────────────────────────────────────────────────────
  // invoice_notes is internal-only — suppress it for non-admin downloads.
  const invoiceNotes = isAdmin ? (project.invoice_notes as string | null) : null;

  const pdfBytes = await generateInvoice({
    invoiceNumber:  project.invoice_number as string | null,
    invoiceDate:    project.invoice_sent_at as string | null ?? new Date().toISOString(),
    jobNumber:      project.job_number as string,
    jobName:        project.job_name as string,
    companyName,
    authorityName,
    submittedAt:    project.submission_date as string | null ?? null,
    basePrice,
    discountAmount: (project.discount_amount as number) ?? 0,
    invoiceNotes,
    billingStatus,
  });

  // Sanitize invoice number for use in Content-Disposition filename.
  function sanitizeForFilename(s: string): string {
    return s.replace(/[^a-zA-Z0-9_\-]/g, "-");
  }

  const rawSlug  = project.invoice_number ?? project.job_number;
  const slug     = sanitizeForFilename(rawSlug as string);
  const fileName = `invoice-${slug}.pdf`;

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
}
