import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminProjectList } from "@/lib/queries/projects";
import { AdminProjectsTable } from "@/components/admin/AdminProjectsTable";

export const metadata: Metadata = { title: "Projects" };

// ── Status filter tabs ────────────────────────────────────────────────────────
// Mapped to unified_status values.

const STATUS_TABS = [
  { key: "all",         label: "All" },
  { key: "attention",   label: "Needs Attention" },
  { key: "production",  label: "In Production" },
  { key: "submission",  label: "Submission" },
  { key: "closed",      label: "Closed" },
] as const;

const TAB_STATUSES: Record<string, string[]> = {
  attention:  ["new_project", "pending_review", "sub_bill_now"],
  production: ["in_production", "pending_review"],
  submission: ["sub_bill_now", "permit_billed"],
  closed:     ["paid_complete", "cancelled"],
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
      : allProjects.filter((p) => TAB_STATUSES[tab].includes(p.unified_status));

  return (
    <div className="p-8 space-y-6">

      {/* Page header — title + primary action */}
      <div className="flex items-center justify-between">
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "#111827",
            textTransform: "uppercase",
            lineHeight: 1.1,
          }}
        >
          Projects
        </h1>
        <Link
          href="/admin/projects/new"
          className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-colors hover:bg-[#1251A3]"
          style={{ background: "#1565C0" }}
        >
          + New Project
        </Link>
      </div>

      {/* Status tab pill cluster */}
      <div className="inline-flex items-center gap-1 bg-[#F3F4F6] rounded-lg p-1 w-fit">
        {STATUS_TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={`/admin/projects?tab=${t.key}`}
              className={[
                "px-3 py-1.5 rounded-md text-[13px] transition-colors",
                active
                  ? "bg-[#1565C0] text-white font-semibold"
                  : "text-[#6B7280] font-medium hover:bg-white",
              ].join(" ")}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Projects table */}
      <AdminProjectsTable projects={projects} />
    </div>
  );
}
