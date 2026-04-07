import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { createClient } from "@/lib/supabase/server";
import { JOB_STATUS_LABEL, JOB_STATUS_COLOR, type WorkflowJobStatus } from "@/types/workflow";
import { formatDate } from "@/lib/utils/format";
import { RetryJobButton } from "@/components/admin/RetryJobButton";

export const metadata: Metadata = { title: "Workflow Job" };

const JOB_TYPE_LABELS: Record<string, string> = {
  project_computed:          "Project Computed",
  generate_permit_package:   "Generate Permit Package",
  generate_cover_sheet:      "Generate Cover Sheet",
  generate_application_form: "Generate Application Form",
  generate_tcp_package:      "Generate TCP Package",
  submit_permit:             "Submit Permit",
  generate_invoice:          "Generate Invoice",
  package_generation:        "Package Generation",
  pdf_assembly:              "PDF Assembly",
  permit_submission:         "Permit Submission",
  invoice_generation:        "Invoice Generation",
};

const STATUS_DOT: Record<WorkflowJobStatus, string> = {
  pending:   "bg-amber-400",
  queued:    "bg-amber-400",
  running:   "bg-blue-500 animate-pulse",
  completed: "bg-emerald-500",
  failed:    "bg-red-500",
  cancelled: "bg-slate-400",
};

function JsonBlock({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return <span className="text-muted text-xs">—</span>;
  }
  return (
    <pre className="text-xs font-mono bg-surface rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-words text-ink">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export default async function WorkflowJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/sign-in");

  const { data: job } = await supabase
    .from("workflow_jobs")
    .select(`
      id,
      project_id,
      job_type,
      status,
      triggered_by,
      n8n_execution_id,
      metadata,
      result,
      error,
      error_message,
      created_at,
      updated_at,
      completed_at,
      projects ( job_number, job_name )
    `)
    .eq("id", id)
    .single();

  if (!job) notFound();

  const project = (Array.isArray(job.projects) ? job.projects[0] : job.projects) as { job_number: string; job_name: string } | null;
  const status = job.status as WorkflowJobStatus;
  const canRetry = status !== "running" && status !== "pending";

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title={JOB_TYPE_LABELS[job.job_type as string] ?? job.job_type}
        meta={
          <Link href="/admin/workflows" className="hover:underline">
            ← Workflow Jobs
          </Link>
        }
      />

      {/* Overview */}
      <SectionCard>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4">
          <div>
            <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">Status</p>
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[status] ?? "bg-slate-400"}`} />
              <span className={`text-sm font-medium ${JOB_STATUS_COLOR[status] ?? "text-muted"}`}>
                {JOB_STATUS_LABEL[status] ?? status}
              </span>
            </span>
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">Project</p>
            {project ? (
              <Link
                href={`/admin/projects/${job.project_id}`}
                className="text-sm text-ink hover:underline font-medium"
              >
                {project.job_number}
                {project.job_name && ` — ${project.job_name}`}
              </Link>
            ) : (
              <p className="text-sm text-muted">{job.project_id}</p>
            )}
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">Job ID</p>
            <p className="text-sm text-dim font-mono">{job.id.slice(0, 8)}…</p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">Created</p>
            <p className="text-sm text-dim">{formatDate(job.created_at)}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">Updated</p>
            <p className="text-sm text-dim">{formatDate(job.updated_at)}</p>
          </div>
          {job.completed_at && (
            <div>
              <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">Completed</p>
              <p className="text-sm text-dim">{formatDate(job.completed_at)}</p>
            </div>
          )}
          {job.n8n_execution_id && (
            <div>
              <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">n8n Execution</p>
              <p className="text-sm text-dim font-mono">{job.n8n_execution_id}</p>
            </div>
          )}
        </div>

        {canRetry && (
          <div className="mt-5 pt-5 border-t border-surface">
            <RetryJobButton jobId={job.id} />
          </div>
        )}
      </SectionCard>

      {/* Error */}
      {(job.error || job.error_message) && (
        <SectionCard title="Error">
          {job.error && (
            <p className="text-sm font-medium text-red-600 mb-2">{job.error}</p>
          )}
          {job.error_message && (
            <pre className="text-xs font-mono bg-red-50 text-red-800 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-words">
              {job.error_message}
            </pre>
          )}
        </SectionCard>
      )}

      {/* Inputs (metadata) */}
      <SectionCard
        title="Inputs"
        description="Metadata passed to n8n when the job was enqueued."
      >
        <JsonBlock data={job.metadata} />
      </SectionCard>

      {/* Outputs (result) */}
      <SectionCard
        title="Outputs"
        description="Result written back by n8n after execution."
      >
        <JsonBlock data={job.result} />
      </SectionCard>
    </div>
  );
}
