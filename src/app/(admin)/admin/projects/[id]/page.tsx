import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProjectStatusBadge, BillingStatusBadge } from "@/components/ui/StatusBadge";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { createClient } from "@/lib/supabase/server";
import { getProjectDetail } from "@/lib/queries/projects";
import { formatDate, humanize } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Project" };

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
}: {
  file: { id: string; file_name: string; created_at: string; uploader_label?: string | null };
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
      {/* TODO: Wire to signed download URL from Supabase Storage */}
      <button className="text-xs text-primary hover:underline flex-shrink-0">Download</button>
    </div>
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

  const project = await getProjectDetail(supabase, id);
  if (!project) notFound();

  // Fetch project files
  const { data: filesData } = await supabase
    .from("project_files")
    .select("id, file_name, file_category, created_at, uploaded_by")
    .eq("project_id", id)
    .order("created_at", { ascending: true });

  const files = filesData ?? [];
  const sldFiles = files.filter((f) => f.file_category === "sld_sheet");
  const tcpFiles = files.filter((f) => f.file_category === "tcp_pdf");

  // Fetch TCD selections with library item details
  const { data: tcdData } = await supabase
    .from("project_tcd_selections")
    .select("id, sort_order, tcd_library ( code, description )")
    .eq("project_id", id)
    .order("sort_order", { ascending: true });

  const selectedTCDs = (tcdData ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    code: (row.tcd_library as { code: string; description: string } | null)?.code ?? "—",
    description:
      (row.tcd_library as { code: string; description: string } | null)?.description ?? "",
  }));

  // Fetch recent activity
  const { data: activityData } = await supabase
    .from("project_activity")
    .select("id, actor_label, action, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  const activity = activityData ?? [];

  // Build designer initials for avatar
  const designerName = project.assigned_designer_name;
  const designerInitials = designerName
    ? designerName.split(" ").map((n: string) => n[0]).join("").slice(0, 2)
    : null;

  // Authority display
  const authorityDisplay = (() => {
    if (project.authority_type === "njdot") return "NJDOT";
    if (project.county) return `${project.county} County`;
    if (project.city) return project.city;
    return humanize(project.authority_type);
  })();

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
            {project.county ? ` · ${project.county} County` : ""}
          </p>
        </div>

        {/* Key actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-canvas text-dim hover:bg-wash hover:text-ink transition-colors">
            Edit Details
          </button>
          {project.status === "waiting_for_admin_review" && (
            <button
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
              style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
            >
              Approve Design
            </button>
          )}
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex gap-0 h-full">

          {/* ── Left: main workflow sections ── */}
          <div className="flex-1 min-w-0 p-8 space-y-6">

            {/* 1. Core Intake Data */}
            <SectionCard
              title="Intake & Core Data"
              description="Information submitted at project intake. Verified by admin before design assignment."
              action={<button className="text-xs text-primary hover:underline">Edit</button>}
            >
              <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
                <FieldPair label="Job Number (Client)"   value={project.job_number_client} />
                <FieldPair label="Rhino PM"              value={project.rhino_pm} />
                <FieldPair label="Comcast Manager"       value={project.comcast_manager} />
                <FieldPair label="Submitted to FiberPro" value={formatDate(project.submitted_to_fiberpro)} />
                <FieldPair label="Requested Approval"    value={formatDate(project.requested_approval_date)} />
                <FieldPair label="Type of Plan"          value={humanize(project.type_of_plan)} />
                <FieldPair label="Job Type"              value={humanize(project.job_type)} />
                <FieldPair label="Authority"             value={authorityDisplay} />
                <FieldPair label="County"                value={project.county} />
                <FieldPair label="Township"              value={project.township} />
                <FieldPair label="City / Municipality"   value={project.city} />
                <FieldPair label="Job Address"           value={project.job_address} />
              </div>
              {project.notes && (
                <div className="mt-4 pt-4" style={{ borderTop: "1px solid #e3e9ec" }}>
                  <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-sm text-ink">{project.notes}</p>
                </div>
              )}
            </SectionCard>

            {/* 2. SLD Files (admin uploads) */}
            <SectionCard
              title="SLD Sheets"
              description="Street-level diagrams uploaded by admin. Used by designer as reference."
              action={
                <button className="text-xs font-medium text-primary hover:underline">
                  {/* TODO: Wire to Supabase Storage upload */}
                  + Upload SLD
                </button>
              }
            >
              {sldFiles.length === 0 ? (
                <EmptyState
                  title="No SLD sheets uploaded"
                  description="Upload SLD sheets before assigning to a designer."
                />
              ) : (
                <div className="divide-y divide-surface">
                  {sldFiles.map((f) => (
                    <FileRow key={f.id} file={f} />
                  ))}
                </div>
              )}
            </SectionCard>

            {/* 3. TCD Selection (admin manual) */}
            <SectionCard
              title="TCD Selection"
              description="Admin selects the applicable TCD sheet(s) from the system library. Included in the permit package."
              action={
                <button className="text-xs font-medium text-primary hover:underline">
                  {/* TODO: Open TCD library modal */}
                  + Select from Library
                </button>
              }
            >
              {selectedTCDs.length === 0 ? (
                <EmptyState
                  title="No TCD sheets selected"
                  description="Select one or more TCD sheets from the library before generating the package."
                />
              ) : (
                <div className="space-y-2">
                  {selectedTCDs.map((tcd) => (
                    <div key={tcd.id} className="flex items-center justify-between gap-4 bg-surface rounded-lg px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">{tcd.code}</p>
                        <p className="text-xs text-muted">{tcd.description}</p>
                      </div>
                      <button className="text-xs text-red-500 hover:underline flex-shrink-0">Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* 4. Designer Assignment */}
            <SectionCard
              title="Designer Assignment"
              description="Assign a designer after SLD sheets are uploaded and TCD selection is complete."
            >
              {designerName ? (
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
                  <button className="text-xs text-muted hover:text-primary transition-colors">
                    Reassign
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-dim">No designer assigned yet.</p>
                  <button
                    className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
                    style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
                  >
                    + Assign Designer
                  </button>
                </div>
              )}
            </SectionCard>

            {/* 5. TCP Design (designer uploads) */}
            <SectionCard
              title="TCP Design Files"
              description="Traffic Control Plan sheets uploaded by the assigned designer."
            >
              {designerName ? (
                tcpFiles.length === 0 ? (
                  <EmptyState
                    title="Awaiting designer upload"
                    description={`${designerName} has not uploaded TCP sheets yet.`}
                  />
                ) : (
                  <div className="divide-y divide-surface">
                    {tcpFiles.map((f) => (
                      <FileRow key={f.id} file={f} />
                    ))}
                  </div>
                )
              ) : (
                <EmptyState
                  title="No designer assigned"
                  description="Assign a designer before TCP files can be uploaded."
                />
              )}
            </SectionCard>

            {/* 6. Admin Review & Approval */}
            <SectionCard
              title="Admin Review & Approval"
              description="Review TCP sheets above, then approve the design or request revisions."
            >
              {project.status === "waiting_for_admin_review" ? (
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
                  <div className="flex items-center gap-3">
                    <button className="px-4 py-2 rounded-lg text-xs font-medium bg-canvas text-dim hover:bg-wash hover:text-ink transition-colors">
                      Request Revisions
                    </button>
                    <button
                      className="px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors"
                      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
                    >
                      Approve Design
                    </button>
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

            {/* 7. Permit Package Generation */}
            <SectionCard
              title="Permit Package"
              description="Assembled from: cover sheet + TCP sheets + SLD sheets + selected TCD sheets. Generated as an async workflow job."
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-dim">
                    {project.status === "approved"
                      ? "Design is approved. Select a cover sheet template and generate the package."
                      : "Package generation requires: SLD sheets · TCD selection · TCP sheets · Admin approval."}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    Generation runs as a background job via n8n. The page will reflect completion when the job reports back.
                  </p>
                </div>
                <button
                  disabled={project.status !== "approved"}
                  className="flex-shrink-0 px-4 py-2 rounded-lg text-xs font-medium bg-canvas text-muted cursor-not-allowed"
                >
                  Generate Package
                </button>
              </div>
              {/* TODO: Show workflow_jobs status if package_generating */}
            </SectionCard>

            {/* 8. Submission & Permit Tracking */}
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
                  <button className="text-xs text-primary hover:underline">
                    Update Submission Details
                  </button>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  Submission tracking becomes available after the permit package is generated and ready for submission.
                </p>
              )}
            </SectionCard>
          </div>

          {/* ── Right: status sidebar ── */}
          <div className="w-[300px] flex-shrink-0 border-l border-surface bg-canvas">
            <div className="p-5 space-y-6 sticky top-0">

              {/* Designer summary */}
              <div>
                <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-3">Designer</p>
                {designerName ? (
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-primary-soft flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-semibold text-primary">{designerInitials}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink">{designerName}</p>
                      <p className="text-xs text-muted">Assigned {formatDate(project.assigned_at)}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted">Unassigned</p>
                )}
              </div>

              {/* Billing */}
              <div style={{ borderTop: "1px solid #e3e9ec" }} className="pt-5">
                <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-3">Billing</p>
                <div className="flex items-center justify-between gap-2">
                  <BillingStatusBadge status={project.billing_status} />
                  <button className="text-xs text-muted hover:text-primary transition-colors">Manage</button>
                </div>
                <p className="text-xs text-muted mt-2">Invoice eligible after package is generated.</p>
              </div>

              {/* Files summary */}
              <div style={{ borderTop: "1px solid #e3e9ec" }} className="pt-5">
                <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-3">Files</p>
                <div className="space-y-1.5 text-xs text-dim">
                  <div className="flex justify-between">
                    <span>SLD Sheets</span>
                    <span className="font-medium text-ink">{sldFiles.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>TCP Sheets</span>
                    <span className="font-medium text-ink">{tcpFiles.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>TCD Selected</span>
                    <span className="font-medium text-ink">{selectedTCDs.length}</span>
                  </div>
                </div>
              </div>

              {/* Activity feed */}
              <div style={{ borderTop: "1px solid #e3e9ec" }} className="pt-5">
                <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-3">Activity</p>
                {activity.length === 0 ? (
                  <p className="text-xs text-muted">No activity yet.</p>
                ) : (
                  <div className="space-y-3">
                    {activity.map((entry) => (
                      <div key={entry.id} className="flex gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-rule mt-1.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-ink">
                            <span className="font-medium">{entry.actor_label || "System"}</span>{" "}
                            {entry.action}
                          </p>
                          <p className="text-[10px] text-muted mt-0.5">{formatDate(entry.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Comment input */}
                <div className="mt-4 pt-3" style={{ borderTop: "1px solid #e3e9ec" }}>
                  <p className="text-xs text-muted mb-2">Add comment</p>
                  <textarea
                    rows={2}
                    className="w-full text-xs text-ink bg-card rounded-lg px-2.5 py-2 resize-none outline-none"
                    style={{ border: "1px solid #d4dde4" }}
                    placeholder="Leave a note..."
                  />
                  {/* TODO: Wire comment submission to project_messages table in next phase */}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
