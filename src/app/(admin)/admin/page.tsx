import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAdminProjectList, type ProjectListRow } from "@/lib/queries/projects";
import { ProjectStatusBadge, BillingStatusBadge } from "@/components/ui/StatusBadge";
import {
  computeSubmissionAlert,
  type SubmissionAlert,
  ALERT_SEVERITY_DOT,
  ALERT_SEVERITY_TEXT,
} from "@/lib/alerts/submissionAlerts";
import type { BillingStatus } from "@/types/domain";

export const metadata: Metadata = { title: "Dashboard" };

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const diffHours = (Date.now() - date.getTime()) / 3_600_000;
  if (diffHours < 1)   return "Just now";
  if (diffHours < 24)  return `${Math.floor(diffHours)}h ago`;
  if (diffHours < 48)  return "Yesterday";
  if (diffHours < 168) return `${Math.floor(diffHours / 24)}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const BILLING_ACTION_LABEL: Partial<Record<BillingStatus, string>> = {
  ready_to_invoice: "Ready to Invoice",
  draft_invoice:    "Draft — Send Now",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  count,
  countColor = "text-primary bg-primary-soft",
  href,
  hrefLabel = "View all",
}: {
  title: string;
  count?: number;
  countColor?: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
        {title}
        {count !== undefined && (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${countColor}`}>
            {count}
          </span>
        )}
      </h2>
      {href && (
        <Link href={href} className="text-xs text-primary hover:underline">
          {hrefLabel}
        </Link>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="bg-card rounded-xl overflow-hidden divide-y divide-surface"
      style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
    >
      {children}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="px-4 py-6 text-center text-sm text-muted">{label}</div>
  );
}

// A project row with full context: company, authority, designer, status badge + age.
function QueueRow({ item }: { item: ProjectListRow }) {
  return (
    <Link
      href={`/admin/projects/${item.id}`}
      className="flex items-center gap-4 px-4 py-3 hover:bg-surface transition-colors group"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono text-faint flex-shrink-0">{item.job_number}</span>
          <span className="text-sm font-medium text-ink truncate group-hover:text-primary transition-colors">
            {item.job_name}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {item.company_name && (
            <span className="text-xs text-muted">{item.company_name}</span>
          )}
          {item.assigned_designer_name && (
            <>
              <span className="text-xs text-faint">·</span>
              <span className="text-xs text-muted">{item.assigned_designer_name}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <ProjectStatusBadge status={item.unified_status} />
        <span className="text-xs text-faint hidden sm:block w-16 text-right">
          {timeAgo(item.updated_at ?? item.created_at)}
        </span>
      </div>
    </Link>
  );
}

// A pipeline row for submission-state projects; shows alert badge inline.
function PipelineRow({
  item,
  alert,
}: {
  item: ProjectListRow;
  alert: SubmissionAlert | null;
}) {
  return (
    <Link
      href={`/admin/projects/${item.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors group"
    >
      {alert ? (
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${ALERT_SEVERITY_DOT[alert.severity]}`}
        />
      ) : (
        <span className="w-2 h-2 rounded-full flex-shrink-0 bg-surface border border-muted/30" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          {alert && (
            <span className={`text-xs font-semibold flex-shrink-0 ${ALERT_SEVERITY_TEXT[alert.severity]}`}>
              {alert.label}
            </span>
          )}
          <span className="text-sm text-ink truncate group-hover:text-primary transition-colors">
            {item.job_name}
          </span>
          <span className="text-xs font-mono text-faint flex-shrink-0 hidden sm:block">
            {item.job_number}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {item.company_name && (
            <span className="text-xs text-muted">{item.company_name}</span>
          )}
          {alert ? (
            <>
              <span className="text-xs text-faint">·</span>
              <span className="text-xs text-muted">{alert.detail}</span>
            </>
          ) : (
            <ProjectStatusBadge status={item.unified_status} />
          )}
        </div>
      </div>
      <span className="text-xs text-faint flex-shrink-0 hidden sm:block w-16 text-right">
        {timeAgo(item.updated_at ?? item.created_at)}
      </span>
    </Link>
  );
}

// A billing queue row: links to the billing section anchor on the project page.
function BillingRow({ item }: { item: ProjectListRow }) {
  const actionLabel = BILLING_ACTION_LABEL[item.billing_status] ?? item.billing_status;
  return (
    <Link
      href={`/admin/projects/${item.id}#section-billing`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors group"
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0 bg-emerald-400" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-xs font-semibold flex-shrink-0 ${
            item.billing_status === "draft_invoice" ? "text-blue-700" : "text-emerald-700"
          }`}>
            {actionLabel}
          </span>
          <span className="text-sm text-ink truncate group-hover:text-primary transition-colors">
            {item.job_name}
          </span>
          <span className="text-xs font-mono text-faint flex-shrink-0 hidden sm:block">
            {item.job_number}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {item.company_name && (
            <span className="text-xs text-muted">{item.company_name}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <BillingStatusBadge status={item.billing_status} />
        <span className="text-xs text-faint hidden sm:block w-16 text-right">
          {timeAgo(item.updated_at ?? item.created_at)}
        </span>
      </div>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const allProjects = await getAdminProjectList(supabase);

  // ── Section 1: Action Required ────────────────────────────────────────────
  // Statuses where admin must take an explicit action before work can progress.
  const ACTION_STATUSES = new Set([
    "intake_review",
    "waiting_on_client",
    "waiting_for_admin_review",
    "revisions_required",
    "authority_action_needed",
  ]);
  const actionRequired = allProjects.filter((p) => ACTION_STATUSES.has(p.status));

  // ── Section 2: Billing Queue ──────────────────────────────────────────────
  // Projects where admin must act on the invoice lifecycle.
  // ready_to_invoice → create draft; draft_invoice → send to client.
  const BILLING_ACTION_STATUSES = new Set<BillingStatus>(["ready_to_invoice", "draft_invoice"]);
  const billingQueue = allProjects.filter((p) =>
    BILLING_ACTION_STATUSES.has(p.billing_status)
  );
  // Order: draft_invoice first (more urgent — invoice exists but unsent), then ready_to_invoice.
  billingQueue.sort((a, b) => {
    const order: Partial<Record<BillingStatus, number>> = { draft_invoice: 0, ready_to_invoice: 1 };
    return (order[a.billing_status] ?? 9) - (order[b.billing_status] ?? 9);
  });

  // ── Section 3: Submission Pipeline ───────────────────────────────────────
  // All projects in the submission phase, with inline aging alerts.
  // Sorted: alert severity first (high → medium → low → none), then by updated_at asc (oldest first).
  const PIPELINE_STATUSES = new Set([
    "ready_for_submission",
    "submitted",
    "waiting_on_authority",
  ]);
  const pipelineProjects = allProjects
    .filter((p) => PIPELINE_STATUSES.has(p.status))
    .map((p) => ({
      project: p,
      alert: computeSubmissionAlert(p.status, p.updated_at),
    }))
    .sort((a, b) => {
      const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      const aSev = a.alert ? (severityOrder[a.alert.severity] ?? 3) : 3;
      const bSev = b.alert ? (severityOrder[b.alert.severity] ?? 3) : 3;
      if (aSev !== bSev) return aSev - bSev;
      // Within same alert tier: oldest first (most likely to need attention)
      return new Date(a.project.updated_at ?? a.project.created_at).getTime()
           - new Date(b.project.updated_at ?? b.project.created_at).getTime();
    });

  const pipelineAlertCount = pipelineProjects.filter((x) => x.alert !== null).length;

  // ── Section 4: In Design ──────────────────────────────────────────────────
  // Pre-submission work assigned to designers. Lower urgency — shown for awareness.
  const DESIGN_STATUSES = new Set([
    "ready_for_assignment",
    "assigned",
    "in_design",
    "approved",
    "package_generating",
  ]);
  const inDesign = allProjects.filter((p) => DESIGN_STATUSES.has(p.status));

  // ── Nudge signals (derived from already-computed sets, no extra queries) ────
  const readyToSubmitCount  = pipelineProjects.filter((x) => x.project.status === "ready_for_submission").length;
  const draftInvoiceCount   = billingQueue.filter((p) => p.billing_status === "draft_invoice").length;
  const readyToInvoiceCount = billingQueue.filter((p) => p.billing_status === "ready_to_invoice").length;

  type NudgePill = { text: string; href: string; color: string };
  const nudges: NudgePill[] = [];

  if (draftInvoiceCount > 0) nudges.push({
    text:  `${draftInvoiceCount} draft invoice${draftInvoiceCount !== 1 ? "s" : ""} ready to send`,
    href:  "/admin/projects",
    color: "text-blue-700 bg-blue-50 border-blue-200",
  });
  if (readyToSubmitCount > 0) nudges.push({
    text:  `${readyToSubmitCount} package${readyToSubmitCount !== 1 ? "s" : ""} ready to submit`,
    href:  "/admin/projects?tab=submission",
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
  });
  if (pipelineAlertCount > 0) nudges.push({
    text:  `${pipelineAlertCount} submission${pipelineAlertCount !== 1 ? "s" : ""} aging`,
    href:  "/admin/projects?tab=submission",
    color: "text-amber-700 bg-amber-50 border-amber-200",
  });
  if (readyToInvoiceCount > 0 && draftInvoiceCount === 0) nudges.push({
    text:  `${readyToInvoiceCount} project${readyToInvoiceCount !== 1 ? "s" : ""} ready to invoice`,
    href:  "/admin/projects",
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
  });

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-ink">Operations</h1>
        <p className="mt-0.5 text-sm text-muted">
          {actionRequired.length > 0
            ? `${actionRequired.length} project${actionRequired.length !== 1 ? "s" : ""} need your attention`
            : "No items need immediate action"}
        </p>
        {/* Nudge strip — specific action prompts, only when non-empty */}
        {nudges.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {nudges.map((n) => (
              <Link
                key={n.text}
                href={n.href}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-medium hover:opacity-80 transition-opacity ${n.color}`}
              >
                <span aria-hidden className="text-[10px]">→</span>
                {n.text}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Summary metrics row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          {
            label:  "Action Required",
            count:  actionRequired.length,
            href:   "/admin/projects?filter=attention",
            accent: actionRequired.length > 0 ? "#dc2626" : "#94a3b8",
          },
          {
            label:  "Billing Queue",
            count:  billingQueue.length,
            href:   "/admin/projects",
            accent: billingQueue.length > 0 ? "#059669" : "#94a3b8",
          },
          {
            label:  "In Submission",
            count:  pipelineProjects.length,
            href:   "/admin/projects?filter=submission",
            accent: pipelineAlertCount > 0 ? "#d97706" : "#3b82f6",
          },
          {
            label:  "In Design",
            count:  inDesign.length,
            href:   "/admin/projects",
            accent: "#3b82f6",
          },
        ] as { label: string; count: number; href: string; accent: string }[]).map((m) => (
          <Link
            key={m.label}
            href={m.href}
            className="bg-card rounded-xl px-4 py-3 flex items-center gap-3 hover:bg-surface transition-colors group"
            style={{ boxShadow: "0 1px 8px rgba(43,52,55,0.05)" }}
          >
            <span
              className="text-2xl font-bold tabular-nums leading-none flex-shrink-0"
              style={{ color: m.accent }}
            >
              {m.count}
            </span>
            <span className="text-xs text-muted group-hover:text-dim transition-colors leading-tight">
              {m.label}
            </span>
          </Link>
        ))}
      </div>

      {/* ── 1. Action Required ── */}
      <section>
        <SectionHeader
          title="Action Required"
          count={actionRequired.length}
          countColor={actionRequired.length > 0 ? "text-danger bg-danger/10" : "text-muted bg-surface"}
          href="/admin/projects?filter=attention"
        />
        <Card>
          {actionRequired.length === 0
            ? <EmptyState label="No projects need immediate action" />
            : actionRequired.map((item) => <QueueRow key={item.id} item={item} />)
          }
        </Card>
      </section>

      {/* ── 2. Billing Queue ── (only when actionable items exist) */}
      {billingQueue.length > 0 && (
        <section>
          <SectionHeader
            title="Billing Queue"
            count={billingQueue.length}
            countColor="text-emerald-700 bg-emerald-50"
            href="/admin/projects"
            hrefLabel="All projects"
          />
          <Card>
            {billingQueue.map((item) => <BillingRow key={item.id} item={item} />)}
          </Card>
        </section>
      )}

      {/* ── 3. Submission Pipeline ── */}
      <section>
        <SectionHeader
          title="Submission Pipeline"
          count={pipelineProjects.length}
          countColor={
            pipelineAlertCount > 0
              ? "text-amber-700 bg-amber-100"
              : "text-primary bg-primary-soft"
          }
          href="/admin/projects?filter=submission"
          hrefLabel="View all"
        />
        <Card>
          {pipelineProjects.length === 0 ? (
            <EmptyState label="No projects in submission pipeline" />
          ) : (
            pipelineProjects.map(({ project, alert }) => (
              <PipelineRow key={project.id} item={project} alert={alert} />
            ))
          )}
        </Card>
      </section>

      {/* ── 4. In Design ── */}
      <section>
        <SectionHeader
          title="In Design"
          count={inDesign.length}
          countColor="text-primary bg-primary-soft"
          href="/admin/projects"
          hrefLabel="View all projects"
        />
        <Card>
          {inDesign.length === 0
            ? <EmptyState label="No projects in design" />
            : inDesign.slice(0, 8).map((item) => <QueueRow key={item.id} item={item} />)
          }
          {inDesign.length > 8 && (
            <div className="px-4 py-3 text-center">
              <Link href="/admin/projects" className="text-xs text-primary hover:underline">
                +{inDesign.length - 8} more — view all projects
              </Link>
            </div>
          )}
        </Card>
      </section>

      {/* ── Quick links ── */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-faint">Jump to:</span>
        {[
          { label: "All Projects",    href: "/admin/projects" },
          { label: "Pricing Rules",   href: "/admin/settings#pricing" },
          { label: "TCD Library",     href: "/admin/settings#tcd-library" },
          { label: "Cover Templates", href: "/admin/settings#cover-templates" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="ml-2 text-xs text-primary hover:underline"
          >
            {link.label}
          </Link>
        ))}
      </div>

    </div>
  );
}
