import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { getAdminProjectList } from "@/lib/queries/projects";
import { AdminProjectsTable } from "@/components/admin/AdminProjectsTable";

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
    <div className="p-8 space-y-6 max-w-6xl mx-auto">
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

      {/* Projects table — client component handles row selection + bulk actions */}
      <AdminProjectsTable projects={projects} />
    </div>
  );
}
