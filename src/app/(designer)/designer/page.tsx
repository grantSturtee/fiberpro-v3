import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ProjectStatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import { getDesignerProjectList } from "@/lib/queries/projects";
import { formatDate } from "@/lib/utils/format";
import { isUpdateStale } from "@/lib/utils/projectUpdateStatus";
import { getUpdateCadenceDays } from "@/lib/queries/appSettings";
import type { ProjectListRow } from "@/lib/queries/projects";
import type { UnifiedProjectStatus } from "@/types/domain";

export const metadata: Metadata = { title: "My Work" };

// ── Designer dashboard groups (unified statuses) ──────────────────────────────
// On your desk: pending_review  (admin returned project for revision/review)
// In Design:    in_production   (active design work)
// Submitted:    billing/submission lifecycle (collapsible)
// Closed:       terminal states (collapsible)

type DesignerGroup = {
  key: string;
  label: string;
  statuses: UnifiedProjectStatus[];
  urgent?: boolean;
  collapsible?: boolean;
};

const DESIGNER_GROUPS: ReadonlyArray<DesignerGroup> = [
  { key: "desk",      label: "On your desk", statuses: ["pending_review"], urgent: true },
  { key: "design",    label: "In Design",    statuses: ["in_production"] },
  { key: "submitted", label: "Submitted",    statuses: ["sub_bill_now", "permit_billed", "invoice_sent", "billing_ready"], collapsible: true },
  { key: "closed",    label: "Closed",       statuses: ["paid_complete", "cancelled"], collapsible: true },
];

const CLOSED_STATUSES = new Set<UnifiedProjectStatus>(["paid_complete", "cancelled"]);
const DESK_AND_DESIGN_STATUSES = new Set<UnifiedProjectStatus>(["pending_review", "in_production"]);

// ── Row card — "On your desk" and "In Design" ─────────────────────────────────
function ProjectRowCard({
  project,
  sldCount,
  tcpCount,
  needsUpdate,
}: {
  project: ProjectListRow;
  sldCount: number;
  tcpCount: number;
  needsUpdate: boolean;
}) {
  const authorityDisplay = project.county
    ? `${project.county} County`
    : project.city ?? project.authority_type ?? "—";

  // "Revisions" chip surfaces on pending_review (admin-returned).
  const showRevisions = project.unified_status === "pending_review";
  // "No SLD" surfaces during active design only.
  const showNoSld = project.unified_status === "in_production" && sldCount === 0;

  return (
    <Link
      href={`/designer/projects/${project.id}`}
      className={[
        "flex items-center gap-4 bg-card rounded-lg px-4 py-3 hover:shadow-sm transition-all group",
        needsUpdate ? "border-l-[3px] border-amber-400" : "border-l-[3px] border-transparent",
      ].join(" ")}
      style={{ boxShadow: "0 1px 4px rgba(43,52,55,0.06)" }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 min-w-0">
          <p className="text-[11px] font-mono text-faint flex-shrink-0">{project.job_number}</p>
          <p className="text-sm font-semibold text-ink truncate group-hover:text-primary transition-colors">
            {project.job_name}
          </p>
        </div>
        <p className="mt-0.5 text-xs text-muted truncate">
          {project.company_name ?? "—"} · {authorityDisplay}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {showRevisions && (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-50 text-red-700">
            Revisions
          </span>
        )}
        {needsUpdate && (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-700">
            Needs update
          </span>
        )}
        {showNoSld && (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-50 text-red-400">
            No SLD
          </span>
        )}
        {tcpCount > 0 && (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-surface text-muted">
            {tcpCount} TCP
          </span>
        )}
        {project.requested_approval_date && (
          <span className="text-xs text-muted">
            Due {formatDate(project.requested_approval_date)}
          </span>
        )}
      </div>
    </Link>
  );
}

// ── Compact row — "Submitted" and "Closed" ────────────────────────────────────
function ProjectCompactRow({ project }: { project: ProjectListRow }) {
  const authorityDisplay = project.county
    ? `${project.county} County`
    : project.city ?? project.authority_type ?? "—";

  return (
    <div className="flex items-center gap-3 py-2 px-1">
      <Link
        href={`/designer/projects/${project.id}`}
        className="text-sm text-ink hover:text-primary transition-colors font-medium truncate flex-1 min-w-0"
      >
        {project.job_name}
      </Link>
      <div className="flex items-center gap-2 flex-shrink-0">
        <ProjectStatusBadge status={project.unified_status} />
        <span className="text-xs text-faint hidden sm:inline w-28 truncate text-right">
          {authorityDisplay}
        </span>
        <span className="text-xs text-faint w-20 text-right">
          {formatDate(project.updated_at)}
        </span>
      </div>
    </div>
  );
}

// ── Sorting ───────────────────────────────────────────────────────────────────
// Stale projects float first within each status bucket. updated_at DESC
// within the same stale/non-stale bucket is preserved from query ordering.
function sortActiveGroupProjects(
  projects: ProjectListRow[],
  staleIds: Set<string>,
): ProjectListRow[] {
  return [...projects].sort((a, b) => {
    const sa = staleIds.has(a.id) ? 0 : 1;
    const sb = staleIds.has(b.id) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    const ad = a.updated_at ?? a.created_at;
    const bd = b.updated_at ?? b.created_at;
    return bd.localeCompare(ad);
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DesignerDashboardPage() {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/sign-in");

  const designerId = userData.user.id;

  const projects = await getDesignerProjectList(supabase, designerId);

  const projectIds = projects.map((p) => p.id);

  type FileCountRow = { project_id: string; file_category: string };
  let fileCounts: FileCountRow[] = [];
  let latestUpdates: { project_id: string; created_at: string }[] = [];

  const [staleDays] = await Promise.all([
    getUpdateCadenceDays(supabase),
    (async () => {
      if (projectIds.length === 0) return;
      const [{ data: fcData }, { data: updateData }] = await Promise.all([
        supabase
          .from("project_files")
          .select("project_id, file_category")
          .in("project_id", projectIds)
          .in("file_category", ["sld_sheet", "tcp_pdf"]),
        supabase
          .from("project_updates")
          .select("project_id, created_at")
          .in("project_id", projectIds)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      fileCounts = (fcData ?? []) as FileCountRow[];
      latestUpdates = (updateData ?? []) as { project_id: string; created_at: string }[];
    })(),
  ]);

  const latestUpdateMap = new Map<string, string>();
  for (const row of latestUpdates) {
    if (!latestUpdateMap.has(row.project_id)) {
      latestUpdateMap.set(row.project_id, row.created_at);
    }
  }

  // Stale = active projects (desk + in-design) with no update or last update ≥ cadence.
  const staleProjectIds = new Set(
    projects
      .filter((p) => DESK_AND_DESIGN_STATUSES.has(p.unified_status))
      .filter((p) => isUpdateStale(latestUpdateMap.get(p.id) ?? null, staleDays))
      .map((p) => p.id)
  );

  const sldByProject: Record<string, number> = {};
  const tcpByProject: Record<string, number> = {};
  for (const f of fileCounts) {
    if (f.file_category === "sld_sheet") {
      sldByProject[f.project_id] = (sldByProject[f.project_id] ?? 0) + 1;
    } else if (f.file_category === "tcp_pdf") {
      tcpByProject[f.project_id] = (tcpByProject[f.project_id] ?? 0) + 1;
    }
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("id", designerId)
    .single();

  const displayName = profile?.display_name;

  // Active count = all projects not in a terminal state.
  const activeCount = projects.filter((p) => !CLOSED_STATUSES.has(p.unified_status)).length;

  return (
    <div className="p-8 space-y-8 max-w-3xl mx-auto">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-ink">My Work</h1>
        {displayName && (
          <p className="mt-0.5 text-sm text-muted">
            {displayName} · {activeCount} active
          </p>
        )}
        {staleProjectIds.size > 0 && (
          <div
            className="mt-3 flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-amber-700"
            style={{ background: "#fffbeb", border: "1px solid #fcd34d" }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="flex-shrink-0">
              <path d="M8 2L14 13H2L8 2z" />
              <line x1="8" y1="7" x2="8" y2="10" />
              <circle cx="8" cy="12" r="0.5" fill="currentColor" />
            </svg>
            <span>
              {staleProjectIds.size === 1
                ? "1 project needs a status update."
                : `${staleProjectIds.size} projects need a status update.`}
            </span>
          </div>
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
          {DESIGNER_GROUPS.map((group) => {
            let groupProjects = projects.filter((p) =>
              group.statuses.includes(p.unified_status)
            );
            if (groupProjects.length === 0) return null;

            // Active groups (desk + design) get stale-first sorting.
            if (group.key === "desk" || group.key === "design") {
              groupProjects = sortActiveGroupProjects(groupProjects, staleProjectIds);
            }

            const useCompact = group.collapsible === true;

            const rows = useCompact ? (
              <div className="divide-y" style={{ borderColor: "#e9eef1" }}>
                {groupProjects.map((p) => (
                  <ProjectCompactRow key={p.id} project={p} />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {groupProjects.map((p) => (
                  <ProjectRowCard
                    key={p.id}
                    project={p}
                    sldCount={sldByProject[p.id] ?? 0}
                    tcpCount={tcpByProject[p.id] ?? 0}
                    needsUpdate={staleProjectIds.has(p.id)}
                  />
                ))}
              </div>
            );

            if (group.collapsible) {
              return (
                <details key={group.key} className="group/details">
                  <summary className="list-none cursor-pointer select-none rounded-lg hover:bg-wash transition-colors -mx-2 px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <svg
                        width="12" height="12" viewBox="0 0 12 12" fill="none"
                        className="text-faint transition-transform group-open/details:rotate-90 flex-shrink-0"
                        aria-hidden
                      >
                        <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
                        {group.label}
                      </h2>
                      <span className="text-[10px] text-faint">{groupProjects.length}</span>
                    </div>
                  </summary>
                  <div className="mt-3">{rows}</div>
                </details>
              );
            }

            return (
              <section key={group.key}>
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
                {rows}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
