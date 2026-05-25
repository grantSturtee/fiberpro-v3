import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAdminProjectList, type ProjectListRow } from "@/lib/queries/projects";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProjectStatusBadge } from "@/components/ui/StatusBadge";
import {
  computeSubmissionAlert,
  type SubmissionAlert,
  ALERT_SEVERITY_DOT,
  ALERT_SEVERITY_TEXT,
} from "@/lib/alerts/submissionAlerts";
import type { UnifiedProjectStatus } from "@/types/domain";

export const metadata: Metadata = { title: "Dashboard" };

// ── Status sets (unified) ─────────────────────────────────────────────────────
// Some projects appear in multiple sections by design (e.g. sub_bill_now shows
// in both Action Required and Submission Pipeline) — matches the original
// behavior where authority_action_needed surfaced in both attention + pipeline.

const ATTENTION_STATUSES  = new Set<UnifiedProjectStatus>(["new_project", "pending_review", "sub_bill_now"]);
const BILLING_STATUSES    = new Set<UnifiedProjectStatus>(["billing_ready", "invoice_sent"]);
const SUBMISSION_STATUSES = new Set<UnifiedProjectStatus>(["sub_bill_now", "permit_billed"]);
const DESIGN_STATUSES     = new Set<UnifiedProjectStatus>(["in_production"]);

// Billing queue sort priority — billing_ready first (admin needs to invoice),
// then invoice_sent (awaiting payment).
const BILLING_PRIORITY: Partial<Record<UnifiedProjectStatus, number>> = {
  billing_ready: 0,
  invoice_sent:  1,
};

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

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  count,
  href,
  hrefLabel = "View all",
}: {
  title: string;
  count?: number;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-[#374151]">
        {title}
        {count !== undefined && (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-[#F3F4F6] text-[#6B7280]">
            {count}
          </span>
        )}
      </h2>
      {href && (
        <Link href={href} className="text-[13px] font-medium text-[#1565C0] hover:underline">
          {hrefLabel}
        </Link>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden divide-y divide-[#F3F4F6]">
      {children}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="px-4 py-6 text-center text-[14px] text-[#6B7280]">{label}</div>
  );
}

// A project row with full context: company, designer, status badge + age.
function QueueRow({ item }: { item: ProjectListRow }) {
  return (
    <Link
      href={`/admin/projects/${item.id}`}
      className="flex items-center gap-4 px-4 py-3 hover:bg-[#F9FAFB] transition-colors group"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-mono text-[#9CA3AF] flex-shrink-0">
            {item.job_number}
          </span>
          <span className="text-[14px] font-medium text-[#111827] truncate group-hover:text-[#1565C0] transition-colors">
            {item.job_name}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {item.company_name && (
            <span className="text-[12px] text-[#6B7280]">{item.company_name}</span>
          )}
          {item.assigned_designer_name && (
            <>
              <span className="text-[11px] text-[#9CA3AF]">·</span>
              <span className="text-[12px] text-[#6B7280]">{item.assigned_designer_name}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <ProjectStatusBadge status={item.unified_status} />
        <span className="hidden sm:block w-16 text-right text-[12px] text-[#6B7280]">
          {timeAgo(item.updated_at ?? item.created_at)}
        </span>
      </div>
    </Link>
  );
}

// Pipeline row for submission-state projects; shows alert badge inline.
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
      className="flex items-center gap-3 px-4 py-3 hover:bg-[#F9FAFB] transition-colors group"
    >
      {alert ? (
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ALERT_SEVERITY_DOT[alert.severity]}`} />
      ) : (
        <span className="w-2 h-2 rounded-full flex-shrink-0 border border-[#E5E7EB]" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          {alert && (
            <span className={`text-[12px] font-semibold flex-shrink-0 ${ALERT_SEVERITY_TEXT[alert.severity]}`}>
              {alert.label}
            </span>
          )}
          <span className="text-[14px] font-medium text-[#111827] truncate group-hover:text-[#1565C0] transition-colors">
            {item.job_name}
          </span>
          <span className="hidden sm:block text-[11px] font-mono text-[#9CA3AF] flex-shrink-0">
            {item.job_number}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {item.company_name && (
            <span className="text-[12px] text-[#6B7280]">{item.company_name}</span>
          )}
          {alert ? (
            <>
              <span className="text-[11px] text-[#9CA3AF]">·</span>
              <span className="text-[12px] text-[#6B7280]">{alert.detail}</span>
            </>
          ) : (
            <ProjectStatusBadge status={item.unified_status} />
          )}
        </div>
      </div>
      <span className="hidden sm:block w-16 flex-shrink-0 text-right text-[12px] text-[#6B7280]">
        {timeAgo(item.updated_at ?? item.created_at)}
      </span>
    </Link>
  );
}

// Billing row — links to the billing anchor on the project page.
function BillingRow({ item }: { item: ProjectListRow }) {
  return (
    <Link
      href={`/admin/projects/${item.id}#section-billing`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-[#F9FAFB] transition-colors group"
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#82C4A0" }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[14px] font-medium text-[#111827] truncate group-hover:text-[#1565C0] transition-colors">
            {item.job_name}
          </span>
          <span className="hidden sm:block text-[11px] font-mono text-[#9CA3AF] flex-shrink-0">
            {item.job_number}
          </span>
        </div>
        {item.company_name && (
          <p className="mt-0.5 text-[12px] text-[#6B7280]">{item.company_name}</p>
        )}
      </div>
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <ProjectStatusBadge status={item.unified_status} />
        <span className="hidden sm:block w-16 text-right text-[12px] text-[#6B7280]">
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

  // Section filters — all on unified_status
  const actionRequired = allProjects.filter((p) => ATTENTION_STATUSES.has(p.unified_status));

  const billingQueue = allProjects
    .filter((p) => BILLING_STATUSES.has(p.unified_status))
    .sort((a, b) =>
      (BILLING_PRIORITY[a.unified_status] ?? 9) - (BILLING_PRIORITY[b.unified_status] ?? 9)
    );

  // NOTE: alert function still typed on legacy ProjectStatus — see
  // src/lib/alerts/submissionAlerts.ts header comment for the rationale.
  // This is the one site on this page that still reads p.status (legacy).
  const pipelineProjects = allProjects
    .filter((p) => SUBMISSION_STATUSES.has(p.unified_status))
    .map((p) => ({
      project: p,
      alert: computeSubmissionAlert(p.status, p.updated_at),
    }))
    .sort((a, b) => {
      const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      const aSev = a.alert ? (severityOrder[a.alert.severity] ?? 3) : 3;
      const bSev = b.alert ? (severityOrder[b.alert.severity] ?? 3) : 3;
      if (aSev !== bSev) return aSev - bSev;
      return new Date(a.project.updated_at ?? a.project.created_at).getTime()
           - new Date(b.project.updated_at ?? b.project.created_at).getTime();
    });

  const inDesign = allProjects.filter((p) => DESIGN_STATUSES.has(p.unified_status));

  const attentionCount = actionRequired.length;

  return (
    <div className="p-8 space-y-8">

      {/* Header */}
      <PageHeader
        title="Dashboard"
        subtitle={`${attentionCount} project${attentionCount !== 1 ? "s" : ""} need attention`}
      />

      {/* Summary metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          {
            label:  "Action Required",
            count:  actionRequired.length,
            href:   "/admin/projects?tab=attention",
            accent: "#DC2626",
          },
          {
            label:  "Billing Queue",
            count:  billingQueue.length,
            href:   "/admin/projects",
            accent: "#9B8EC4",
          },
          {
            label:  "Submission Pipeline",
            count:  pipelineProjects.length,
            href:   "/admin/projects?tab=submission",
            accent: "#E8D44D",
          },
          {
            label:  "In Design",
            count:  inDesign.length,
            href:   "/admin/projects?tab=production",
            accent: "#E8A87C",
          },
        ] as { label: string; count: number; href: string; accent: string }[]).map((m) => (
          <Link
            key={m.label}
            href={m.href}
            className="bg-white rounded-lg flex flex-col gap-1.5 hover:bg-[#F9FAFB] transition-colors"
            style={{
              padding: 20,
              border: "1px solid #E5E7EB",
              borderLeft: `4px solid ${m.accent}`,
            }}
          >
            <span className="text-[28px] font-extrabold tabular-nums leading-none text-[#111827]">
              {m.count}
            </span>
            <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#6B7280] truncate">
              {m.label}
            </span>
          </Link>
        ))}
      </div>

      {/* 1. Action Required */}
      <section>
        <SectionHeader
          title="Action Required"
          count={actionRequired.length}
          href="/admin/projects?tab=attention"
        />
        <Card>
          {actionRequired.length === 0
            ? <EmptyState label="No projects need immediate action" />
            : actionRequired.map((item) => <QueueRow key={item.id} item={item} />)
          }
        </Card>
      </section>

      {/* 2. Billing Queue (only when actionable items exist) */}
      {billingQueue.length > 0 && (
        <section>
          <SectionHeader
            title="Billing Queue"
            count={billingQueue.length}
            href="/admin/projects"
            hrefLabel="All projects"
          />
          <Card>
            {billingQueue.map((item) => <BillingRow key={item.id} item={item} />)}
          </Card>
        </section>
      )}

      {/* 3. Submission Pipeline */}
      <section>
        <SectionHeader
          title="Submission Pipeline"
          count={pipelineProjects.length}
          href="/admin/projects?tab=submission"
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

      {/* 4. In Design */}
      <section>
        <SectionHeader
          title="In Design"
          count={inDesign.length}
          href="/admin/projects?tab=production"
          hrefLabel="View all"
        />
        <Card>
          {inDesign.length === 0
            ? <EmptyState label="No projects in design" />
            : inDesign.slice(0, 8).map((item) => <QueueRow key={item.id} item={item} />)
          }
          {inDesign.length > 8 && (
            <div className="px-4 py-3 text-center">
              <Link href="/admin/projects?tab=production" className="text-[13px] font-medium text-[#1565C0] hover:underline">
                +{inDesign.length - 8} more — view all projects
              </Link>
            </div>
          )}
        </Card>
      </section>

      {/* Quick links footer */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[12px] text-[#9CA3AF]">Jump to:</span>
        {[
          { label: "All Projects",    href: "/admin/projects" },
          { label: "Pricing Rules",   href: "/admin/settings#pricing" },
          { label: "TCD Library",     href: "/admin/settings#tcd-library" },
          { label: "Cover Templates", href: "/admin/settings#cover-templates" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="ml-2 text-[13px] font-medium text-[#1565C0] hover:underline"
          >
            {link.label}
          </Link>
        ))}
      </div>

    </div>
  );
}
