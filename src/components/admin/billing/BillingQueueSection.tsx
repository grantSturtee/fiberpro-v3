"use client";

/**
 * Billing queue section — projects that need invoice action.
 *
 * Lean operational table. Each row shows a project link + client + authority
 * + amount + a small icon-based action cluster. Buckets group rows by
 * billing state; hold and paid rows are visible but have no inline actions
 * (managed from the project's billing tab).
 *
 *   * Ready (no invoice yet) → "Create" button
 *   * Drafts                  → preview eye + Finalize + delete trash
 *   * Sent / Partially Paid / Paid → View-PDF eye icon
 *   * On Hold                → "On Hold" badge (read-only here)
 *
 * Each Create form has its own useActionState so error/success state is
 * local per row. The trash delete uses a void-returning action bound
 * directly to <form action> (native confirm() is the user-facing guard).
 */

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import type { BillingQueueRow } from "@/lib/queries/invoices";
import type { InvoiceActionState } from "@/app/(admin)/admin/invoices/actions";
import { FinalizeButton } from "./FinalizeButton";
import { getQueueDraftReviewFlags } from "./warnings";

// Shared column layout. Every header row and every data row in every
// category block uses this same `grid-cols` definition so columns line up
// uniformly across blocks — `auto` widths would let each block size its
// columns independently and produce drift.
const ROW_GRID =
  "grid grid-cols-[2fr_1fr_1.5fr_1.5fr_80px_120px] gap-x-4 px-4";

type VoidAction = (formData: FormData) => Promise<void>;

type Props = {
  rows: BillingQueueRow[];
  createInvoiceFromProject: (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  sendInvoice:              (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  deleteDraftInvoice:       VoidAction;
};

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function rowAmount(row: BillingQueueRow): number | null {
  const base = row.base_price ?? row.estimated_price;
  if (base == null) return null;
  return base - (row.discount_amount ?? 0);
}

function CreateInvoiceButton({
  projectId,
  action,
}: {
  projectId: string;
  action: Props["createInvoiceFromProject"];
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="project_id" value={projectId} />
      <button
        type="submit"
        disabled={pending}
        className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {pending ? "Creating…" : "Create"}
      </button>
      {state.error && <p className="text-[10px] text-red-600 max-w-[180px] text-right">{state.error}</p>}
    </form>
  );
}

// Send Draft button from the queue — wraps FinalizeButton (confirm + warning
// gating). Disabled prop pipes through the queue-level review flags so an
// admin can still see the button but can't double-click their way past
// missing data.
function SendDraftButton({
  invoiceId,
  invoiceNumber,
  total,
  action,
  flags,
}: {
  invoiceId: string;
  invoiceNumber: string;
  total: number;
  action: Props["sendInvoice"];
  flags: string[];
}) {
  return (
    <FinalizeButton
      invoiceId={invoiceId}
      invoiceNumber={invoiceNumber}
      total={total}
      action={action}
      disabled={false}
      disabledReason={
        flags.length > 0
          ? `Needs review: ${flags.join(", ")}. Confirm before sending.`
          : undefined
      }
      size="small"
      label="Finalize"
    />
  );
}

// ── Delete-draft trash button ────────────────────────────────────────────────

function DeleteDraftBtnInner() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title="Delete draft"
      aria-label="Delete draft invoice"
      onClick={(e) => {
        if (
          !confirm(
            "Delete this draft and return project to Ready to Invoice?"
          )
        ) {
          e.preventDefault();
        }
      }}
      className="text-red-600 hover:text-red-700 transition-colors p-1 disabled:opacity-40"
    >
      {pending ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          className="animate-spin"
        >
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
          <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M2 4h12M6 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4M5 4l.7 9.1a1 1 0 0 0 1 .9h2.6a1 1 0 0 0 1-.9L11 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

function DeleteDraftButton({ invoiceId, action }: { invoiceId: string; action: VoidAction }) {
  return (
    <form action={action} className="inline-flex">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <DeleteDraftBtnInner />
    </form>
  );
}

// Small left-edge color rail that gives admins a 1-glance state cue when
// scanning the queue top-to-bottom. Rendered as an absolute element on each
// row (not as a grid column) so the data-row grid template can match the
// column-header grid template exactly.
function railColorClass(tone: "blue" | "amber" | "emerald" | "gray"): string {
  return tone === "blue"    ? "bg-blue-500"
       : tone === "amber"   ? "bg-amber-500"
       : tone === "emerald" ? "bg-emerald-500"
       :                       "bg-rule";
}

type Category = "drafts" | "partial" | "ready" | "awaiting" | "hold" | "paid";

const CATEGORY_META: Record<
  Category,
  { title: string; tone: "blue" | "amber" | "emerald" | "gray"; emphasize: boolean }
> = {
  drafts:   { title: "Drafts",           tone: "blue",    emphasize: true  },
  partial:  { title: "Partially Paid",   tone: "amber",   emphasize: true  },
  ready:    { title: "Ready to Invoice", tone: "emerald", emphasize: false },
  awaiting: { title: "Awaiting Payment", tone: "gray",    emphasize: false },
  hold:     { title: "On Hold",          tone: "gray",    emphasize: false },
  paid:     { title: "Paid",             tone: "emerald", emphasize: false },
};

const RENDER_ORDER: Category[] = ["drafts", "partial", "ready", "awaiting", "hold", "paid"];

function categorize(rows: BillingQueueRow[]): Record<Category, BillingQueueRow[]> {
  const out: Record<Category, BillingQueueRow[]> = {
    drafts: [],
    partial: [],
    ready: [],
    awaiting: [],
    hold: [],
    paid: [],
  };
  for (const row of rows) {
    switch (row.billing_status) {
      case "draft_invoice":     out.drafts.push(row);   break;
      case "partially_paid":    out.partial.push(row);  break;
      case "ready_to_invoice":  out.ready.push(row);    break;
      case "invoiced":          out.awaiting.push(row); break;
      case "hold":              out.hold.push(row);     break;
      case "paid":              out.paid.push(row);     break;
      // not_ready isn't returned by getBillingQueue.
    }
  }
  return out;
}

export function BillingQueueSection({
  rows,
  createInvoiceFromProject,
  sendInvoice,
  deleteDraftInvoice,
}: Props) {
  const grouped = categorize(rows);
  const totalActionable = rows.length;

  return (
    <section className="space-y-4">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-ink">
          Billing Queue
          <span className="ml-2 text-xs font-normal text-muted">
            {totalActionable} project{totalActionable === 1 ? "" : "s"} needing action
          </span>
        </h2>
      </div>

      {totalActionable === 0 ? (
        <div className="bg-canvas border border-rule rounded-lg px-5 py-6 text-center">
          <p className="text-sm text-muted">No projects need billing action right now.</p>
          <p className="text-xs text-faint mt-1">
            Browse all invoices below.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {RENDER_ORDER
            .filter((c) => grouped[c].length > 0)
            .map((c) => (
              <CategoryBlock
                key={c}
                category={c}
                rows={grouped[c]}
                createInvoiceFromProject={createInvoiceFromProject}
                sendInvoice={sendInvoice}
                deleteDraftInvoice={deleteDraftInvoice}
              />
            ))}
        </div>
      )}
    </section>
  );
}

function CountChip({
  count,
  tone,
}: {
  count: number;
  tone: "blue" | "amber" | "emerald" | "gray";
}) {
  const toneCls =
    tone === "blue"    ? "bg-blue-50 text-blue-700"
    : tone === "amber"  ? "bg-amber-50 text-amber-800"
    : tone === "emerald"? "bg-emerald-50 text-emerald-700"
    : "bg-canvas text-dim border border-rule";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${toneCls}`}>
      {count}
    </span>
  );
}

function CategoryBlock({
  category,
  rows,
  createInvoiceFromProject,
  sendInvoice,
  deleteDraftInvoice,
}: {
  category: Category;
  rows: BillingQueueRow[];
  createInvoiceFromProject: Props["createInvoiceFromProject"];
  sendInvoice: Props["sendInvoice"];
  deleteDraftInvoice: VoidAction;
}) {
  const meta = CATEGORY_META[category];
  return (
    <div
      className={
        meta.emphasize
          ? "bg-card rounded-xl overflow-hidden border-2 border-primary/30 shadow-sm"
          : "bg-card rounded-xl overflow-hidden border border-rule"
      }
    >
      <div className="px-4 py-2.5 bg-canvas border-b border-surface flex items-baseline gap-2 flex-wrap">
        <h3 className="text-xs font-semibold text-ink uppercase tracking-wider">
          {meta.title}
        </h3>
        <CountChip count={rows.length} tone={meta.tone} />
      </div>

      {/* Column header row — uses the shared ROW_GRID so columns line up
          with data rows. The rail on data rows is absolute-positioned and
          doesn't occupy a grid column, so this header doesn't reserve one. */}
      <div className={`${ROW_GRID} py-2 border-b border-rule text-[11px] font-semibold uppercase tracking-wide text-dim`}>
        <div>Project</div>
        <div>Job #</div>
        <div>Client</div>
        <div>Authority</div>
        <div className="text-right">Amount</div>
        <div></div>
      </div>

      {rows.map((row) => {
              const isHold = row.billing_status === "hold";
              const hasDraft =
                row.latest_invoice != null && row.latest_invoice.status === "draft";
              const hasOther =
                row.latest_invoice != null && row.latest_invoice.status !== "draft";

              // State rail color = at-a-glance scan cue. Hold wins over invoice
              // state so an on-hold project always shows gray.
              const railTone: "blue" | "amber" | "emerald" | "gray" =
                isHold ? "gray"
                : hasDraft ? "blue"
                : !row.latest_invoice ? "emerald"
                : hasOther && row.latest_invoice?.status === "partially_paid" ? "amber"
                : "gray";

              return (
                <div
                  key={row.id}
                  className={`${ROW_GRID} py-3 items-center relative border-b border-rule last:border-0 pl-3 hover:bg-surface/40 transition-colors`}
                >
                  {/* Absolute color rail — pinned to the left edge so the
                      grid columns above line up with the column header row. */}
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-1 rounded ${railColorClass(railTone)}`}
                    aria-hidden
                  />

                  {/* Project name (col 1) */}
                  <div className="min-w-0">
                    <Link
                      href={`/admin/projects/${row.id}?tab=billing`}
                      className="font-medium text-ink hover:text-primary transition-colors"
                    >
                      {row.job_name || "—"}
                    </Link>
                  </div>

                  {/* Job # (col 2) */}
                  <span className="text-sm text-dim font-mono truncate">
                    {row.job_number}
                  </span>

                  {/* Client (col 3) */}
                  <p className="text-xs text-dim truncate">{row.company_name ?? "—"}</p>

                  {/* Authority */}
                  <p className="text-xs text-dim truncate">
                    {row.authority_name ?? row.jurisdiction_name ?? "—"}
                  </p>

                  {/* Amount */}
                  <div className="text-right text-sm font-medium text-ink">
                    {fmtMoney(rowAmount(row))}
                  </div>

                  {/* Quick actions — branch on billing state */}
                  <div className="flex items-center justify-end gap-1.5">
                    {isHold && (
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-canvas text-dim border border-rule"
                        title="Billing paused"
                      >
                        On Hold
                      </span>
                    )}

                    {!isHold && !row.latest_invoice && (
                      <CreateInvoiceButton
                        projectId={row.id}
                        action={createInvoiceFromProject}
                      />
                    )}

                    {!isHold && hasDraft && row.latest_invoice && (() => {
                      // Flags still drive FinalizeButton's disabledReason tooltip.
                      const flags = getQueueDraftReviewFlags({
                        total_amount: row.latest_invoice.total_amount,
                        recipient_email: row.latest_invoice.recipient_email,
                      });
                      return (
                        <>
                          <SendDraftButton
                            invoiceId={row.latest_invoice.id}
                            invoiceNumber={row.latest_invoice.invoice_number}
                            total={row.latest_invoice.total_amount}
                            action={sendInvoice}
                            flags={flags}
                          />
                          <a
                            href={`/api/invoices/${row.latest_invoice.id}/preview`}
                            target="_blank"
                            rel="noreferrer"
                            title="Preview PDF"
                            aria-label="Preview PDF"
                            className="text-muted hover:text-ink transition-colors p-1.5 rounded-md hover:bg-wash"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
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
                          </a>
                          <DeleteDraftButton
                            invoiceId={row.latest_invoice.id}
                            action={deleteDraftInvoice}
                          />
                        </>
                      );
                    })()}

                    {!isHold && hasOther && row.latest_invoice && (
                      <>
                        {row.latest_invoice.status === "partially_paid" &&
                          row.latest_invoice.paid_amount != null && (
                            <span
                              className="text-[10px] text-amber-800 font-semibold"
                              title={`Paid ${fmtMoney(row.latest_invoice.paid_amount)} of ${fmtMoney(row.latest_invoice.total_amount)}`}
                            >
                              {fmtMoney(
                                row.latest_invoice.total_amount - row.latest_invoice.paid_amount
                              )} due
                            </span>
                          )}
                        <a
                          href={`/api/invoices/${row.latest_invoice.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          title="View PDF"
                          className="inline-flex items-center justify-center w-7 h-7 rounded text-dim hover:text-ink hover:bg-wash transition-colors"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
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
                        </a>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
    </div>
  );
}
