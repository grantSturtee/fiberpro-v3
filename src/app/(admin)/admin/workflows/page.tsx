import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { JOB_STATUS_LABEL, JOB_STATUS_COLOR, type WorkflowJobStatus, type WorkflowJobType } from "@/types/workflow";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Workflow Jobs" };

const ALL_STATUSES: WorkflowJobStatus[] = ["pending", "running", "completed", "failed", "cancelled"];

const JOB_TYPE_LABELS: Record<string, string> = {
  project_computed:        "Project Computed",
  generate_permit_package: "Generate Package",
  generate_cover_sheet:    "Generate Cover Sheet",
  generate_application_form: "Generate Application",
  generate_tcp_package:    "Generate TCP Package",
  submit_permit:           "Submit Permit",
  generate_invoice:        "Generate Invoice",
  package_generation:      "Package Generation",
  pdf_assembly:            "PDF Assembly",
  permit_submission:       "Permit Submission",
  invoice_generation:      "Invoice Generation",
};

const STATUS_DOT: Record<WorkflowJobStatus, string> = {
  pending:   "bg-amber-400",
  queued:    "bg-amber-400",
  running:   "bg-blue-500 animate-pulse",
  completed: "bg-emerald-500",
  failed:    "bg-red-500",
  cancelled: "bg-slate-400",
};

export default async function WorkflowsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string }>;
}) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/sign-in");

  const { status: statusFilter, type: typeFilter } = await searchParams;

  // Build query
  let query = supabase
    .from("workflow_jobs")
    .select(`
      id,
      project_id,
      job_type,
      status,
      error,
      created_at,
      updated_at,
      projects ( job_number, job_name )
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (statusFilter && statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }
  if (typeFilter && typeFilter !== "all") {
    query = query.eq("job_type", typeFilter);
  }

  const { data: jobs } = await query;
  const rows = jobs ?? [];

  // Collect unique job types for filter dropdown
  const { data: allTypes } = await supabase
    .from("workflow_jobs")
    .select("job_type")
    .order("job_type");
  const uniqueTypes = [...new Set((allTypes ?? []).map((r: { job_type: string }) => r.job_type))];

  function filterUrl(params: Record<string, string>) {
    const p = new URLSearchParams();
    if (statusFilter && statusFilter !== "all") p.set("status", statusFilter);
    if (typeFilter && typeFilter !== "all") p.set("type", typeFilter);
    Object.entries(params).forEach(([k, v]) => {
      if (v === "all") p.delete(k);
      else p.set(k, v);
    });
    const s = p.toString();
    return `/admin/workflows${s ? `?${s}` : ""}`;
  }

  return (
    <div className="p-8 space-y-6 max-w-6xl mx-auto">
      <PageHeader
        title="Workflow Jobs"
        subtitle="All automation jobs enqueued by the app."
      />

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-muted font-medium">Status:</span>
        {["all", ...ALL_STATUSES].map((s) => (
          <Link
            key={s}
            href={filterUrl({ status: s })}
            className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
              (s === "all" && !statusFilter) || statusFilter === s
                ? "bg-ink text-white border-ink"
                : "border-surface text-dim hover:border-muted"
            }`}
          >
            {s === "all" ? "All" : JOB_STATUS_LABEL[s as WorkflowJobStatus] ?? s}
          </Link>
        ))}

        {uniqueTypes.length > 0 && (
          <>
            <span className="text-xs text-muted font-medium ml-4">Type:</span>
            <Link
              href={filterUrl({ type: "all" })}
              className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                !typeFilter || typeFilter === "all"
                  ? "bg-ink text-white border-ink"
                  : "border-surface text-dim hover:border-muted"
              }`}
            >
              All
            </Link>
            {uniqueTypes.map((t) => (
              <Link
                key={t}
                href={filterUrl({ type: t })}
                className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                  typeFilter === t
                    ? "bg-ink text-white border-ink"
                    : "border-surface text-dim hover:border-muted"
                }`}
              >
                {JOB_TYPE_LABELS[t] ?? t}
              </Link>
            ))}
          </>
        )}
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl overflow-hidden" style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}>
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted">No jobs found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface">
                <th className="text-left text-[11px] font-medium text-muted uppercase tracking-wider px-5 py-3">Project</th>
                <th className="text-left text-[11px] font-medium text-muted uppercase tracking-wider px-5 py-3">Type</th>
                <th className="text-left text-[11px] font-medium text-muted uppercase tracking-wider px-5 py-3">Status</th>
                <th className="text-left text-[11px] font-medium text-muted uppercase tracking-wider px-5 py-3">Created</th>
                <th className="text-left text-[11px] font-medium text-muted uppercase tracking-wider px-5 py-3">Updated</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface">
              {rows.map((job) => {
                const project = (Array.isArray(job.projects) ? job.projects[0] : job.projects) as { job_number: string; job_name: string } | null;
                const status = job.status as WorkflowJobStatus;
                return (
                  <tr key={job.id} className="hover:bg-surface/40 transition-colors">
                    <td className="px-5 py-3">
                      {project ? (
                        <Link
                          href={`/admin/projects/${job.project_id}`}
                          className="text-ink hover:underline font-medium"
                        >
                          {project.job_number}
                        </Link>
                      ) : (
                        <span className="text-muted">{job.project_id?.slice(0, 8)}…</span>
                      )}
                      {project?.job_name && (
                        <p className="text-xs text-muted truncate max-w-[180px]">{project.job_name}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-dim">
                      {JOB_TYPE_LABELS[job.job_type as string] ?? job.job_type}
                    </td>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[status] ?? "bg-slate-400"}`} />
                        <span className={`${JOB_STATUS_COLOR[status] ?? "text-muted"} font-medium`}>
                          {JOB_STATUS_LABEL[status] ?? status}
                        </span>
                      </span>
                      {job.error && (
                        <p className="text-xs text-red-500 mt-0.5 truncate max-w-[160px]">{job.error}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-dim text-xs">{formatDate(job.created_at)}</td>
                    <td className="px-5 py-3 text-dim text-xs">{formatDate(job.updated_at)}</td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/workflows/${job.id}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {rows.length === 200 && (
        <p className="text-xs text-muted text-center">Showing most recent 200 jobs. Use filters to narrow results.</p>
      )}
    </div>
  );
}
