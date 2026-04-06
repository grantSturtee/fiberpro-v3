import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { BillingStatusBadge, ProjectStatusBadge } from "@/components/ui/StatusBadge";
import type { BillingStatus, ProjectStatus } from "@/types/domain";

export const metadata: Metadata = { title: "Billing" };

export default async function AdminBillingPage() {
  const supabase = await createClient();

  const { data: projectsData } = await supabase
    .from("projects")
    .select(`
      id,
      job_number,
      job_name,
      status,
      billing_status,
      companies!inner ( name )
    `)
    .not("billing_status", "eq", "not_ready")
    .order("created_at", { ascending: false });

  type Row = {
    id: string;
    job_number: string;
    job_name: string;
    status: ProjectStatus;
    billing_status: BillingStatus;
    companies: { name: string };
  };

  const rows = (projectsData ?? []) as Row[];
  const readyCount = rows.filter((r) => r.billing_status === "ready_to_invoice").length;

  return (
    <div className="p-8 space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="Billing"
        subtitle="Invoice readiness and payment status"
        action={
          <Link
            href="/admin/settings#pricing"
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-canvas text-dim hover:bg-wash hover:text-ink transition-colors"
          >
            Pricing Rules
          </Link>
        }
      />

      {/* Ready to invoice callout */}
      {readyCount > 0 && (
        <div className="bg-emerald-50 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-800">
              {readyCount} project{readyCount > 1 ? "s" : ""} ready to invoice
            </p>
            <p className="text-xs text-emerald-700 mt-0.5">
              Design approved — billing can proceed once invoicing is configured.
            </p>
          </div>
          {/* Invoice creation not yet implemented */}
          <button
            disabled
            className="flex-shrink-0 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-700 opacity-40 cursor-not-allowed"
            title="Invoice creation not yet implemented"
          >
            Create Invoices
          </button>
        </div>
      )}

      {/* Table */}
      {rows.length === 0 ? (
        <div
          className="bg-card rounded-xl px-6 py-16 text-center"
          style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
        >
          <p className="text-sm text-muted">
            No projects with billing activity yet.
          </p>
          <p className="text-xs text-faint mt-1">
            Projects appear here once their billing status advances past &quot;Not Ready&quot;.
          </p>
        </div>
      ) : (
        <div
          className="bg-card rounded-xl overflow-hidden"
          style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
        >
          <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr] gap-4 px-5 py-3 bg-canvas">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Project</span>
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Client</span>
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Project Status</span>
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Billing</span>
          </div>

          <div className="divide-y divide-surface">
            {rows.map((row) => (
              <Link
                key={row.id}
                href={`/admin/projects/${row.id}`}
                className="grid grid-cols-[2fr_1.5fr_1fr_1fr] gap-4 px-5 py-3.5 items-center hover:bg-surface transition-colors group"
              >
                <div>
                  <p className="text-sm font-medium text-ink truncate group-hover:text-primary transition-colors">
                    {row.job_name}
                  </p>
                  <p className="text-xs text-muted font-mono">{row.job_number}</p>
                </div>
                <p className="text-sm text-dim truncate">{row.companies?.name ?? "—"}</p>
                <ProjectStatusBadge status={row.status} />
                <BillingStatusBadge status={row.billing_status} />
              </Link>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted">
        Invoice amounts are managed manually for now. Automated invoicing will be available in a future update.
      </p>
    </div>
  );
}
