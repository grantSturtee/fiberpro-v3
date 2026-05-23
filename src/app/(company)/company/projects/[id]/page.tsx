import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProjectStatusBadge } from "@/components/ui/StatusBadge";
import { SectionCard } from "@/components/ui/SectionCard";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  getCompanyMembership,
  getProjectDetail,
} from "@/lib/queries/projects";
import { formatDate, formatDateTime, humanize } from "@/lib/utils/format";
import { CLIENT_FILE_CATEGORIES, isBrowserViewable } from "@/lib/constants/files";
import { UploadIntakeFileForm } from "@/components/company/UploadIntakeFileForm";
import { ProjectMessagesThread, type ProjectMessage } from "@/components/shared/ProjectMessagesThread";
import { DeleteIntakeFileButton } from "@/components/company/DeleteIntakeFileButton";
import { FileDownloadLink } from "@/components/ui/FileDownloadLink";
import { FileTypeBadge } from "@/components/ui/FileTypeBadge";

export const metadata: Metadata = { title: "Project" };

// Company-facing project detail: simplified read-only view.
// Shows project info, available documents, billing (when relevant), and messages.
// Internal workflow fields are not exposed.
// Access is scoped to the company member's company — enforced by RLS + query check.

export default async function CompanyProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/sign-in");

  // Verify the user's company membership before fetching the project
  const membership = await getCompanyMembership(supabase, userData.user.id);
  if (!membership) redirect("/sign-in");

  const { company_id: companyId, role: memberRole } = membership;

  const project = await getProjectDetail(supabase, id);

  // 404 if not found or not accessible (project belongs to a different company)
  if (!project || project.company_id !== companyId) {
    notFound();
  }

  // client_admin: sees all company projects — no extra check needed.
  // project_manager: must have submitted the project OR have an explicit assignment.
  if (memberRole === "project_manager") {
    const { data: projectMeta } = await supabase
      .from("projects")
      .select("submitted_by")
      .eq("id", id)
      .maybeSingle();

    const isSubmitter = projectMeta?.submitted_by === userData.user.id;
    if (!isSubmitter) {
      const { data: assignment } = await supabase
        .from("project_manager_assignments")
        .select("id")
        .eq("project_id", id)
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (!assignment) notFound();
    }
  }

  const showBilling =
    project.billing_status !== null &&
    ["invoiced", "partially_paid", "paid"].includes(project.billing_status);

  let projectInvoice: {
    id: string;
    invoice_number: string;
    status: string;
    total_amount: number;
    discount_amount: number;
    invoice_date: string | null;
    pdf_storage_path: string | null;
  } | null = null;

  if (showBilling) {
    const { data: invoiceData } = await supabase
      .from("invoices")
      .select("id, invoice_number, status, total_amount, discount_amount, invoice_date, pdf_storage_path")
      .eq("project_id", project.id)
      .in("status", ["sent", "partially_paid", "paid"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    projectInvoice = invoiceData ?? null;
  }

  // Fetch company-visible messages
  const { data: messagesData } = await supabase
    .from("project_messages")
    .select("id, sender_label, sender_role, body, created_at")
    .eq("project_id", id)
    .eq("visible_to_company", true)
    .order("created_at", { ascending: true });

  const messages = (messagesData ?? []) as ProjectMessage[];

  const serviceClient = createServiceClient();

  // Fetch permit package + received permit document files (visible to company)
  const { data: packageFilesData } = await serviceClient
    .from("project_files")
    .select("id, file_name, storage_path, file_category, created_at")
    .eq("project_id", id)
    .in("file_category", ["permit_package", "permit_document"])
    .order("created_at", { ascending: false });

  const allDocFiles = packageFilesData ?? [];

  // Generate signed download URLs (60-minute expiry) for each file
  const allDocFilesWithUrls = await Promise.all(
    allDocFiles.map(async (f) => {
      const { data: signed } = await serviceClient.storage
        .from("project-files")
        .createSignedUrl(f.storage_path, 3600);
      return { ...f, downloadUrl: signed?.signedUrl ?? null };
    })
  );

  // Fetch intake files the company has uploaded
  const { data: intakeFilesData } = await serviceClient
    .from("project_files")
    .select("id, file_name, file_category, file_size_bytes, storage_path, created_at, mime_type")
    .eq("project_id", id)
    .in("file_category", CLIENT_FILE_CATEGORIES)
    .order("created_at", { ascending: false });

  const intakeFiles = intakeFilesData ?? [];

  // Generate signed URLs for each file — view URL (plain) + download URL (forced attachment).
  const intakeFilesWithUrls = await Promise.all(
    intakeFiles.map(async (f) => {
      const [{ data: viewSigned }, { data: dlSigned }] = await Promise.all([
        serviceClient.storage.from("project-files").createSignedUrl(f.storage_path, 3600),
        serviceClient.storage.from("project-files").createSignedUrl(f.storage_path, 3600, { download: true }),
      ]);
      return {
        ...f,
        viewUrl: viewSigned?.signedUrl ?? null,
        downloadUrl: dlSigned?.signedUrl ?? null,
      };
    })
  );

  // Authority display
  const authorityDisplay = (() => {
    if (project.county) return `${project.county} County`;
    if (project.authority_type === "njdot") return "NJDOT";
    if (project.city) return project.city;
    return humanize(project.authority_type);
  })();

  const SUBMISSION_METHOD_LABELS: Record<string, string> = {
    email:     "Email",
    portal:    "Online Portal",
    mail:      "Mail",
    courier:   "Courier",
    in_person: "In Person",
  };

  // The project is in the submission workflow if status is one of these
  const inSubmissionFlow = [
    "ready_for_submission",
    "submitted",
    "waiting_on_authority",
    "authority_action_needed",
    "permit_received",
    "closed",
  ].includes(project.status);

  return (
    <div className="p-8 space-y-6 max-w-3xl mx-auto bg-white min-h-full">

      {/* Breadcrumb + title */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Link href="/company/projects" className="text-xs text-muted hover:text-dim transition-colors">
            Projects
          </Link>
          <span className="text-xs text-faint">/</span>
          <span className="text-xs text-muted font-mono">{project.job_number}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <h1 className="text-xl font-semibold text-ink">{project.job_name}</h1>
          <ProjectStatusBadge status={project.unified_status} />
        </div>
        <p className="text-sm text-muted">
          {authorityDisplay} · {humanize(project.type_of_plan)} · Submitted {formatDate(project.created_at)}
        </p>
      </div>

      {/* Project information.
          Phase A — when a structured street_address has been entered, show
          it on its own line with "City, ST ZIP" beneath. For projects that
          predate Phase A (no street_address) we fall back to the legacy
          job_address field so existing records stay readable. */}
      <SectionCard flat title="Project Information">
        {(() => {
          const cityStateZip = (() => {
            const left  = project.city?.trim() || null;
            const right = [project.state?.trim(), project.zip_code?.trim()].filter(Boolean).join(" ") || null;
            if (left && right) return `${left}, ${right}`;
            return left || right;
          })();
          const addressBlock = project.street_address ? (
            <>
              <p className="text-sm text-ink">{project.street_address}</p>
              {cityStateZip && <p className="text-sm text-ink">{cityStateZip}</p>}
            </>
          ) : (
            <p className="text-sm text-ink">{project.job_address || <span className="text-faint">—</span>}</p>
          );
          return (
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              <div className="col-span-2">
                <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">Address</p>
                {addressBlock}
              </div>
              {[
                { label: "Client Job #",        value: project.job_number_client },
                { label: "GRANTED Job #",      value: project.job_number },
                { label: "Authority",           value: authorityDisplay },
                { label: "Job Type",            value: humanize(project.type_of_plan) },
                { label: "Requested Approval",  value: formatDate(project.requested_approval_date) },
                { label: "Milepost Start",      value: project.milepost_start },
                { label: "Milepost End",        value: project.milepost_end },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">
                    {label}
                  </p>
                  <p className="text-sm text-ink">{value || <span className="text-faint">—</span>}</p>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Permit received highlight */}
        {project.permit_received_date && (
          <div className="mt-4 pt-4 flex items-center gap-2" style={{ borderTop: "1px solid #e3e9ec" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="8" cy="8" r="7" fill="#dcfce7" />
              <path d="M5 8l2 2 4-4" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-sm text-emerald-700 font-medium">
              Permit received {formatDate(project.permit_received_date)}
            </p>
          </div>
        )}
      </SectionCard>

      {/* Permit Status — shown once the project enters the submission workflow */}
      {inSubmissionFlow && (
        <SectionCard flat title="Permit Status">
          <div className="space-y-4">

            {/* Status row */}
            <div className="flex items-center gap-3 flex-wrap">
              <ProjectStatusBadge status={project.unified_status} />
              {project.status === "authority_action_needed" && (
                <p className="text-sm text-muted">
                  The authority has a question or request. Our team is working on a response.
                </p>
              )}
            </div>

            {/* Submission details — shown once actually submitted */}
            {["submitted", "waiting_on_authority", "authority_action_needed",
              "permit_received", "closed"].includes(project.status) && (
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                {project.submission_date && (
                  <div>
                    <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">
                      Date Submitted
                    </p>
                    <p className="text-sm text-ink">{formatDate(project.submission_date)}</p>
                  </div>
                )}
                {project.submission_method && (
                  <div>
                    <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">
                      Submission Method
                    </p>
                    <p className="text-sm text-ink">
                      {SUBMISSION_METHOD_LABELS[project.submission_method] ?? project.submission_method}
                    </p>
                  </div>
                )}
                {project.authority_tracking_number && (
                  <div>
                    <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">
                      Authority Reference #
                    </p>
                    <p className="text-sm text-ink font-mono">{project.authority_tracking_number}</p>
                  </div>
                )}
                {project.permit_received_date && (
                  <div>
                    <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">
                      Permit Received
                    </p>
                    <p className="text-sm text-ink">{formatDate(project.permit_received_date)}</p>
                  </div>
                )}
              </div>
            )}

          </div>
        </SectionCard>
      )}

      {/* Attachments — files uploaded by the company */}
      <SectionCard flat
        title="Attachments"
        description="Reference files you have submitted for this project."
      >
        <div className="space-y-4">
          {intakeFilesWithUrls.length > 0 && (
            <div className="divide-y divide-surface">
              {intakeFilesWithUrls.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileTypeBadge fileName={f.file_name} />
                    <div className="min-w-0">
                      <p className="text-sm text-ink truncate">{f.file_name}</p>
                      <p className="text-[11px] text-muted mt-0.5">
                        {f.file_size_bytes
                          ? `${(f.file_size_bytes / 1048576).toFixed(1)} MB · `
                          : ""}
                        {formatDate(f.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    {isBrowserViewable(f.mime_type) && f.viewUrl ? (
                      <a
                        href={f.viewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View file"
                        className="text-muted hover:text-primary transition-colors"
                      >
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                          <ellipse cx="8" cy="8" rx="7" ry="5" stroke="currentColor" strokeWidth="1.4"/>
                          <circle cx="8" cy="8" r="2" fill="currentColor"/>
                        </svg>
                      </a>
                    ) : (
                      <span
                        title="This file type cannot be previewed in the browser"
                        className="text-faint cursor-default"
                      >
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                          <ellipse cx="8" cy="8" rx="7" ry="5" stroke="currentColor" strokeWidth="1.4"/>
                          <circle cx="8" cy="8" r="2" fill="currentColor"/>
                        </svg>
                      </span>
                    )}
                    {f.downloadUrl && <FileDownloadLink href={f.downloadUrl} />}
                    <DeleteIntakeFileButton
                      fileId={f.id}
                      projectId={project.id}
                      fileName={f.file_name}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="pt-1">
            <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-2">
              Upload a file (PDF, PNG, JPEG, WebP, GIF, ZIP, DWG, DXF · max 50 MB)
            </p>
            <UploadIntakeFileForm projectId={project.id} />
          </div>
        </div>
      </SectionCard>

      {/* Documents — permit packages and received permits made available by GRANTED */}
      <SectionCard flat
        title="Documents"
        description="Files made available by GRANTED for download."
      >
        {allDocFilesWithUrls.length === 0 ? (
          <p className="text-sm text-muted py-2">
            No documents yet. You will be notified when permit documents are ready.
          </p>
        ) : (
          <div className="divide-y divide-surface">
            {allDocFilesWithUrls.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileTypeBadge fileName={f.file_name} />
                  <div className="min-w-0">
                    <p className="text-sm text-ink truncate">{f.file_name}</p>
                    <p className="text-[11px] text-muted mt-0.5">
                      {f.file_category === "permit_document" ? "Received Permit · " : ""}
                      {formatDate(f.created_at)}
                    </p>
                  </div>
                </div>
                {f.downloadUrl && <FileDownloadLink href={f.downloadUrl} />}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Billing — shown once invoice has been sent */}
      {showBilling && (() => {
        const invoice = projectInvoice;
        const billingLabel =
          project.billing_status === "paid" ? "Paid in Full" :
          project.billing_status === "partially_paid" ? "Partially Paid" :
          "Invoice Ready";

        return (
          <SectionCard flat title="Billing">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{billingLabel}</span>
                {invoice && (
                  <a
                    href={`/api/invoices/${invoice.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                    View Invoice
                  </a>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <p className="text-dim text-xs uppercase tracking-wide mb-0.5">Invoice #</p>
                  <p className="font-medium text-ink">
                    {invoice?.invoice_number ?? project.invoice_number ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-dim text-xs uppercase tracking-wide mb-0.5">Amount</p>
                  <p className="font-medium text-ink">
                    ${(invoice?.total_amount ?? Math.max(0, (project.base_price ?? 0) - (project.discount_amount ?? 0))).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-dim text-xs uppercase tracking-wide mb-0.5">Invoice Date</p>
                  <p className="font-medium text-ink">
                    {invoice?.invoice_date
                      ? new Date(invoice.invoice_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : project.invoice_sent_at
                      ? new Date(project.invoice_sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-dim text-xs uppercase tracking-wide mb-0.5">Status</p>
                  <p className="font-medium text-ink capitalize">
                    {(invoice?.status ?? project.billing_status ?? "invoiced").replace(/_/g, " ")}
                  </p>
                </div>
              </div>

              {!invoice && (
                <p className="text-xs text-dim italic">Invoice details loading — contact us if this persists.</p>
              )}
            </div>
          </SectionCard>
        );
      })()}

      {/* Project Conversation — shared message thread visible to company and GRANTED team */}
      <SectionCard flat title="Project Conversation">
        <ProjectMessagesThread
          projectId={project.id}
          messages={messages}
          revalidatePath={`/company/projects/${project.id}`}
        />
      </SectionCard>
    </div>
  );
}
