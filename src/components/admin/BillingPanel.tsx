"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { InvoiceStatus } from "@/types/invoice";
import type { PricingResolution } from "@/lib/pricing/types";
import type { InvoiceActionState } from "@/app/(admin)/admin/invoices/actions";
import type { InvoiceWithItems } from "@/lib/queries/invoices";
import { DraftInlineEditor } from "@/components/admin/billing/DraftInlineEditor";
import { LineItemsEditor } from "@/components/admin/billing/LineItemsEditor";
import { DraftWarnings } from "@/components/admin/billing/DraftWarnings";
import { SnapshotSummary } from "@/components/admin/billing/SnapshotSummary";
import { AuditPanel } from "@/components/admin/billing/AuditPanel";
import { FinalizeButton } from "@/components/admin/billing/FinalizeButton";
import {
  PricingReviewPanel,
  type PricingReviewProject,
} from "@/components/admin/billing/PricingReviewPanel";
import {
  getDraftWarnings,
  hasBlockingWarning,
} from "@/components/admin/billing/warnings";

// ── Types ─────────────────────────────────────────────────────────────────────

type InvoiceActions = {
  createInvoiceFromProject: (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  updateDraftInvoice:       (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  addInvoiceLineItem:       (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  updateInvoiceLineItem:    (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  deleteInvoiceLineItem:    (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  sendInvoice:              (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  markInvoicePartiallyPaid: (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  markInvoicePaid:          (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  voidInvoice:              (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  deleteDraftInvoice:       (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
};

type Props = {
  project: PricingReviewProject;
  invoices: InvoiceWithItems[];
  invoiceActions: InvoiceActions;
  pricingResolution: PricingResolution;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch { return iso; }
}

// ── Invoice status presentation ───────────────────────────────────────────────

const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft:          "Draft",
  sent:           "Sent",
  partially_paid: "Partially Paid",
  paid:           "Paid",
  void:           "Voided",
  hold:           "On Hold",
};

const INVOICE_STATUS_COLOR: Record<InvoiceStatus, string> = {
  draft:          "bg-blue-50 text-blue-700",
  sent:           "bg-blue-100 text-blue-800",
  partially_paid: "bg-amber-50 text-amber-800",
  paid:           "bg-emerald-100 text-emerald-800",
  void:           "bg-red-50 text-red-700",
  hold:           "bg-red-50 text-red-700",
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-0.5">
      {children}
    </p>
  );
}

function SubmitBtn({ label, pendingLabel, className }: {
  label: string; pendingLabel?: string; className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors ${className ?? "bg-primary text-white hover:bg-primary/90"}`}
    >
      {pending ? (pendingLabel ?? "Saving…") : label}
    </button>
  );
}

// ── Invoice section ───────────────────────────────────────────────────────────

const INITIAL_INVOICE_ACTION_STATE: InvoiceActionState = { error: null };

function InvoiceActionForm({
  action,
  invoiceId,
  buttonLabel,
  pendingLabel,
  buttonClassName,
  children,
}: {
  action: (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  invoiceId?: string;
  buttonLabel: string;
  pendingLabel?: string;
  buttonClassName?: string;
  children?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, INITIAL_INVOICE_ACTION_STATE);
  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      {invoiceId && <input type="hidden" name="invoice_id" value={invoiceId} />}
      {children}
      <SubmitBtn
        label={buttonLabel}
        pendingLabel={pendingLabel}
        className={buttonClassName}
      />
      {state.error   && <p className="text-[11px] text-red-600">{state.error}</p>}
      {state.success && <p className="text-[11px] text-green-700">{state.success}</p>}
    </form>
  );
}

// Order invoices so each parent (top-level) appears with its supplemental
// children nested directly below it. Top-level invoices keep the query's
// `created_at DESC` order; children appear in `created_at ASC` order beneath
// their parent. Orphan supplementals (whose parent isn't in the list) are
// appended at the end in query order.
function orderInvoicesForDisplay(invoices: InvoiceWithItems[]): InvoiceWithItems[] {
  const idsInList = new Set(invoices.map((i) => i.id));
  const childrenByParent = new Map<string, InvoiceWithItems[]>();
  const parents: InvoiceWithItems[] = [];

  for (const inv of invoices) {
    if (inv.parent_invoice_id && idsInList.has(inv.parent_invoice_id)) {
      const list = childrenByParent.get(inv.parent_invoice_id) ?? [];
      list.push(inv);
      childrenByParent.set(inv.parent_invoice_id, list);
    } else {
      parents.push(inv); // includes orphan supplementals whose parent isn't loaded
    }
  }

  const ordered: InvoiceWithItems[] = [];
  const seen = new Set<string>();
  for (const parent of parents) {
    if (seen.has(parent.id)) continue;
    ordered.push(parent);
    seen.add(parent.id);
    const kids = (childrenByParent.get(parent.id) ?? []).slice();
    kids.sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const kid of kids) {
      ordered.push(kid);
      seen.add(kid.id);
    }
  }
  // Defensive: surface any rows the loop missed (shouldn't happen).
  for (const inv of invoices) {
    if (!seen.has(inv.id)) ordered.push(inv);
  }
  return ordered;
}

function EditableBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700">
      <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      Editable
    </span>
  );
}

function FrozenBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700">
      <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="4" y="7" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 7V5a2 2 0 014 0v2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      Frozen PDF
    </span>
  );
}

function InvoiceCard({
  invoice,
  invoiceActions,
  isSupplemental = false,
}: {
  invoice: InvoiceWithItems;
  invoiceActions: InvoiceActions;
  isSupplemental?: boolean;
}) {
  const statusLabel = INVOICE_STATUS_LABEL[invoice.status];
  const statusColor = INVOICE_STATUS_COLOR[invoice.status];

  const previewHref  = `/api/invoices/${invoice.id}/preview`;
  const downloadHref = `/api/invoices/${invoice.id}/pdf`;
  const linkCls =
    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-surface text-dim hover:bg-wash hover:text-ink border border-rule transition-colors";

  const inputCls =
    "w-full text-sm border border-rule rounded-md px-2 py-1.5 bg-background text-ink focus:outline-none focus:ring-1 focus:ring-primary";

  // Slight visual emphasis: non-void cards get a 2px primary border. Void cards
  // stay subdued. Supplementals are inset and get a left rail to indicate nesting.
  const isVoid = invoice.status === "void";
  const containerCls = [
    "rounded-lg p-4 space-y-3",
    isVoid
      ? "border border-rule bg-canvas opacity-90"
      : "border-2 border-primary/30 bg-canvas shadow-sm",
    isSupplemental ? "ml-6 border-l-4 border-l-blue-300" : "",
  ].join(" ");

  return (
    <div className={containerCls}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-mono font-semibold text-ink">{invoice.invoice_number}</p>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusColor}`}
          >
            {statusLabel}
          </span>
          {invoice.status === "draft" && <EditableBadge />}
          {(invoice.status === "sent" ||
            invoice.status === "partially_paid" ||
            invoice.status === "paid") && <FrozenBadge />}
        </div>
        <div className="text-right">
          <p className="text-base font-semibold text-ink">{fmt(invoice.total_amount)}</p>
          {invoice.discount_amount > 0 && (
            <p className="text-[11px] text-muted">
              Subtotal {fmt(invoice.subtotal)} − {fmt(invoice.discount_amount)} discount
            </p>
          )}
        </div>
      </div>

      {/* Meta line */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span>Date: {fmtDate(invoice.invoice_date)}</span>
        {invoice.due_date && <span>Due {fmtDate(invoice.due_date)}</span>}
        {invoice.sent_at && <span>Sent {fmtDate(invoice.sent_at)}</span>}
        {invoice.paid_at && (
          <span className="text-emerald-700">Paid {fmtDate(invoice.paid_at)}</span>
        )}
        {invoice.recipient_email && (
          <span>
            → <span className="font-mono">{invoice.recipient_email}</span>
          </span>
        )}
      </div>

      {/* Outstanding balance — prominent for partially_paid */}
      {invoice.status === "partially_paid" && invoice.paid_amount != null && (
        <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[11px] font-semibold text-amber-900 uppercase tracking-wider">
              Outstanding
            </p>
            <p className="text-lg font-bold text-amber-900 leading-none">
              {fmt(invoice.total_amount - invoice.paid_amount)}
            </p>
          </div>
          <p className="text-[11px] text-amber-800">
            Paid {fmt(invoice.paid_amount)} of {fmt(invoice.total_amount)}
          </p>
        </div>
      )}

      {/* Void info */}
      {invoice.status === "void" && (
        <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-800">
          Voided{invoice.voided_at ? ` ${fmtDate(invoice.voided_at)}` : ""}
          {invoice.voided_reason ? ` — ${invoice.voided_reason}` : ""}
        </div>
      )}

      {/* Draft inline editor — recipient / dates / discount / notes */}
      {invoice.status === "draft" && (
        <DraftInlineEditor
          invoiceId={invoice.id}
          invoiceDate={invoice.invoice_date}
          dueDate={invoice.due_date}
          recipientName={invoice.recipient_name}
          recipientEmail={invoice.recipient_email}
          discountAmount={invoice.discount_amount}
          invoiceNotes={invoice.invoice_notes}
          updateDraftInvoice={invoiceActions.updateDraftInvoice}
        />
      )}

      {/* Line items: editable for drafts, frozen view otherwise (void invoices skip) */}
      {invoice.status !== "void" && (
        <LineItemsEditor
          invoiceId={invoice.id}
          lineItems={invoice.line_items}
          subtotal={invoice.subtotal}
          discountAmount={invoice.discount_amount}
          totalAmount={invoice.total_amount}
          readOnly={invoice.status !== "draft"}
          actions={
            invoice.status === "draft"
              ? {
                  addInvoiceLineItem:    invoiceActions.addInvoiceLineItem,
                  updateInvoiceLineItem: invoiceActions.updateInvoiceLineItem,
                  deleteInvoiceLineItem: invoiceActions.deleteInvoiceLineItem,
                }
              : undefined
          }
        />
      )}

      {/* Snapshot + audit — collapsed by default. Always available for any
          invoice that has been persisted to the new system (drafts included). */}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted hover:text-ink py-1">
          Snapshot &amp; audit details
        </summary>
        <div className="mt-2 space-y-2">
          <SnapshotSummary snapshot={invoice.pricing_snapshot} />
          <AuditPanel invoice={invoice} />
        </div>
      </details>

      {/* Draft warnings — block list + warn list */}
      {invoice.status === "draft" && (() => {
        const warnings = getDraftWarnings(invoice);
        const blocked  = hasBlockingWarning(warnings);
        return (
          <>
            <DraftWarnings warnings={warnings} />

            {/* Draft actions */}
            <div className="flex flex-wrap gap-2 pt-1 items-start">
              <a href={previewHref} target="_blank" rel="noreferrer" className={linkCls}>
                Preview PDF
              </a>

              <FinalizeButton
                invoiceId={invoice.id}
                invoiceNumber={invoice.invoice_number}
                total={invoice.total_amount}
                action={invoiceActions.sendInvoice}
                disabled={blocked}
                disabledReason={
                  blocked ? "Resolve blocking warnings before sending." : undefined
                }
              />

              {/* Delete draft — silent, no reason needed. Draft has no
                  persisted PDF and nothing downstream depends on it. */}
              <div className="ml-auto">
                <InvoiceActionForm
                  action={invoiceActions.deleteDraftInvoice}
                  invoiceId={invoice.id}
                  buttonLabel="Delete Draft"
                  pendingLabel="Deleting…"
                  buttonClassName="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 text-xs px-2 py-1 rounded"
                />
              </div>
            </div>
          </>
        );
      })()}

      {invoice.status === "sent" && (
        <div className="flex flex-wrap gap-2 pt-1 items-start">
          <a href={downloadHref} target="_blank" rel="noreferrer" className={linkCls}>
            Download PDF
          </a>

          {/* Mark Partially Paid */}
          <details className="rounded-md border border-rule bg-canvas px-3 py-2 text-xs">
            <summary className="cursor-pointer font-semibold text-ink">
              Mark Partially Paid
            </summary>
            <div className="mt-2">
              <InvoiceActionForm
                action={invoiceActions.markInvoicePartiallyPaid}
                invoiceId={invoice.id}
                buttonLabel="Record Partial Payment"
                pendingLabel="Recording…"
                buttonClassName="bg-amber-600 text-white hover:bg-amber-700"
              >
                <div>
                  <Label>Amount Paid ($)</Label>
                  <input
                    name="paid_amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    className={inputCls}
                  />
                </div>
              </InvoiceActionForm>
            </div>
          </details>

          {/* Mark Paid */}
          <InvoiceActionForm
            action={invoiceActions.markInvoicePaid}
            invoiceId={invoice.id}
            buttonLabel="Mark Paid"
            pendingLabel="Marking…"
            buttonClassName="bg-emerald-600 text-white hover:bg-emerald-700"
          />

          {/* Void */}
          <details className="rounded-md border border-rule bg-canvas px-3 py-2 text-xs">
            <summary className="cursor-pointer text-red-700 font-semibold">Void Invoice</summary>
            <div className="mt-2">
              <InvoiceActionForm
                action={invoiceActions.voidInvoice}
                invoiceId={invoice.id}
                buttonLabel="Confirm Void"
                pendingLabel="Voiding…"
                buttonClassName="bg-red-600 text-white hover:bg-red-700"
              >
                <input
                  name="voided_reason"
                  required
                  placeholder="Reason (required)"
                  className={inputCls}
                />
              </InvoiceActionForm>
            </div>
          </details>
        </div>
      )}

      {invoice.status === "partially_paid" && (
        <div className="flex flex-wrap gap-2 pt-1 items-start">
          <a href={downloadHref} target="_blank" rel="noreferrer" className={linkCls}>
            Download PDF
          </a>
          <InvoiceActionForm
            action={invoiceActions.markInvoicePaid}
            invoiceId={invoice.id}
            buttonLabel="Mark Paid"
            pendingLabel="Marking…"
            buttonClassName="bg-emerald-600 text-white hover:bg-emerald-700"
          />
          <details className="rounded-md border border-rule bg-canvas px-3 py-2 text-xs">
            <summary className="cursor-pointer text-red-700 font-semibold">Void Invoice</summary>
            <div className="mt-2">
              <InvoiceActionForm
                action={invoiceActions.voidInvoice}
                invoiceId={invoice.id}
                buttonLabel="Confirm Void"
                pendingLabel="Voiding…"
                buttonClassName="bg-red-600 text-white hover:bg-red-700"
              >
                <input
                  name="voided_reason"
                  required
                  placeholder="Reason (required)"
                  className={inputCls}
                />
              </InvoiceActionForm>
            </div>
          </details>
        </div>
      )}

      {invoice.status === "paid" && (
        <div className="flex flex-wrap gap-2 pt-1 items-start">
          <a href={downloadHref} target="_blank" rel="noreferrer" className={linkCls}>
            Download PDF
          </a>
          <details className="rounded-md border border-rule bg-canvas px-3 py-2 text-xs">
            <summary className="cursor-pointer text-red-700 font-semibold">Void Invoice</summary>
            <div className="mt-2">
              <InvoiceActionForm
                action={invoiceActions.voidInvoice}
                invoiceId={invoice.id}
                buttonLabel="Confirm Void"
                pendingLabel="Voiding…"
                buttonClassName="bg-red-600 text-white hover:bg-red-700"
              >
                <input
                  name="voided_reason"
                  required
                  placeholder="Reason (required)"
                  className={inputCls}
                />
              </InvoiceActionForm>
            </div>
          </details>
        </div>
      )}

      {/* void: no actions */}
    </div>
  );
}

function InvoiceSection({
  project,
  invoices,
  invoiceActions,
  pricingResolution,
}: {
  project: PricingReviewProject;
  invoices: InvoiceWithItems[];
  invoiceActions: InvoiceActions;
  pricingResolution: PricingResolution;
}) {
  const nonVoidExists = invoices.some((i) => i.status !== "void");
  const orderedInvoices = orderInvoicesForDisplay(invoices);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-base font-semibold text-ink">Invoices</p>
          {nonVoidExists && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 uppercase tracking-wider">
              Active
            </span>
          )}
        </div>
        {nonVoidExists && (
          <span className="text-[11px] text-muted">
            Controls below manage this project&apos;s billing.
          </span>
        )}
      </div>

      {invoices.length === 0 ? (
        <PricingReviewPanel
          projectId={project.id}
          project={project}
          resolution={pricingResolution}
          createInvoiceFromProject={invoiceActions.createInvoiceFromProject}
        />
      ) : (
        <div className="space-y-3">
          {orderedInvoices.map((inv) => (
            <InvoiceCard
              key={inv.id}
              invoice={inv}
              invoiceActions={invoiceActions}
              isSupplemental={inv.parent_invoice_id != null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function BillingPanel({
  project,
  invoices,
  invoiceActions,
  pricingResolution,
}: Props) {
  return (
    <div className="space-y-5">
      <InvoiceSection
        project={project}
        invoices={invoices}
        invoiceActions={invoiceActions}
        pricingResolution={pricingResolution}
      />
    </div>
  );
}
