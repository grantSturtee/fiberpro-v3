import type { Metadata } from "next";
import Link from "next/link";
import { ProjectStatusBadge } from "@/components/ui/StatusBadge";
import type { ProjectStatus } from "@/types/domain";
import { DESIGNER_STATUS_GROUPS } from "@/lib/constants/project";

export const metadata: Metadata = { title: "My Work" };

// Designer dashboard: shows assigned projects grouped by workflow state.
// TODO: Replace with Supabase query — projects where assigned_designer_id = current user.

type AssignedProject = {
  id: string;
  jobNumber: string;
  jobName: string;
  client: string;
  authority: string;
  status: ProjectStatus;
  hasSLD: boolean;
  tcpCount: number;
  dueDate: string;
};

const MY_PROJECTS: AssignedProject[] = [
  { id: "4",  jobNumber: "FP-2026-0018", jobName: "Comcast Aerial TCP — Rt. 46 SB",       client: "Comcast Northeast", authority: "Bergen County",  status: "in_design",               hasSLD: true,  tcpCount: 2, dueDate: "Apr 25, 2026" },
  { id: "5",  jobNumber: "FP-2026-0017", jobName: "Verizon Fiber Splice Vault — CR-512",   client: "Verizon Business",  authority: "Bergen County",  status: "in_design",               hasSLD: true,  tcpCount: 0, dueDate: "Apr 22, 2026" },
  { id: "3",  jobNumber: "FP-2026-0019", jobName: "Comcast TCP Revisions — Rt. 9",         client: "Comcast Northeast", authority: "Monmouth County", status: "revisions_required",      hasSLD: true,  tcpCount: 1, dueDate: "Apr 18, 2026" },
  { id: "6",  jobNumber: "FP-2026-0016", jobName: "Comcast Underground Conduit — Rt. 35",  client: "Comcast Northeast", authority: "Monmouth County", status: "waiting_for_admin_review",hasSLD: true,  tcpCount: 3, dueDate: "Apr 10, 2026" },
];

// Status groups defined in lib/constants/project.ts
const GROUPS = DESIGNER_STATUS_GROUPS;

function ProjectCard({ project }: { project: AssignedProject }) {
  return (
    <Link
      href={`/designer/projects/${project.id}`}
      className="block bg-card rounded-xl p-5 hover:shadow-md transition-all group"
      style={{ boxShadow: "0 1px 12px rgba(43,52,55,0.06)" }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-xs font-mono text-muted">{project.jobNumber}</p>
          <p className="text-sm font-semibold text-ink mt-0.5 group-hover:text-primary transition-colors">
            {project.jobName}
          </p>
        </div>
        <ProjectStatusBadge status={project.status} />
      </div>

      <div className="flex items-center gap-4 text-xs text-muted mb-4">
        <span>{project.client}</span>
        <span className="text-faint">·</span>
        <span>{project.authority}</span>
      </div>

      {/* Readiness indicators */}
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${project.hasSLD ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {project.hasSLD ? "✓" : "!"} SLD
        </span>
        <span className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${project.tcpCount > 0 ? "bg-emerald-50 text-emerald-700" : "bg-surface text-muted"}`}>
          {project.tcpCount > 0 ? `${project.tcpCount} TCP` : "No TCP yet"}
        </span>
        <span className="ml-auto text-xs text-muted">Due {project.dueDate}</span>
      </div>
    </Link>
  );
}

export default function DesignerDashboardPage() {
  return (
    <div className="p-8 space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-ink">My Work</h1>
        {/* TODO: Show designer's name from session */}
        <p className="mt-0.5 text-sm text-muted">Your assigned projects</p>
      </div>

      {GROUPS.map((group) => {
        const projects = MY_PROJECTS.filter((p) =>
          group.statuses.includes(p.status)
        );
        if (projects.length === 0) return null;
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
              {projects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
