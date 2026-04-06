import type { Metadata } from "next";
import Link from "next/link";
import { ProjectStatusBadge } from "@/components/ui/StatusBadge";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Project" };

// Designer project view: focused on their task — upload TCP sheets.
// Designer sees: project info (read), SLD references (read), TCP upload (write).
// TODO: Replace with Supabase fetch by project ID (params.id), scoped to assigned designer.

const PLACEHOLDER = {
  id: "4",
  jobNumber: "FP-2026-0018",
  jobName: "Comcast Aerial TCP — Rt. 46 SB",
  client: "Comcast Northeast",
  authority: "Bergen County",
  county: "Bergen",
  status: "in_design" as const,
  jobAddress: "Route 46 SB, Lodi, NJ 07644",
  typeOfPlan: "Aerial",
  jobType: "TCP",
  notes: "Work zone spans MP 63.4–64.1. Shoulder closure only.",
  requestedApprovalDate: "Apr 25, 2026",
  selectedTCDs: [
    { code: "TCD-2", description: "Divided highway shoulder closure, no flaggers" },
  ],
  sldFiles: [
    { id: "s1", name: "Rt46_SB_SLD_63.4-64.1.pdf", uploadedAt: "Apr 3, 2026" },
  ],
  tcpFiles: [
    { id: "t1", name: "Rt46_SB_TCP_Sheet1.pdf", uploadedAt: "Apr 4, 2026" },
    { id: "t2", name: "Rt46_SB_TCP_Sheet2.pdf", uploadedAt: "Apr 4, 2026" },
  ],
};

export default async function DesignerProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // TODO: const project = await getProjectForDesigner(id);
  const project = { ...PLACEHOLDER, id };

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      {/* Breadcrumb + title */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Link href="/designer" className="text-xs text-muted hover:text-dim transition-colors">
            My Work
          </Link>
          <span className="text-xs text-faint">/</span>
          <span className="text-xs text-muted font-mono">{project.jobNumber}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-semibold text-ink">{project.jobName}</h1>
          <ProjectStatusBadge status={project.status} />
        </div>
        <p className="text-sm text-muted mt-0.5">
          {project.client} · {project.authority} · Due {project.requestedApprovalDate}
        </p>
      </div>

      {/* Project reference info (read-only) */}
      <SectionCard title="Project Details" description="Provided by admin. Read-only.">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          {[
            { label: "Job Address",   value: project.jobAddress },
            { label: "Type of Plan",  value: project.typeOfPlan },
            { label: "Job Type",      value: project.jobType },
            { label: "Authority",     value: project.authority },
            { label: "County",        value: project.county },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">{label}</p>
              <p className="text-sm text-ink">{value}</p>
            </div>
          ))}
        </div>
        {project.notes && (
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid #e3e9ec" }}>
            <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1">Notes from Admin</p>
            <p className="text-sm text-ink">{project.notes}</p>
          </div>
        )}
      </SectionCard>

      {/* TCD reference */}
      <SectionCard title="Selected TCD Sheets" description="Selected by admin. Use these as the basis for your TCP design.">
        <div className="space-y-2">
          {project.selectedTCDs.map((tcd) => (
            <div key={tcd.code} className="flex items-center justify-between gap-4 bg-surface rounded-lg px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">{tcd.code}</p>
                <p className="text-xs text-muted">{tcd.description}</p>
              </div>
              {/* TODO: View/download TCD sheet PDF from library */}
              <button className="text-xs text-primary hover:underline flex-shrink-0">View Sheet</button>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* SLD reference (read-only for designer) */}
      <SectionCard title="SLD Sheets" description="Uploaded by admin. Use as reference geometry for the TCP layout.">
        {project.sldFiles.length === 0 ? (
          <EmptyState
            title="No SLD sheets yet"
            description="Admin has not uploaded SLD sheets. Reach out for clarification before starting design."
          />
        ) : (
          <div className="divide-y divide-surface">
            {project.sldFiles.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-4 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded bg-red-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-[9px] font-bold text-red-600">PDF</span>
                  </div>
                  <p className="text-sm text-ink truncate">{f.name}</p>
                </div>
                <button className="text-xs text-primary hover:underline flex-shrink-0">Download</button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* TCP upload — designer's primary action */}
      <SectionCard
        title="TCP Sheets"
        description="Upload your completed Traffic Control Plan sheets here. All files must be PDF."
        action={
          <button
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
            style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
          >
            {/* TODO: Wire to Supabase Storage upload, file_category = 'tcp_pdf' */}
            + Upload TCP Sheet
          </button>
        }
      >
        {project.tcpFiles.length === 0 ? (
          <EmptyState
            title="No TCP sheets uploaded yet"
            description="Upload your Traffic Control Plan PDF sheets. You can upload multiple sheets."
          />
        ) : (
          <div className="divide-y divide-surface">
            {project.tcpFiles.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-4 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded bg-red-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-[9px] font-bold text-red-600">PDF</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-ink truncate">{f.name}</p>
                    <p className="text-xs text-muted">Uploaded {f.uploadedAt}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button className="text-xs text-primary hover:underline">Download</button>
                  {/* TODO: Only allow delete if project is not yet submitted for review */}
                  <button className="text-xs text-danger hover:underline">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Submit for review */}
      <div className="flex items-center justify-between gap-4 bg-card rounded-xl px-6 py-5"
        style={{ boxShadow: "0 1px 12px rgba(43,52,55,0.06)" }}>
        <div>
          <p className="text-sm font-semibold text-ink">Ready for admin review?</p>
          <p className="text-xs text-muted mt-0.5">
            All TCP sheets must be uploaded before submitting for review.
          </p>
        </div>
        <button
          className="flex-shrink-0 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
          // TODO: Trigger status change: in_design → waiting_for_admin_review
          // TODO: Disable if tcpFiles.length === 0
        >
          Submit for Review
        </button>
      </div>
    </div>
  );
}
