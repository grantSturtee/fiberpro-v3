import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAdminProjectList, type ProjectListRow } from "@/lib/queries/projects";
import { ADMIN_STATUS_GROUPS } from "@/lib/constants/project";
import { ProjectStatusBadge } from "@/components/ui/StatusBadge";

export const metadata: Metadata = { title: "Dashboard" };

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffHours = (now.getTime() - date.getTime()) / 3_600_000;
  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
  if (diffHours < 48) return "Yesterday";
  if (diffHours < 168) return `${Math.floor(diffHours / 24)}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function QueueRow({ item }: { item: ProjectListRow }) {
  return (
    <Link
      href={`/admin/projects/${item.id}`}
      className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-surface transition-colors group"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono text-muted flex-shrink-0">{item.job_number}</span>
          <span className="text-sm font-medium text-ink truncate group-hover:text-primary transition-colors">
            {item.job_name}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {item.company_name && (
            <span className="text-xs text-muted">{item.company_name}</span>
          )}
          {item.authority_type && (
            <>
              <span className="text-xs text-faint">·</span>
              <span className="text-xs text-muted">{item.authority_type}</span>
            </>
          )}
          {item.assigned_designer_name && (
            <>
              <span className="text-xs text-faint">·</span>
              <span className="text-xs text-muted">{item.assigned_designer_name}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <ProjectStatusBadge status={item.status} />
        <span className="text-xs text-faint hidden sm:block">
          {formatDate(item.updated_at ?? item.created_at)}
        </span>
      </div>
    </Link>
  );
}

function EmptyQueue({ label }: { label: string }) {
  return (
    <div className="px-4 py-6 text-center text-sm text-muted">
      No {label.toLowerCase()} projects
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const allProjects = await getAdminProjectList(supabase);

  const attentionStatuses = new Set(ADMIN_STATUS_GROUPS[0].statuses);
  const activeStatuses = new Set(ADMIN_STATUS_GROUPS[1].statuses);

  const needsAttention = allProjects
    .filter((p) => attentionStatuses.has(p.status))
    .slice(0, 5);
  const activeWork = allProjects
    .filter((p) => activeStatuses.has(p.status))
    .slice(0, 5);

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-ink">Operations</h1>
        <p className="mt-0.5 text-sm text-muted">Active workflow queue</p>
      </div>

      {/* Attention Queue */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
            Needs Attention
            <span className="ml-2 text-danger bg-danger/10 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
              {needsAttention.length}
            </span>
          </h2>
          <Link href="/admin/projects?filter=attention" className="text-xs text-primary hover:underline">
            View all
          </Link>
        </div>
        <div
          className="bg-card rounded-xl overflow-hidden"
          style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
        >
          <div className="divide-y divide-surface">
            {needsAttention.length === 0
              ? <EmptyQueue label="attention" />
              : needsAttention.map((item) => <QueueRow key={item.id} item={item} />)
            }
          </div>
        </div>
      </section>

      {/* Active Work */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
            Active Work
            <span className="ml-2 text-primary bg-primary-soft rounded-full px-1.5 py-0.5 text-[10px] font-bold">
              {activeWork.length}
            </span>
          </h2>
          <Link href="/admin/projects" className="text-xs text-primary hover:underline">
            View all projects
          </Link>
        </div>
        <div
          className="bg-card rounded-xl overflow-hidden"
          style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
        >
          <div className="divide-y divide-surface">
            {activeWork.length === 0
              ? <EmptyQueue label="active" />
              : activeWork.map((item) => <QueueRow key={item.id} item={item} />)
            }
          </div>
        </div>
      </section>

      {/* Quick links */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "TCD Library",       href: "/admin/settings#tcd-library",    note: "Manage TCD sheets" },
          { label: "Cover Templates",   href: "/admin/settings#cover-templates", note: "Package templates" },
          { label: "Pricing Rules",     href: "/admin/settings#pricing",         note: "Client billing rates" },
          { label: "All Projects",      href: "/admin/projects",                 note: "Full project list" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="bg-card rounded-xl p-4 hover:bg-surface transition-colors group"
            style={{ boxShadow: "0 1px 8px rgba(43,52,55,0.05)" }}
          >
            <p className="text-sm font-medium text-ink group-hover:text-primary transition-colors">
              {link.label}
            </p>
            <p className="text-xs text-muted mt-0.5">{link.note}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
