import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ProjectStatusBadge } from "@/components/ui/StatusBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { getAdminProjectList } from "@/lib/queries/projects";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Projects" };

// ── Status filter tabs ────────────────────────────────────────────────────────
// Grouped by operational meaning; filtering wired to searchParams below.

const STATUS_TABS = [
  { key: "all",         label: "All" },
  { key: "attention",   label: "Needs Attention" },
  { key: "production",  label: "In Production" },
  { key: "submission",  label: "Submission" },
  { key: "closed",      label: "Closed" },
] as const;

const TAB_STATUSES: Record<string, string[]> = {
  attention:  ["intake_review", "waiting_on_client", "waiting_for_admin_review", "revisions_required", "authority_action_needed"],
  production: ["ready_for_assignment", "assigned", "in_design", "approved", "package_generating"],
  submission: ["ready_for_submission", "submitted", "waiting_on_authority"],
  closed:     ["permit_received", "closed", "cancelled"],
};

export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/sign-in");

  const { tab = "all" } = await searchParams;

  const allProjects = await getAdminProjectList(supabase);

  const projects =
    tab === "all" || !TAB_STATUSES[tab]
      ? allProjects
      : allProjects.filter((p) => TAB_STATUSES[tab].includes(p.status));

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <PageHeader
        title="Projects"
        subtitle={`${projects.length} project${projects.length !== 1 ? "s" : ""}`}
        action={
          <Link
            href="/admin/projects/new"
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
          >
            + New Project
          </Link>
        }
      />

      {/* Status tabs */}
      <div
        className="flex items-center gap-1 bg-card rounded-xl px-2 py-1.5 w-fit"
        style={{ boxShadow: "0 1px 8px rgba(43,52,55,0.05)" }}
      >
        {STATUS_TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/projects?tab=${t.key}`}
            className={`
              px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors
              ${t.key === tab ? "bg-wash text-ink" : "text-muted hover:text-ink hover:bg-surface"}
            `}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Projects table */}
      {projects.length === 0 ? (
        <div
          className="bg-card rounded-xl px-6 py-16 text-center"
          style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
        >
          <p className="text-sm text-muted">No projects in this category.</p>
        </div>
      ) : (
        <div
          className="bg-card rounded-xl overflow-hidden"
          style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
        >
          {/* Table header */}
          <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr] gap-4 px-5 py-3 bg-canvas">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Project</span>
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Client · Authority</span>
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Status</span>
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider hidden lg:block">Designer</span>
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider hidden lg:block">Submitted</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-surface">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/admin/projects/${p.id}`}
                className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr] gap-4 px-5 py-3.5 items-center hover:bg-surface transition-colors group"
              >
                {/* Job info */}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate group-hover:text-primary transition-colors">
                    {p.job_name}
                  </p>
                  <p className="text-xs text-muted font-mono mt-0.5">{p.job_number}</p>
                </div>

                {/* Client · Authority */}
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">{p.company_name ?? "—"}</p>
                  <p className="text-xs text-muted truncate">
                    {p.county ? `${p.county} County` : p.authority_type ?? "—"}
                  </p>
                </div>

                {/* Status */}
                <div>
                  <ProjectStatusBadge status={p.status} />
                </div>

                {/* Designer */}
                <div className="hidden lg:block">
                  <span className="text-sm text-dim">
                    {p.assigned_designer_name ?? <span className="text-faint">—</span>}
                  </span>
                </div>

                {/* Date */}
                <div className="hidden lg:block">
                  <span className="text-xs text-muted">{formatDate(p.created_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
