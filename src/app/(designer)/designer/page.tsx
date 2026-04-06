import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ProjectStatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import { getDesignerProjectList } from "@/lib/queries/projects";
import { DESIGNER_STATUS_GROUPS } from "@/lib/constants/project";
import { formatDate } from "@/lib/utils/format";
import type { ProjectListRow } from "@/lib/queries/projects";

export const metadata: Metadata = { title: "My Work" };

// ── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  sldCount,
  tcpCount,
}: {
  project: ProjectListRow;
  sldCount: number;
  tcpCount: number;
}) {
  const authorityDisplay = project.county
    ? `${project.county} County`
    : project.city ?? project.authority_type ?? "—";

  return (
    <Link
      href={`/designer/projects/${project.id}`}
      className="block bg-card rounded-xl p-5 hover:shadow-md transition-all group"
      style={{ boxShadow: "0 1px 12px rgba(43,52,55,0.06)" }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-xs font-mono text-muted">{project.job_number}</p>
          <p className="text-sm font-semibold text-ink mt-0.5 group-hover:text-primary transition-colors">
            {project.job_name}
          </p>
        </div>
        <ProjectStatusBadge status={project.status} />
      </div>

      <div className="flex items-center gap-4 text-xs text-muted mb-4">
        <span>{project.company_name ?? "—"}</span>
        <span className="text-faint">·</span>
        <span>{authorityDisplay}</span>
      </div>

      {/* Readiness indicators */}
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${
            sldCount > 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {sldCount > 0 ? "✓" : "!"} SLD
        </span>
        <span
          className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${
            tcpCount > 0 ? "bg-emerald-50 text-emerald-700" : "bg-surface text-muted"
          }`}
        >
          {tcpCount > 0 ? `${tcpCount} TCP` : "No TCP yet"}
        </span>
        {project.requested_approval_date && (
          <span className="ml-auto text-xs text-muted">
            Due {formatDate(project.requested_approval_date)}
          </span>
        )}
      </div>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DesignerDashboardPage() {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/sign-in");

  const designerId = userData.user.id;

  // Fetch assigned projects
  const projects = await getDesignerProjectList(supabase, designerId);

  // Fetch file counts for each project in one query
  const projectIds = projects.map((p) => p.id);

  type FileCountRow = { project_id: string; file_category: string };
  let fileCounts: FileCountRow[] = [];

  if (projectIds.length > 0) {
    const { data: fcData } = await supabase
      .from("project_files")
      .select("project_id, file_category")
      .in("project_id", projectIds)
      .in("file_category", ["sld_sheet", "tcp_pdf"]);
    fileCounts = (fcData ?? []) as FileCountRow[];
  }

  const sldByProject: Record<string, number> = {};
  const tcpByProject: Record<string, number> = {};
  for (const f of fileCounts) {
    if (f.file_category === "sld_sheet") {
      sldByProject[f.project_id] = (sldByProject[f.project_id] ?? 0) + 1;
    } else if (f.file_category === "tcp_pdf") {
      tcpByProject[f.project_id] = (tcpByProject[f.project_id] ?? 0) + 1;
    }
  }

  // Fetch designer display name
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("id", designerId)
    .single();

  const displayName = profile?.display_name;

  const GROUPS = DESIGNER_STATUS_GROUPS;

  return (
    <div className="p-8 space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-ink">My Work</h1>
        {displayName && (
          <p className="mt-0.5 text-sm text-muted">
            {displayName} · {projects.length} active project{projects.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {projects.length === 0 ? (
        <div
          className="bg-card rounded-xl px-6 py-16 text-center"
          style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
        >
          <p className="text-sm text-muted">No projects assigned yet.</p>
        </div>
      ) : (
        <>
          {GROUPS.map((group) => {
            const groupProjects = projects.filter((p) =>
              group.statuses.includes(p.status)
            );
            if (groupProjects.length === 0) return null;

            return (
              <section key={group.label}>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
                    {group.label}
                  </h2>
                  {group.urgent && (
                    <span className="text-[10px] font-bold text-danger bg-danger/10 rounded-full px-2 py-0.5">
                      Action needed
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {groupProjects.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      sldCount={sldByProject[p.id] ?? 0}
                      tcpCount={tcpByProject[p.id] ?? 0}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
