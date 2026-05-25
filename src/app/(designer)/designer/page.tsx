import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
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
        "flex items-center gap-4 bg-white rounded-lg px-4 py-3 group",
        "border border-[#E5E7EB] hover:border-[#1565C0] transition-colors",
        needsUpdate
          ? "border-l-[3px] border-l-[#D97706]"
          : "border-l-[3px] border-l-transparent",
      ].join(" ")}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 min-w-0">
          <p className="text-[11px] font-mono text-[#9CA3AF] flex-shrink-0">
            {project.job_number}
          </p>
          <p className="text-[14px] font-semibold text-[#111827] truncate group-hover:text-[#1565C0] transition-colors">
            {project.job_name}
          </p>
        </div>
        <p className="mt-0.5 text-[12px] text-[#6B7280] truncate">
          {project.company_name ?? "—"} · {authorityDisplay}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {showRevisions && (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-[#FEF2F2] text-[#DC2626]">
            Revisions
          </span>
        )}
        {needsUpdate && (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-[#FFFBEB] text-[#D97706]">
            Needs update
          </span>
        )}
        {showNoSld && (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-[#FEF2F2] text-[#DC2626]">
            No SLD
          </span>
        )}
        {tcpCount > 0 && (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-[#F3F4F6] text-[#6B7280]">
            {tcpCount} TCP
          </span>
        )}
        {project.requested_approval_date && (
          <span className="text-[12px] text-[#6B7280]">
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
        className="text-[14px] font-medium text-[#111827] hover:text-[#1565C0] transition-colors truncate flex-1 min-w-0"
      >
        {project.job_name}
      </Link>
      <div className="flex items-center gap-2 flex-shrink-0">
        <ProjectStatusBadge status={project.unified_status} />
        <span className="hidden sm:inline w-28 truncate text-right text-[12px] text-[#9CA3AF]">
          {authorityDisplay}
        </span>
        <span className="w-20 text-right text-[12px] text-[#9CA3AF]">
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
    <div className="p-8 space-y-8">

      {/* Header + optional stale banner — grouped so the banner sits close to the title */}
      <div>
        <PageHeader
          title="My Work"
          size="sm"
          subtitle={displayName ? `${displayName} · ${activeCount} active` : undefined}
        />
        {staleProjectIds.size > 0 && (
          <div
            className="mt-3 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px]"
            style={{
              background: "#FFFBEB",
              border: "1px solid #FCD34D",
              color: "#92400E",
            }}
          >
            <AlertTriangle size={13} strokeWidth={1.5} color="#D97706" className="flex-shrink-0" />
            <span>
              {staleProjectIds.size === 1
                ? "1 project needs a status update."
                : `${staleProjectIds.size} projects need a status update.`}
            </span>
          </div>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="bg-white border border-[#E5E7EB] rounded-lg px-6 py-16 text-center">
          <p className="text-[14px] text-[#6B7280]">No projects assigned yet.</p>
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
              <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden divide-y divide-[#F3F4F6]">
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
                  <summary className="list-none cursor-pointer select-none rounded-lg hover:bg-[#F9FAFB] transition-colors -mx-2 px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <ChevronRight
                        size={12}
                        strokeWidth={1.5}
                        className="text-[#9CA3AF] transition-transform group-open/details:rotate-90 flex-shrink-0"
                      />
                      <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#374151]">
                        {group.label}
                      </h2>
                      <span className="text-[10px] text-[#9CA3AF]">{groupProjects.length}</span>
                    </div>
                  </summary>
                  <div className="mt-3">{rows}</div>
                </details>
              );
            }

            return (
              <section key={group.key}>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#374151]">
                    {group.label}
                  </h2>
                  {group.urgent && (
                    <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-[#FEE2E2] text-[#DC2626]">
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
