import type { Metadata } from "next";
import Link from "next/link";
import { ProjectStatusBadge } from "@/components/ui/StatusBadge";
import type { ProjectStatus } from "@/types/domain";

export const metadata: Metadata = { title: "Dashboard" };

// ── Placeholder data ─────────────────────────────────────────────────────────
// TODO: Replace with Supabase queries — projects needing action, active work queue.

type QueueItem = {
  id: string;
  jobNumber: string;
  jobName: string;
  client: string;
  authority: string;
  county: string;
  status: ProjectStatus;
  designer?: string;
  updatedAt: string;
};

const needsAttention: QueueItem[] = [
  {
    id: "1",
    jobNumber: "FP-2026-0021",
    jobName: "Comcast Aerial TCP — Rt. 46 NB",
    client: "Comcast Northeast",
    authority: "Bergen County",
    county: "Bergen",
    status: "intake_review",
    updatedAt: "2h ago",
  },
  {
    id: "2",
    jobNumber: "FP-2026-0020",
    jobName: "Lightpath Cable Crossing — I-287",
    client: "Lightpath LLC",
    authority: "NJDOT",
    county: "Morris",
    status: "waiting_on_client",
    updatedAt: "Yesterday",
  },
  {
    id: "3",
    jobNumber: "FP-2026-0019",
    jobName: "Comcast TCP Revisions — Rt. 9",
    client: "Comcast Northeast",
    authority: "Monmouth County",
    county: "Monmouth",
    status: "waiting_for_admin_review",
    designer: "Marcus Webb",
    updatedAt: "4h ago",
  },
];

const activeWork: QueueItem[] = [
  {
    id: "4",
    jobNumber: "FP-2026-0018",
    jobName: "Comcast Aerial TCP — Rt. 46 SB",
    client: "Comcast Northeast",
    authority: "Bergen County",
    county: "Bergen",
    status: "in_design",
    designer: "Marcus Webb",
    updatedAt: "Today",
  },
  {
    id: "5",
    jobNumber: "FP-2026-0017",
    jobName: "Verizon Fiber Splice Vault — CR-512",
    client: "Verizon Business",
    authority: "Bergen County",
    county: "Bergen",
    status: "in_design",
    designer: "Aisha Kowalski",
    updatedAt: "Today",
  },
  {
    id: "6",
    jobNumber: "FP-2026-0016",
    jobName: "Comcast Underground Conduit — Rt. 35",
    client: "Comcast Northeast",
    authority: "Monmouth County",
    county: "Monmouth",
    status: "approved",
    designer: "Marcus Webb",
    updatedAt: "2d ago",
  },
  {
    id: "7",
    jobNumber: "FP-2026-0015",
    jobName: "Lightpath Aerial — Garden State Pkwy",
    client: "Lightpath LLC",
    authority: "NJDOT",
    county: "Essex",
    status: "ready_for_submission",
    updatedAt: "3d ago",
  },
];

// ── Sub-components ───────────────────────────────────────────────────────────

function QueueRow({ item }: { item: QueueItem }) {
  return (
    <Link
      href={`/admin/projects/${item.id}`}
      className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-surface transition-colors group"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono text-muted flex-shrink-0">{item.jobNumber}</span>
          <span className="text-sm font-medium text-ink truncate group-hover:text-primary transition-colors">
            {item.jobName}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-muted">{item.client}</span>
          <span className="text-xs text-faint">·</span>
          <span className="text-xs text-muted">{item.authority}</span>
          {item.designer && (
            <>
              <span className="text-xs text-faint">·</span>
              <span className="text-xs text-muted">{item.designer}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <ProjectStatusBadge status={item.status} />
        <span className="text-xs text-faint hidden sm:block">{item.updatedAt}</span>
      </div>
    </Link>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  return (
    <div className="p-8 space-y-8 max-w-5xl">

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
            {/* TODO: Replace with real count from DB */}
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
            {needsAttention.map((item) => (
              <QueueRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      </section>

      {/* Active Work */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
            Active Work
            {/* TODO: Replace with real count from DB */}
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
            {activeWork.map((item) => (
              <QueueRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      </section>

      {/* Quick links for future features */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "TCD Library", href: "/admin/settings#tcd-library", note: "Manage TCD sheets" },
          { label: "Cover Templates", href: "/admin/settings#cover-templates", note: "Package templates" },
          { label: "Pricing Rules", href: "/admin/settings#pricing", note: "Client billing rates" },
          { label: "Workflow Jobs", href: "/admin/settings#jobs", note: "n8n job status" },
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
