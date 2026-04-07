import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProjectStatusBadge } from "@/components/ui/StatusBadge";
import { SectionCard } from "@/components/ui/SectionCard";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  getCompanyIdForUser,
  getProjectDetail,
} from "@/lib/queries/projects";
import { formatDate, humanize } from "@/lib/utils/format";
import { FILE_CATEGORY_LABELS, CLIENT_FILE_CATEGORIES } from "@/lib/constants/files";
import { UploadIntakeFileForm } from "@/components/company/UploadIntakeFileForm";

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

  // Verify the user's company_id before fetching the project
  const companyId = await getCompanyIdForUser(supabase, userData.user.id);
  if (!companyId) redirect("/sign-in");

  const project = await getProjectDetail(supabase, id);

  // 404 if not found or not accessible (project belongs to a different company)
  if (!project || project.company_id !== companyId) {
    notFound();
  }

  const showBilling =
    project.billing_status !== null &&
    ["invoiced", "partially_paid", "paid"].includes(project.billing_status);

  // Fetch company-visible messages
  const { data: messagesData } = await supabase
    .from("project_messages")
    .select("id, sender_label, body, created_at")
    .eq("project_id", id)
    .eq("visible_to_company", true)
    .order("created_at", { ascending: true });

  const messages = messagesData ?? [];

  // Fetch intake files the company has uploaded
  const serviceClient = createServiceClient();
  const { data: intakeFilesData } = await serviceClient
    .from("project_files")
    .select("id, file_name, file_category, file_size_bytes, storage_path, created_at")
    .eq("project_id", id)
    .in("file_category", CLIENT_FILE_CATEGORIES)
    .order("created_at", { ascending: false });

  const intakeFiles = intakeFilesData ?? [];

  // Generate signed URLs for each file
  const intakeFilesWithUrls = await Promise.all(
    intakeFiles.map(async (f) => {
      const { data: signed } = await serviceClient.storage
        .from("project-files")
        .createSignedUrl(f.storage_path, 3600);
      return { ...f, signedUrl: signed?.signedUrl ?? null };
    })
  );

  // Authority display
  const authorityDisplay = (() => {
    if (project.county) return `${project.county} County`;
    if (project.authority_type === "njdot") return "NJDOT";
    if (project.city) return project.city;
    return humanize(project.authority_type);
  })();

  return (
    <div className="p-8 space-y-6 max-w-3xl mx-auto">

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
          <ProjectStatusBadge status={project.status} variant="external" />
        </div>
        <p className="text-sm text-muted">
          {authorityDisplay}
          {project.county ? ` · ${project.county} County` : ""}
          {" · Submitted "}
          {formatDate(project.created_at)}
        </p>
      </div>

      {/* Project information */}
      <SectionCard title="Project Information">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          {[
            { label: "Client Job #",        value: project.job_number_client },
            { label: "FiberPro Job #",      value: project.job_number },
            { label: "Job Address",         value: project.job_address },
            { label: "Authority",           value: authorityDisplay },
            { label: "Type of Plan",        value: humanize(project.type_of_plan) },
            { label: "Job Type",            value: humanize(project.job_type) },
            { label: "Requested Approval",  value: formatDate(project.requested_approval_date) },
            ...(project.permit_received_date
              ? [{ label: "Permit Received", value: formatDate(project.permit_received_date) }]
              : []),
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">
                {label}
              </p>
              <p className="text-sm text-ink">{value || <span className="text-faint">—</span>}</p>
            </div>
          ))}
        </div>

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

      {/* Attachments — files uploaded by the company */}
      <SectionCard
        title="Attachments"
        description="Reference files you have submitted for this project."
      >
        <div className="space-y-4">
          {intakeFilesWithUrls.length > 0 && (
            <div className="divide-y divide-surface">
              {intakeFilesWithUrls.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm text-ink truncate">{f.file_name}</p>
                    <p className="text-[11px] text-muted mt-0.5">
                      {FILE_CATEGORY_LABELS[f.file_category as keyof typeof FILE_CATEGORY_LABELS] ?? f.file_category}
                      {f.file_size_bytes
                        ? ` · ${(f.file_size_bytes / 1048576).toFixed(1)} MB`
                        : ""}
                      {" · "}
                      {formatDate(f.created_at)}
                    </p>
                  </div>
                  {f.signedUrl && (
                    <a
                      href={f.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex-shrink-0"
                    >
                      View
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="pt-1">
            <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-2">
              Upload a file (PDF, max 50 MB)
            </p>
            <UploadIntakeFileForm projectId={project.id} />
          </div>
        </div>
      </SectionCard>

      {/* Documents — TODO: real files from project_files table in a later phase */}
      <SectionCard
        title="Documents"
        description="Files made available by FiberPro for download."
      >
        <p className="text-sm text-muted py-2">
          No documents are available for download yet. You will be notified when permit documents are ready.
        </p>
        {/* TODO: query project_files WHERE file_category IN ('permit_package','permit_document') */}
      </SectionCard>

      {/* Billing visibility — shown only once an invoice exists */}
      {showBilling && (
        <SectionCard title="Billing">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1">
                Invoice Status
              </p>
              <p className="text-sm text-ink font-medium">
                {project.billing_status === "paid"
                  ? "Paid in full"
                  : project.billing_status === "partially_paid"
                  ? "Partially paid"
                  : "Invoice sent"}
              </p>
            </div>
          </div>
          {/* TODO: invoice amount and download link — future billing phase */}
        </SectionCard>
      )}

      {/* Messages / updates from FiberPro */}
      <SectionCard title="Updates">
        <div className="space-y-4">
          {messages.length === 0 && (
            <p className="text-sm text-muted py-2">No updates from FiberPro yet.</p>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-primary-soft flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[10px] font-semibold text-primary">FP</span>
              </div>
              <div className="bg-surface rounded-xl px-4 py-3 flex-1">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs font-semibold text-ink">{msg.sender_label || "FiberPro"}</p>
                  <p className="text-[10px] text-muted">{formatDate(msg.created_at)}</p>
                </div>
                <p className="text-sm text-dim">{msg.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Reply area — TODO: wire to project_messages insert (company message → FiberPro) */}
        <div className="mt-5 pt-4" style={{ borderTop: "1px solid #e3e9ec" }}>
          <p className="text-xs text-muted mb-2">Send a message to FiberPro</p>
          <textarea
            rows={3}
            className="w-full text-sm text-ink bg-surface rounded-xl px-4 py-3 resize-none outline-none"
            style={{ border: "1px solid #d4dde4" }}
            placeholder="Questions, clarifications, or updates about this project…"
          />
          {/* TODO: wire send button to server action in next phase */}
          <button
            className="mt-2 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors"
            style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
          >
            Send Message
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
