import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProjectStatusBadge, BillingStatusBadge } from "@/components/ui/StatusBadge";
import { SectionCard } from "@/components/ui/SectionCard";
import { UploadSLDForm } from "@/components/admin/UploadSLDForm";
import { AssignDesignerForm } from "@/components/admin/AssignDesignerForm";
import { ApproveDesignForm, RequestRevisionsForm } from "@/components/admin/WorkflowActionForms";
import { TcdLibraryModal, type TcdLibraryItem } from "@/components/admin/TcdLibraryModal";
import { RemoveTCDButton } from "@/components/admin/RemoveTCDButton";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getProjectDetail, getDesigners } from "@/lib/queries/projects";
import { getJurisdiction, type JurisdictionSummary } from "@/lib/queries/jurisdictions";
import { RecomputeProjectButton } from "@/components/admin/RecomputeProjectButton";
import { GeneratePackageButton } from "@/components/admin/GeneratePackageButton";
import { RailFileNav } from "@/components/admin/RailFileNav";
import { EditIntakeForm } from "@/components/admin/EditIntakeForm";
import { getLatestJob } from "@/lib/workflow/enqueue";
import { JOB_STATUS_LABEL, JOB_STATUS_COLOR, type WorkflowJobStatus } from "@/types/workflow";
import { formatDate, formatDateTime, humanize } from "@/lib/utils/format";
import { CLIENT_FILE_CATEGORIES, FILE_CATEGORIES, FILE_CATEGORY_LABELS, GENERATED_FILE_CATEGORIES } from "@/lib/constants/files";

export const metadata: Metadata = { title: "Project" };

const JOB_TYPE_LABELS_INLINE: Record<string, string> = {
  project_computed:          "Project Computed",
  generate_permit_package:   "Generate Package",
  generate_cover_sheet:      "Generate Cover Sheet",
  generate_application_form: "Generate Application",
  generate_tcp_package:      "Generate TCP Package",
  submit_permit:             "Submit Permit",
  generate_invoice:          "Generate Invoice",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldPair({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm text-ink">{value || <span className="text-faint">—</span>}</p>
    </div>
  );
}

function FileRow({
  file,
  downloadUrl,
}: {
  file: { id: string; file_name: string; created_at: string; uploader_label?: string | null };
  downloadUrl?: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded bg-red-50 flex items-center justify-center flex-shrink-0">
          <span className="text-[9px] font-bold text-red-600 tracking-tight">PDF</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm text-ink truncate">{file.file_name}</p>
          <p className="text-xs text-muted">
            {file.uploader_label ? `${file.uploader_label} · ` : ""}
            {formatDate(file.created_at)}
          </p>
        </div>
      </div>
      {downloadUrl ? (
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline flex-shrink-0"
        >
          Download
        </a>
      ) : (
        <span className="text-xs text-faint flex-shrink-0">—</span>
      )}
    </div>
  );
}

// ── Project Intelligence section ──────────────────────────────────────────────

const REQUIRED_DOC_FLAGS: { key: keyof JurisdictionSummary; label: string }[] = [
  { key: "requires_coi",                    label: "COI" },
  { key: "requires_pe_stamp",               label: "PE Stamp" },
  { key: "requires_traffic_control_plan",   label: "TCP" },
  { key: "requires_cover_sheet",            label: "Cover Sheet" },
  { key: "requires_application_form",       label: "Application Form" },
];

function ProjectIntelligenceSection({
  projectId,
  jurisdiction,
  estimatedPrice,
  isStale,
}: {
  projectId: string;
  jurisdiction: JurisdictionSummary | null;
  estimatedPrice: number | null;
  isStale: boolean;
}) {
  const requiredDocs = jurisdiction
    ? REQUIRED_DOC_FLAGS.filter((f) => jurisdiction[f.key] === true)
    : [];

  return (
    <SectionCard
      title="Project Intelligence"
      description="Auto-computed from jurisdiction rules and pricing engine. Recalculate after editing project scope."
    >
      <div className="space-y-5">

        {/* Jurisdiction */}
        <div>
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-3">Jurisdiction</p>
          {jurisdiction ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
                <div>
                  <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">Authority</p>
                  <p className="text-sm text-ink">{jurisdiction.authority_name}</p>
                </div>
                {jurisdiction.submission_method && (
                  <div>
                    <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">Submission</p>
                    <p className="text-sm text-ink">{humanize(jurisdiction.submission_method)}</p>
                  </div>
                )}
                {jurisdiction.avg_approval_days && (
                  <div>
                    <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">Avg. Approval</p>
                    <p className="text-sm text-ink">~{jurisdiction.avg_approval_days} days</p>
                  </div>
                )}
                {(jurisdiction.application_fee !== null || jurisdiction.jurisdiction_fee !== null) && (
                  <div>
                    <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">Fees</p>
                    <p className="text-sm text-ink">
                      {[
                        jurisdiction.application_fee !== null ? `App $${Number(jurisdiction.application_fee).toFixed(2)}` : null,
                        jurisdiction.jurisdiction_fee !== null ? `Jur $${Number(jurisdiction.jurisdiction_fee).toFixed(2)}` : null,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                )}
              </div>

              {requiredDocs.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1.5">Required Documents</p>
                  <div className="flex flex-wrap gap-1.5">
                    {requiredDocs.map((f) => (
                      <span
                        key={f.key}
                        className="text-[10px] font-medium bg-primary-soft text-primary rounded px-1.5 py-0.5"
                      >
                        {f.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted">
                  {[jurisdiction.township, jurisdiction.county ? `${jurisdiction.county} Co.` : null, jurisdiction.state]
                    .filter(Boolean).join(", ")}
                </p>
                <Link
                  href={`/admin/settings/jurisdictions/${jurisdiction.id}/edit`}
                  className="text-xs text-primary hover:underline"
                >
                  Edit →
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">No jurisdiction matched. Check state/county/city, then recalculate.</p>
          )}
        </div>

        {/* Estimated Price */}
        <div style={{ borderTop: "1px solid #e3e9ec" }} className="pt-5">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-3">Estimated Price</p>
          <p className="text-2xl font-semibold text-ink">
            {estimatedPrice !== null
              ? `$${Number(estimatedPrice).toFixed(2)}`
              : <span className="text-base font-normal text-muted">Not calculated</span>
            }
          </p>
          {estimatedPrice === null && (
            <p className="mt-1 text-xs text-muted">
              Requires a matching jurisdiction and pricing rule.{" "}
              <Link href="/admin/settings/pricing" className="text-primary hover:underline">
                Manage pricing rules →
              </Link>
            </p>
          )}
        </div>

        {/* Recalculate */}
        <div style={{ borderTop: "1px solid #e3e9ec" }} className="pt-4 space-y-3">
          {isStale && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden className="flex-shrink-0">
                <path d="M6.5 1.5L11.5 10.5H1.5L6.5 1.5Z" fill="#fef08a" stroke="#d97706" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M6.5 5.5v2.5" stroke="#d97706" strokeWidth="1.2" strokeLinecap="round" />
                <circle cx="6.5" cy="9.5" r=".6" fill="#d97706" />
              </svg>
              <p className="text-xs text-amber-700">Intake data changed — recalculate to refresh.</p>
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted">
              Jurisdiction match + price calculation + workflow log.
            </p>
            <RecomputeProjectButton projectId={projectId} highlighted={isStale} />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/sign-in");

  const [project, designers] = await Promise.all([
    getProjectDetail(supabase, id),
    getDesigners(supabase),
  ]);

  if (!project) notFound();

  const [jurisdiction, packageJob, latestCompletedPackageJobData, workflowJobsData, tcdLibraryData] = await Promise.all([
    project.jurisdiction_id ? getJurisdiction(supabase, project.jurisdiction_id) : null,
    getLatestJob(supabase, id, "generate_permit_package"),
    // Separate query for latest *completed* package job — used to drive View Package action.
    // packageJob above tracks the most recent job overall (may be queued/running/failed).
    supabase
      .from("workflow_jobs")
      .select("id, status, result, updated_at, created_at")
      .eq("project_id", id)
      .eq("job_type", "generate_permit_package")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("workflow_jobs")
      .select("id, job_type, status, error, created_at, updated_at, completed_at, result")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("tcd_library")
      .select("id, code, description, category, state")
      .eq("is_active", true)
      .or(project.state ? `state.is.null,state.eq.${project.state}` : "state.is.null")
      .order("code", { ascending: true }),
  ]);

  const latestCompletedPackageJob = latestCompletedPackageJobData.data ?? null;
  const workflowJobs = workflowJobsData.data ?? [];

  // Staleness: intake data was edited after the last project_computed job ran.
  // computeProject writes the workflow_jobs row AFTER updating the project row,
  // so project_computed.created_at is always slightly after the compute's
  // project.updated_at bump. A subsequent intake edit bumps updated_at again,
  // making it newer than the last compute job.
  const lastComputeJob = workflowJobs.find(
    (j) => (j.job_type as string) === "project_computed"
  );
  const isIntelligenceStale =
    !lastComputeJob ||
    new Date(project.updated_at) > new Date(lastComputeJob.created_at);
  const tcdLibrary: TcdLibraryItem[] = (tcdLibraryData.data ?? []).map((t: Record<string, unknown>) => ({
    id: t.id as string,
    code: t.code as string,
    description: t.description as string,
    category: t.category as string | null,
    state: t.state as string | null,
  }));

  // Fetch project files
  const { data: filesData } = await supabase
    .from("project_files")
    .select("id, file_name, file_category, created_at, uploaded_by, uploader_label, storage_path")
    .eq("project_id", id)
    .order("created_at", { ascending: true });

  const files = filesData ?? [];
  // Zone: CLIENT — intake-submitted files, read-only reference for admin
  const intakeFiles = files.filter((f) =>
    (CLIENT_FILE_CATEGORIES as readonly string[]).includes(f.file_category as string)
  );
  // Zone: ADMIN — SLD reference sheets uploaded by admin
  const sldFiles = files.filter((f) => f.file_category === FILE_CATEGORIES.SLD_SHEET);
  // Zone: DESIGNER — TCP sheets produced by the assigned designer
  const tcpFiles = files.filter((f) => f.file_category === FILE_CATEGORIES.TCP_PDF);
  // Zone: GENERATED — n8n-produced outputs (permit package, etc.)
  const generatedFiles = files.filter((f) =>
    (GENERATED_FILE_CATEGORIES as readonly string[]).includes(f.file_category as string)
  );

  // Generate signed download URLs (1 hour TTL).
  // Service client bypasses storage RLS — session client returns "Object not found"
  // for files the anon/user policy does not cover.
  const storageClient = createServiceClient();
  const downloadUrls: Record<string, string> = {};
  for (const file of files) {
    const { data: urlData } = await storageClient.storage
      .from("project-files")
      .createSignedUrl((file as { storage_path: string }).storage_path, 3600);
    if (urlData?.signedUrl) {
      downloadUrls[file.id] = urlData.signedUrl;
    }
  }

  // Signed URL for the latest *completed* permit package (from n8n result payload).
  // Uses latestCompletedPackageJob, not packageJob, so a newer queued/failed job
  // does not hide an already-completed package.
  let packageDownloadUrl: string | null = null;
  if (latestCompletedPackageJob) {
    const filePath = (latestCompletedPackageJob.result as Record<string, unknown> | null)?.file_path;
    if (filePath && typeof filePath === "string") {
      const { data: pkgUrlData } = await storageClient.storage
        .from("project-files")
        .createSignedUrl(filePath.replace(/^\/+/, ""), 3600);
      packageDownloadUrl = pkgUrlData?.signedUrl ?? null;
    }
  }

  // Fetch TCD selections — include tcd_library_item_id for the "already selected" set
  const { data: tcdData } = await supabase
    .from("project_tcd_selections")
    .select("id, sort_order, tcd_library_item_id, tcd_library ( code, description )")
    .eq("project_id", id)
    .order("sort_order", { ascending: true });

  const selectedTCDs = (tcdData ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,                    // selection row ID — used for Remove
    tcdItemId: row.tcd_library_item_id as string,
    code: (row.tcd_library as { code: string; description: string } | null)?.code ?? "—",
    description:
      (row.tcd_library as { code: string; description: string } | null)?.description ?? "",
  }));

  // Set of tcd_library IDs already added — passed to modal to hide already-selected items
  const selectedTcdItemIds = new Set(selectedTCDs.map((t) => t.tcdItemId));

  // Fetch recent activity
  const { data: activityData } = await supabase
    .from("project_activity")
    .select("id, actor_label, action, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  const activity = activityData ?? [];

  // Designer display
  const designerName = project.assigned_designer_name;
  const designerInitials = designerName
    ? designerName
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .slice(0, 2)
    : null;

  // Authority display
  const authorityDisplay = (() => {
    if (project.authority_type === "njdot") return "NJDOT";
    if (project.county) return `${project.county} County`;
    if (project.city) return project.city;
    return humanize(project.authority_type);
  })();

  const inReview = project.status === "waiting_for_admin_review";

  // Permit Package card prerequisites
  const prereqs = {
    sld:      sldFiles.length > 0,
    tcd:      selectedTCDs.length > 0,
    tcp:      tcpFiles.length > 0,
    approved: !["intake_review", "waiting_on_client", "ready_for_assignment",
                "assigned", "in_design", "waiting_for_admin_review",
                "revisions_required", "cancelled"].includes(project.status),
  };
  const prereqsMet = prereqs.sld && prereqs.tcd && prereqs.tcp && prereqs.approved;
  const hasCompletedPackage = !!latestCompletedPackageJob && !!packageDownloadUrl;


  return (
    <div className="h-full flex flex-col">

      {/* ── Sticky project header ── */}
      <div
        className="flex-shrink-0 bg-card px-8 py-4 flex items-center gap-4"
        style={{ boxShadow: "0 1px 0 rgba(43,52,55,0.08)" }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <Link href="/admin/projects" className="text-xs text-muted hover:text-dim transition-colors">
              Projects
            </Link>
            <span className="text-xs text-faint">/</span>
            <span className="text-xs text-muted font-mono">{project.job_number}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-base font-semibold text-ink">{project.job_name}</h1>
            <ProjectStatusBadge status={project.status} />
            <BillingStatusBadge status={project.billing_status} />
          </div>
          <p className="text-xs text-muted mt-0.5">
            {project.company_name ?? "—"} · {authorityDisplay}
          </p>
        </div>

        {/* Quick approve button in header when in review */}
        {inReview && (
          <div className="flex-shrink-0">
            <ApproveDesignForm projectId={project.id} />
          </div>
        )}
      </div>

      {/* ── Two-column body ── */}
      <div className="flex-1 flex min-h-0">
        <div className="flex gap-0 min-h-0 flex-1">

          {/* ── Left: main workflow sections ── */}
          <div className="flex-1 min-w-0 overflow-y-auto p-8 space-y-6">

            {/* 1. Core Intake Data */}
            <EditIntakeForm project={project} />

            {/* 2. Project Intelligence */}
            <ProjectIntelligenceSection
              projectId={project.id}
              jurisdiction={jurisdiction}
              estimatedPrice={project.estimated_price}
              isStale={isIntelligenceStale}
            />

            {/* 3. Client Intake Files */}
            <SectionCard id="section-intake" title="Client Intake Files">
              {intakeFiles.length === 0 ? (
                <p className="text-sm text-muted">No intake files attached yet.</p>
              ) : (
                <div className="divide-y divide-surface">
                  {intakeFiles.map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-4 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded bg-red-50 flex items-center justify-center flex-shrink-0">
                          <span className="text-[9px] font-bold text-red-600 tracking-tight">PDF</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-ink truncate">{f.file_name}</p>
                          <p className="text-xs text-muted">
                            {FILE_CATEGORY_LABELS[f.file_category as keyof typeof FILE_CATEGORY_LABELS] ?? f.file_category}
                            {f.uploader_label ? ` · ${f.uploader_label}` : ""}
                            {" · "}
                            {formatDateTime(f.created_at)}
                          </p>
                        </div>
                      </div>
                      {downloadUrls[f.id] ? (
                        <a
                          href={downloadUrls[f.id]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex-shrink-0"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-xs text-faint flex-shrink-0">—</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* 4. SLD Files */}
            <SectionCard
              id="section-sld"
              title="SLD Sheets"
            >
              {sldFiles.length > 0 && (
                <div className="divide-y divide-surface mb-4">
                  {sldFiles.map((f) => (
                    <FileRow
                      key={f.id}
                      file={f as { id: string; file_name: string; created_at: string; uploader_label?: string | null }}
                      downloadUrl={downloadUrls[f.id]}
                    />
                  ))}
                </div>
              )}
              <UploadSLDForm projectId={project.id} />
            </SectionCard>

            {/* 5. TCD Selection */}
            <SectionCard
              id="section-tcd"
              title="TCD Selection"
              action={
                <TcdLibraryModal
                  projectId={project.id}
                  projectState={project.state}
                  library={tcdLibrary}
                  selectedIds={selectedTcdItemIds}
                />
              }
            >
              {selectedTCDs.length === 0 ? (
                <p className="text-sm text-muted">No TCD sheets selected yet.</p>
              ) : (
                <div className="space-y-2">
                  {selectedTCDs.map((tcd) => (
                    <div key={tcd.id} className="flex items-center justify-between gap-4 bg-surface rounded-lg px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">{tcd.code}</p>
                        <p className="text-xs text-muted">{tcd.description}</p>
                      </div>
                      <RemoveTCDButton selectionId={tcd.id} projectId={project.id} />
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* 6. Designer Assignment */}
            <SectionCard
              title="Designer Assignment"
              description="Assign a designer after SLD sheets are uploaded and TCD selection is complete."
            >
              {designerName ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-soft flex items-center justify-center flex-shrink-0">
                        <span className="text-[11px] font-semibold text-primary">{designerInitials}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-ink">{designerName}</p>
                        <p className="text-xs text-muted">Assigned {formatDate(project.assigned_at)}</p>
                      </div>
                    </div>
                    <span className="text-xs text-muted">Reassign:</span>
                  </div>
                  <AssignDesignerForm
                    projectId={project.id}
                    designers={designers}
                    currentDesignerId={project.assigned_designer_id}
                  />
                </div>
              ) : (
                <AssignDesignerForm
                  projectId={project.id}
                  designers={designers}
                  currentDesignerId={null}
                />
              )}
            </SectionCard>

            {/* 7. TCP Design Files */}
            <SectionCard
              id="section-tcp"
              title="TCP Design Files"
            >
              {designerName ? (
                tcpFiles.length === 0 ? (
                  <p className="text-sm text-muted">Awaiting TCP upload from {designerName}.</p>
                ) : (
                  <div className="divide-y divide-surface">
                    {tcpFiles.map((f) => (
                      <FileRow
                        key={f.id}
                        file={f as { id: string; file_name: string; created_at: string; uploader_label?: string | null }}
                        downloadUrl={downloadUrls[f.id]}
                      />
                    ))}
                  </div>
                )
              ) : (
                <p className="text-sm text-muted">Assign a designer before TCP files can be uploaded.</p>
              )}
            </SectionCard>

            {/* 8. Admin Review & Approval */}
            <SectionCard
              title="Admin Review & Approval"
              description="Review TCP sheets above, then approve the design or request revisions."
            >
              {inReview ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 bg-violet-50 rounded-lg px-4 py-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {designerName ?? "Designer"} has submitted TCP sheets for review.
                      </p>
                      <p className="text-xs text-muted mt-0.5">
                        Review the TCP design files above before approving or requesting revisions.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-6">
                    <div className="flex-1">
                      <p className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                        Request Revisions
                      </p>
                      <RequestRevisionsForm projectId={project.id} />
                    </div>
                    <div className="pt-5">
                      <ApproveDesignForm projectId={project.id} />
                    </div>
                  </div>
                </div>
              ) : project.status === "revisions_required" ? (
                <div className="flex items-start gap-3 bg-red-50 rounded-lg px-4 py-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                  <p className="text-sm text-ink">
                    Revisions have been requested. Awaiting revised TCP sheets from{" "}
                    {designerName ?? "designer"}.
                  </p>
                </div>
              ) : ["approved", "package_generating", "ready_for_submission", "submitted",
                   "waiting_on_authority", "authority_action_needed", "permit_received", "closed"].includes(project.status) ? (
                <div className="flex items-center gap-2 text-sm text-emerald-700">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <circle cx="8" cy="8" r="7" fill="#dcfce7" />
                    <path d="M5 8l2 2 4-4" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Design approved. Package generation is now eligible.
                </div>
              ) : (
                <p className="text-sm text-muted">
                  Awaiting designer submission. TCP sheets must be uploaded and submitted for review before approval.
                </p>
              )}
            </SectionCard>

            {/* 9. Package History */}
            {generatedFiles.length > 0 && (() => {
              // generatedFiles is ordered ascending (oldest first).
              // Newest = last element = current version = highest version number.
              const total = generatedFiles.length;
              // Render newest-first for the version history view.
              const newest = [...generatedFiles].reverse();
              return (
                <SectionCard id="section-generated" title="Package History">
                  <div className="divide-y divide-surface">
                    {newest.map((f, i) => {
                      const versionNumber = total - i; // newest → total, oldest → 1
                      const isCurrent = i === 0;
                      const url = downloadUrls[f.id];
                      return (
                        <div key={f.id} className="flex items-center justify-between gap-3 py-2.5">
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Version label */}
                            {isCurrent ? (
                              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5 flex-shrink-0 whitespace-nowrap">
                                Current
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-muted tabular-nums flex-shrink-0 w-[44px] text-right">
                                v{versionNumber}
                              </span>
                            )}
                            {/* Timestamp */}
                            <p className={`text-xs tabular-nums flex-shrink-0 ${isCurrent ? "text-ink font-medium" : "text-muted"}`}>
                              {formatDateTime(f.created_at)}
                            </p>
                          </div>
                          {/* Action */}
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`text-xs flex-shrink-0 hover:underline ${isCurrent ? "text-primary font-medium" : "text-dim"}`}
                            >
                              View
                            </a>
                          ) : (
                            <span className="text-xs text-faint flex-shrink-0">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              );
            })()}

            {/* 10. Permit Package */}
            <SectionCard title="Permit Package">
              <div className="space-y-4">

                {/* Prerequisite checklist */}
                <div className="flex items-center gap-5 flex-wrap">
                  {([
                    { label: "SLD Sheets",      met: prereqs.sld },
                    { label: "TCD Selection",   met: prereqs.tcd },
                    { label: "TCP Sheets",       met: prereqs.tcp },
                    { label: "Admin Approval",  met: prereqs.approved },
                  ] as { label: string; met: boolean }[]).map(({ label, met }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      {met ? (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                          <circle cx="7" cy="7" r="6" fill="#dcfce7" />
                          <path d="M4 7l2 2 4-4" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                          <circle cx="7" cy="7" r="6" stroke="#d1d5db" strokeWidth="1.2" />
                        </svg>
                      )}
                      <span className={`text-xs ${met ? "text-ink" : "text-muted"}`}>{label}</span>
                    </div>
                  ))}
                </div>

                {/* Completed package — primary state */}
                {hasCompletedPackage && (
                  <div className="flex items-center justify-between gap-4 bg-emerald-50 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-emerald-800">Package ready</p>
                      <p className="text-xs text-emerald-600 mt-0.5">
                        Generated {formatDate(latestCompletedPackageJob!.updated_at ?? latestCompletedPackageJob!.created_at)}
                      </p>
                    </div>
                    <a
                      href={packageDownloadUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white"
                      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
                    >
                      View Package
                    </a>
                  </div>
                )}

                {/* In-flight job status (pending / running / failed — not completed) */}
                {packageJob && packageJob.status !== "completed" && (
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                        packageJob.status === "failed"  ? "bg-red-500" :
                        packageJob.status === "running" ? "bg-blue-500 animate-pulse" :
                        "bg-amber-400"
                      }`}
                    />
                    <span className={`text-sm font-medium ${JOB_STATUS_COLOR[packageJob.status as WorkflowJobStatus] ?? "text-muted"}`}>
                      {JOB_STATUS_LABEL[packageJob.status as WorkflowJobStatus] ?? packageJob.status}
                    </span>
                    <span className="text-xs text-muted">· {formatDate(packageJob.updated_at ?? packageJob.created_at)}</span>
                    {packageJob.error && (
                      <span className="text-xs text-red-600 ml-1">— {packageJob.error}</span>
                    )}
                  </div>
                )}

                {/* Generate / Regenerate action row */}
                <div className="flex items-center justify-between gap-4 pt-1">
                  {(hasCompletedPackage || !prereqsMet) && (
                    <p className="text-xs text-muted">
                      {hasCompletedPackage
                        ? "Regenerate to rebuild the package with current files."
                        : "Complete prerequisites above to enable generation."}
                    </p>
                  )}
                  <GeneratePackageButton
                    projectId={project.id}
                    canGenerate={prereqsMet && project.status === "approved"}
                    disabledReason={
                      !prereqs.approved ? "Design must be approved" :
                      !prereqs.sld      ? "Upload at least 1 SLD sheet" :
                      !prereqs.tcd      ? "Select at least 1 TCD sheet" :
                      !prereqs.tcp      ? "Upload at least 1 TCP sheet" :
                      undefined
                    }
                  />
                </div>

              </div>
            </SectionCard>

            {/* 10. Submission & Permit Tracking */}
            <SectionCard
              title="Submission & Permit Tracking"
              description="Track the submission to the government authority and record the permit outcome."
            >
              {["ready_for_submission", "submitted", "waiting_on_authority",
                "authority_action_needed", "permit_received", "closed"].includes(project.status) ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                    <FieldPair label="Submission Date"      value={formatDate(project.submission_date)} />
                    <FieldPair label="Authority Tracking #" value={project.authority_tracking_number} />
                    <FieldPair label="Expected Response"    value={formatDate(project.expected_response_date)} />
                    <FieldPair label="Permit Received"      value={formatDate(project.permit_received_date)} />
                  </div>
                  {project.permit_notes && (
                    <div className="pt-4" style={{ borderTop: "1px solid #e3e9ec" }}>
                      <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1">Authority Notes</p>
                      <p className="text-sm text-ink">{project.permit_notes}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted">
                  Available after the permit package is generated and ready for submission.
                </p>
              )}
            </SectionCard>

            {/* 11. Workflow Activity */}
            <SectionCard
              title="Workflow Activity"
              action={
                <Link href={`/admin/workflows?project=${id}`} className="text-xs text-blue-600 hover:underline">
                  Full list
                </Link>
              }
            >
              {workflowJobs.length === 0 ? (
                <p className="text-sm text-muted">No workflow jobs yet.</p>
              ) : (
                <div className="divide-y divide-surface -mx-6 px-0 max-h-[320px] overflow-y-auto">
                  {workflowJobs.map((job) => {
                    const s = job.status as WorkflowJobStatus;
                    return (
                      <div key={job.id} className="flex items-center justify-between gap-4 px-6 py-2">
                        <div className="min-w-0">
                          <p className="text-xs text-ink font-medium">
                            {JOB_TYPE_LABELS_INLINE[job.job_type as string] ?? job.job_type}
                          </p>
                          <p className="text-[11px] text-muted">{formatDateTime(job.created_at)}</p>
                          {job.error && <p className="text-[11px] text-red-500 mt-0.5">{job.error}</p>}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className={`text-xs font-medium ${JOB_STATUS_COLOR[s] ?? "text-muted"}`}>
                            {JOB_STATUS_LABEL[s] ?? s}
                          </span>
                          <Link href={`/admin/workflows/${job.id}`} className="text-xs text-blue-600 hover:underline">
                            View
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>

          {/* ── Right: status rail ── */}
          <div className="w-[200px] min-w-[160px] flex-shrink border-l border-surface bg-canvas overflow-y-auto">
            <div className="p-3 space-y-3">

              {/* Designer */}
              <div>
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Designer</p>
                {designerName ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary-soft flex items-center justify-center flex-shrink-0">
                      <span className="text-[8px] font-semibold text-primary">{designerInitials}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink truncate">{designerName}</p>
                      <p className="text-[10px] text-muted leading-tight">Assigned {formatDate(project.assigned_at)}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted">Unassigned</p>
                )}
              </div>

              {/* Billing */}
              <div style={{ borderTop: "1px solid #e3e9ec" }} className="pt-3">
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Billing</p>
                <div className="flex items-center justify-between gap-2">
                  <BillingStatusBadge status={project.billing_status} />
                  <button className="text-[10px] text-muted hover:text-primary transition-colors">Manage</button>
                </div>
              </div>

              {/* Files — click to jump to section */}
              <div style={{ borderTop: "1px solid #e3e9ec" }} className="pt-3">
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Files</p>
                <RailFileNav items={[
                  { label: "Intake Files",  count: intakeFiles.length,   targetId: "section-intake" },
                  { label: "SLD Sheets",    count: sldFiles.length,      targetId: "section-sld" },
                  { label: "TCP Sheets",    count: tcpFiles.length,      targetId: "section-tcp" },
                  { label: "TCD Selected",  count: selectedTCDs.length,  targetId: "section-tcd" },
                  ...(generatedFiles.length > 0
                    ? [{ label: "Generated",  count: generatedFiles.length, targetId: "section-generated" }]
                    : []
                  ),
                ]} />
              </div>

              {/* Activity */}
              <div style={{ borderTop: "1px solid #e3e9ec" }} className="pt-3">
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Activity</p>
                {activity.length === 0 ? (
                  <p className="text-xs text-muted">No activity yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-0.5">
                    {activity.map((entry) => (
                      <div key={entry.id} className="flex gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-rule mt-1 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[10px] text-ink leading-snug">
                            <span className="font-medium">{entry.actor_label || "System"}</span>{" "}
                            {entry.action}
                          </p>
                          <p className="text-[10px] text-faint">{formatDate(entry.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Note */}
              <div style={{ borderTop: "1px solid #e3e9ec" }} className="pt-3">
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Note</p>
                <textarea
                  rows={2}
                  className="w-full text-[11px] text-ink bg-card rounded-md px-2 py-1.5 resize-none outline-none"
                  style={{ border: "1px solid #d4dde4" }}
                  placeholder="Leave a note…"
                />
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
