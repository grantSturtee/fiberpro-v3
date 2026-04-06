import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { BillingStatusBadge, ProjectStatusBadge } from "@/components/ui/StatusBadge";
import type { BillingStatus, ProjectStatus } from "@/types/domain";

export const metadata: Metadata = { title: "Billing" };

// Billing visibility — shows projects with billing status and invoice readiness.
// Invoice generation and pricing rules belong here eventually.
// TODO: Replace with Supabase query — projects joined with invoices and pricing_rules.

type BillingRow = {
  id: string;
  jobNumber: string;
  jobName: string;
  client: string;
  projectStatus: ProjectStatus;
  billingStatus: BillingStatus;
  amount?: string;
  invoicedAt?: string;
};

const BILLING_ROWS: BillingRow[] = [
  { id: "6",  jobNumber: "FP-2026-0016", jobName: "Comcast Underground Conduit — Rt. 35",  client: "Comcast Northeast", projectStatus: "approved",              billingStatus: "ready_to_invoice" },
  { id: "7",  jobNumber: "FP-2026-0015", jobName: "Lightpath Aerial — Garden State Pkwy",  client: "Lightpath LLC",     projectStatus: "ready_for_submission",  billingStatus: "ready_to_invoice" },
  { id: "8",  jobNumber: "FP-2026-0014", jobName: "Comcast Splice Vault — CR-8",            client: "Comcast Northeast", projectStatus: "submitted",             billingStatus: "invoiced",          amount: "$2,400", invoicedAt: "Mar 21, 2026" },
  { id: "9",  jobNumber: "FP-2026-0013", jobName: "Verizon Aerial Fiber — Rt. 35",          client: "Verizon Business",  projectStatus: "waiting_on_authority",  billingStatus: "invoiced",          amount: "$1,800", invoicedAt: "Mar 19, 2026" },
  { id: "10", jobNumber: "FP-2026-0012", jobName: "Comcast Underground Crossing — US-9",    client: "Comcast Northeast", projectStatus: "permit_received",       billingStatus: "paid",              amount: "$3,100", invoicedAt: "Mar 11, 2026" },
  { id: "11", jobNumber: "FP-2026-0011", jobName: "Lightpath Conduit Installation — I-78",  client: "Lightpath LLC",     projectStatus: "closed",                billingStatus: "paid",              amount: "$2,750", invoicedAt: "Mar 1, 2026" },
  { id: "4",  jobNumber: "FP-2026-0018", jobName: "Comcast Aerial TCP — Rt. 46 SB",         client: "Comcast Northeast", projectStatus: "in_design",             billingStatus: "not_ready" },
  { id: "5",  jobNumber: "FP-2026-0017", jobName: "Verizon Fiber Splice Vault — CR-512",    client: "Verizon Business",  projectStatus: "in_design",             billingStatus: "not_ready" },
];

export default function AdminBillingPage() {
  const readyCount = BILLING_ROWS.filter((r) => r.billingStatus === "ready_to_invoice").length;

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <PageHeader
        title="Billing"
        subtitle="Invoice readiness and payment status"
        action={
          <div className="flex items-center gap-2">
            {/* TODO: Link to pricing rules settings */}
            <button className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-canvas text-dim hover:bg-wash hover:text-ink transition-colors">
              Pricing Rules
            </button>
          </div>
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
              Design approved and package generated — billing can proceed.
            </p>
          </div>
          {/* TODO: Batch invoice creation */}
          <button className="flex-shrink-0 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 transition-colors">
            Create Invoices
          </button>
        </div>
      )}

      {/* Table */}
      <div
        className="bg-card rounded-xl overflow-hidden"
        style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
      >
        <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr] gap-4 px-5 py-3 bg-canvas">
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Project</span>
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Client</span>
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Project Status</span>
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Billing</span>
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Amount</span>
        </div>

        <div className="divide-y divide-surface">
          {BILLING_ROWS.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr] gap-4 px-5 py-3.5 items-center"
            >
              <div>
                <p className="text-sm font-medium text-ink">{row.jobName}</p>
                <p className="text-xs text-muted font-mono">{row.jobNumber}</p>
              </div>
              <p className="text-sm text-dim">{row.client}</p>
              <ProjectStatusBadge status={row.projectStatus} />
              <BillingStatusBadge status={row.billingStatus} />
              <p className="text-sm text-ink font-medium">
                {row.amount ?? <span className="text-faint">—</span>}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
