import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompanyMembership } from "@/lib/queries/projects";
import { getCompanyInvoices } from "@/lib/queries/invoices";

export const metadata: Metadata = { title: "Invoices" };

// Company-facing invoice list: read-only, scoped to projects the user can
// see, drafts and holds filtered out by getCompanyInvoices (matches the RLS
// policy on `invoices`). PDF is served via /api/invoices/[id]/pdf which
// re-verifies auth + RLS before streaming bytes.

export default async function CompanyInvoicesPage() {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/sign-in");

  const membership = await getCompanyMembership(supabase, userData.user.id);
  if (!membership) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <p className="text-sm text-muted">
          Your account is not associated with a company. Contact your administrator.
        </p>
      </div>
    );
  }

  const invoices = await getCompanyInvoices(
    supabase,
    membership.company_id,
    userData.user.id,
    membership.role
  );

  return (
    <div className="p-8 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink">Invoices</h1>
        <p className="text-sm text-dim mt-0.5">
          {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Empty state */}
      {invoices.length === 0 && (
        <div className="bg-card rounded-xl px-6 py-16 text-center">
          <p className="text-dim text-sm">No invoices yet.</p>
        </div>
      )}

      {/* Invoice table */}
      {invoices.length > 0 && (
        <div className="bg-card rounded-xl overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_2fr_auto_auto_auto] gap-x-4 px-5 py-3 bg-canvas text-[11px] font-semibold uppercase tracking-wide text-dim border-b border-rule">
            <div>Invoice #</div>
            <div>Project</div>
            <div className="text-right">Amount</div>
            <div className="text-right">Date</div>
            <div></div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-surface">
            {invoices.map((inv) => {
              const statusColor =
                inv.status === "paid"
                  ? "text-emerald-600 bg-emerald-50"
                  : inv.status === "partially_paid"
                  ? "text-amber-600 bg-amber-50"
                  : inv.status === "void"
                  ? "text-dim bg-surface"
                  : "text-blue-600 bg-blue-50";

              const statusLabel =
                inv.status === "partially_paid"
                  ? "Partial"
                  : inv.status.charAt(0).toUpperCase() + inv.status.slice(1);

              const formattedDate = inv.invoice_date
                ? new Date(inv.invoice_date + "T12:00:00").toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric", year: "numeric" }
                  )
                : "—";

              return (
                <div
                  key={inv.id}
                  className="grid grid-cols-[1fr_2fr_auto_auto_auto] gap-x-4 px-5 py-4 items-center"
                >
                  {/* Invoice number + status */}
                  <div>
                    <div className="text-sm font-medium text-ink">
                      {inv.invoice_number}
                    </div>
                    <span
                      className={`inline-block mt-1 text-[11px] font-medium px-1.5 py-0.5 rounded ${statusColor}`}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  {/* Project */}
                  <div>
                    <div className="text-sm text-ink">{inv.project_job_name}</div>
                    <div className="text-xs text-dim font-mono mt-0.5">
                      {inv.project_job_number}
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="text-sm font-medium text-ink text-right">
                    ${inv.total_amount.toFixed(2)}
                  </div>

                  {/* Date */}
                  <div className="text-sm text-dim text-right whitespace-nowrap">
                    {formattedDate}
                  </div>

                  {/* View PDF button */}
                  <div>
                    {inv.pdf_storage_path ? (
                      <a
                        href={`/api/invoices/${inv.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-colors"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        View Invoice
                      </a>
                    ) : (
                      <span className="text-xs text-dim">Pending</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
