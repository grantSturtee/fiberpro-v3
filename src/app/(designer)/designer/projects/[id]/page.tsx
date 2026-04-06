import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProjectStatusBadge } from "@/components/ui/StatusBadge";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { UploadTCPForm } from "@/components/designer/UploadTCPForm";
import { SubmitForReviewForm } from "@/components/designer/SubmitForReviewForm";
import { DeleteTCPFileForm } from "@/components/designer/DeleteTCPFileForm";
import { createClient } from "@/lib/supabase/server";
import { getProjectDetail } from "@/lib/queries/projects";
import { formatDate, humanize } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Project" };

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DesignerProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/sign-in");

  const designerId = userData.user.id;

  const project = await getProjectDetail(supabase, id);

  // 404 if not found or not assigned to this designer
  if (!project || project.assigned_designer_id !== designerId) {
    notFound();
  }

  // Fetch SLD files (read-only reference for designer)
  const { data: sldData } = await supabase
    .from("project_files")
    .select("id, file_name, created_at, storage_path")
    .eq("project_id", id)
    .eq("file_category", "sld_sheet")
    .order("created_at", { ascending: true });

  const sldFiles = (sldData ?? []) as {
    id: string;
    file_name: string;
    created_at: string;
    storage_path: string;
  }[];

  // Fetch TCP files uploaded by this designer
  const { data: tcpData } = await supabase
    .from("project_files")
    .select("id, file_name, created_at, storage_path, file_size_bytes")
    .eq("project_id", id)
    .eq("file_category", "tcp_pdf")
    .order("created_at", { ascending: true });

  const tcpFiles = (tcpData ?? []) as {
    id: string;
    file_name: string;
    created_at: string;
    storage_path: string;
    file_size_bytes: number | null;
  }[];

  // Generate signed download URLs for SLD files
  const sldUrls: Record<string, string> = {};
  for (const f of sldFiles) {
    const { data: urlData } = await supabase.storage
      .from("project-files")
      .createSignedUrl(f.storage_path, 3600);
    if (urlData?.signedUrl) sldUrls[f.id] = urlData.signedUrl;
  }

  // Generate signed download URLs for TCP files
  const tcpUrls: Record<string, string> = {};
  for (const f of tcpFiles) {
    const { data: urlData } = await supabase.storage
      .from("project-files")
      .createSignedUrl(f.storage_path, 3600);
    if (urlData?.signedUrl) tcpUrls[f.id] = urlData.signedUrl;
  }

  // Fetch TCD selections (admin-selected, designer reads as reference)
  const { data: tcdData } = await supabase
    .from("project_tcd_selections")
    .select("id, tcd_library ( code, description )")
    .eq("project_id", id)
    .order("sort_order", { ascending: true });

  const selectedTCDs = (tcdData ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    code: (row.tcd_library as { code: string; description: string } | null)?.code ?? "—",
    description:
      (row.tcd_library as { code: string; description: string } | null)?.description ?? "",
  }));

  // Authority + approval display
  const authorityDisplay = (() => {
    if (project.authority_type === "njdot") return "NJDOT";
    if (project.county) return `${project.county} County`;
    if (project.city) return project.city;
    return humanize(project.authority_type);
  })();

  // Determine if designer can still upload/delete (active design statuses)
  const canEdit = ["assigned", "in_design", "revisions_required"].includes(project.status);
  const hasTCPFiles = tcpFiles.length > 0;

  return (
    <div className="p-8 space-y-6 max-w-3xl mx-auto">

      {/* Breadcrumb + title */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Link href="/designer" className="text-xs text-muted hover:text-dim transition-colors">
            My Work
          </Link>
          <span className="text-xs text-faint">/</span>
          <span className="text-xs text-muted font-mono">{project.job_number}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-semibold text-ink">{project.job_name}</h1>
          <ProjectStatusBadge status={project.status} />
        </div>
        <p className="text-sm text-muted mt-0.5">
          {project.company_name ?? "—"} · {authorityDisplay}
          {project.requested_approval_date
            ? ` · Due ${formatDate(project.requested_approval_date)}`
            : ""}
        </p>
      </div>

      {/* Revisions notice */}
      {project.status === "revisions_required" && (
        <div className="flex items-start gap-3 bg-red-50 rounded-xl px-5 py-4">
          <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-800">Revisions requested</p>
            <p className="text-xs text-red-700 mt-0.5">
              Admin has reviewed your TCP sheets and requested changes. Upload revised sheets and
              resubmit for review.
            </p>
          </div>
        </div>
      )}

      {/* Submitted notice */}
      {project.status === "waiting_for_admin_review" && (
        <div className="flex items-start gap-3 bg-violet-50 rounded-xl px-5 py-4">
          <div className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-1.5 flex-shrink-0" />
          <p className="text-sm text-violet-800">
            TCP sheets submitted. Awaiting admin review.
          </p>
        </div>
      )}

      {/* Project reference info */}
      <SectionCard title="Project Details" description="Provided by admin. Read-only.">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          {[
            { label: "Job Address",   value: project.job_address },
            { label: "Type of Plan",  value: humanize(project.type_of_plan) },
            { label: "Job Type",      value: humanize(project.job_type) },
            { label: "Authority",     value: authorityDisplay },
            { label: "County",        value: project.county },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">{label}</p>
              <p className="text-sm text-ink">{value || <span className="text-faint">—</span>}</p>
            </div>
          ))}
        </div>
        {project.notes && (
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid #e3e9ec" }}>
            <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1">
              Notes from Admin
            </p>
            <p className="text-sm text-ink">{project.notes}</p>
          </div>
        )}
      </SectionCard>

      {/* TCD reference */}
      {selectedTCDs.length > 0 && (
        <SectionCard
          title="Selected TCD Sheets"
          description="Admin-selected. Use as the basis for your TCP design."
        >
          <div className="space-y-2">
            {selectedTCDs.map((tcd) => (
              <div
                key={tcd.id}
                className="flex items-center gap-4 bg-surface rounded-lg px-4 py-3"
              >
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink">{tcd.code}</p>
                  <p className="text-xs text-muted">{tcd.description}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* SLD reference — read-only */}
      <SectionCard
        title="SLD Sheets"
        description="Uploaded by admin. Use as reference geometry for the TCP layout."
      >
        {sldFiles.length === 0 ? (
          <EmptyState
            title="No SLD sheets yet"
            description="Admin has not uploaded SLD sheets. Reach out for clarification before starting design."
          />
        ) : (
          <div className="divide-y divide-surface">
            {sldFiles.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-4 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded bg-red-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-[9px] font-bold text-red-600">PDF</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-ink truncate">{f.file_name}</p>
                    <p className="text-xs text-muted">{formatDate(f.created_at)}</p>
                  </div>
                </div>
                {sldUrls[f.id] ? (
                  <a
                    href={sldUrls[f.id]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex-shrink-0"
                  >
                    Download
                  </a>
                ) : (
                  <span className="text-xs text-faint">—</span>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* TCP upload — designer's primary action */}
      <SectionCard
        title="TCP Sheets"
        description="Upload your completed Traffic Control Plan PDFs here."
        action={canEdit ? <UploadTCPForm projectId={project.id} /> : undefined}
      >
        {tcpFiles.length === 0 ? (
          <EmptyState
            title="No TCP sheets uploaded yet"
            description={
              canEdit
                ? "Upload your Traffic Control Plan PDF sheets. You can upload multiple sheets."
                : "No TCP sheets uploaded for this project."
            }
          />
        ) : (
          <div className="divide-y divide-surface">
            {tcpFiles.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-4 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded bg-red-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-[9px] font-bold text-red-600">PDF</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-ink truncate">{f.file_name}</p>
                    <p className="text-xs text-muted">{formatDate(f.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {tcpUrls[f.id] && (
                    <a
                      href={tcpUrls[f.id]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      Download
                    </a>
                  )}
                  {canEdit && (
                    <DeleteTCPFileForm fileId={f.id} projectId={project.id} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Submit for review — only shown when designer can still act */}
      {canEdit && (
        <SubmitForReviewForm projectId={project.id} hasTCPFiles={hasTCPFiles} />
      )}
    </div>
  );
}
