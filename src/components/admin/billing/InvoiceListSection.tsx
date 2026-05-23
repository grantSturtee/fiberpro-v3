"use client";

/**
 * Invoice list section for /admin/billing.
 *
 * Operational queue layout — table with checkboxes, lightweight filters,
 * per-row quick actions, and a bulk PDF ZIP download for selected rows.
 *
 * Filters:
 *   * Text search:  matches invoice_number, project_job_number,
 *                   project_job_name, company_name (case-insensitive).
 *   * Status chip:  one of "all", "unpaid", "draft", "sent", "paid", "void".
 *                   "unpaid" = sent OR partially_paid.
 *
 * Selection:
 *   * Per-row checkbox; "select all visible" via header checkbox.
 *   * Bulk download submits a regular form POST to /api/invoices/bulk-download
 *     with one hidden invoice_ids[] entry per selected ID. Browser receives
 *     application/zip with Content-Disposition: attachment and saves it
 *     without leaving the page.
 *
 * Per-row inline actions:
 *   * Open project (link)
 *   * Preview PDF (drafts) / Download PDF (everything else)
 *   * Finalize & Send (drafts; minimal form — uses persisted recipient/notes
 *     if previously set, otherwise blank)
 *   * Mark Partially Paid (sent only; small inline amount input)
 *   * Mark Paid (sent / partially_paid)
 *
 * Each form uses its own useActionState so error/success state stays local.
 */

import { useMemo, useState } from "react";
import { useActionState } from "react";
import Link from "next/link";
import type { InvoiceListRow } from "@/lib/queries/invoices";
import type { InvoiceStatus } from "@/types/invoice";
import type { InvoiceActionState } from "@/app/(admin)/admin/invoices/actions";
import { DraftInlineEditor } from "./DraftInlineEditor";
import { LineItemsEditor } from "./LineItemsEditor";
import { DraftWarnings } from "./DraftWarnings";
import { SnapshotSummary } from "./SnapshotSummary";
import { AuditPanel } from "./AuditPanel";
import { FinalizeButton } from "./FinalizeButton";
import { getDraftWarnings, hasBlockingWarning } from "./warnings";

type StatusFilter = "all" | "unpaid" | "draft" | "sent" | "paid" | "void";

type Props = {
  rows: InvoiceListRow[];
  // Phase E1 actions
  sendInvoice:              (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  markInvoicePartiallyPaid: (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  markInvoicePaid:          (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  // Phase E2 inline draft editing
  updateDraftInvoice:       (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  addInvoiceLineItem:       (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  updateInvoiceLineItem:    (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  deleteInvoiceLineItem:    (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric",
    });
  } catch { return iso; }
}

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft:          "Draft",
  sent:           "Sent",
  partially_paid: "Partially Paid",
  paid:           "Paid",
  void:           "Voided",
  hold:           "On Hold",
};

const STATUS_COLOR: Record<InvoiceStatus, string> = {
  draft:          "bg-blue-50 text-blue-700",
  sent:           "bg-blue-100 text-blue-800",
  partially_paid: "bg-amber-50 text-amber-800",
  paid:           "bg-emerald-100 text-emerald-800",
  void:           "bg-red-50 text-red-700",
  hold:           "bg-red-50 text-red-700",
};

function isUnpaid(status: InvoiceStatus): boolean {
  return status === "sent" || status === "partially_paid";
}

// ── Inline action wrapper ─────────────────────────────────────────────────────

function ActionForm({
  action,
  invoiceId,
  buttonLabel,
  pendingLabel,
  buttonClassName,
  children,
}: {
  action: (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  invoiceId: string;
  buttonLabel: string;
  pendingLabel?: string;
  buttonClassName: string;
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      {children}
      <button
        type="submit"
        disabled={pending}
        className={`${buttonClassName} disabled:opacity-50 transition-colors`}
      >
        {pending ? (pendingLabel ?? "…") : buttonLabel}
      </button>
      {state.error && <p className="text-[10px] text-red-600 max-w-[180px]">{state.error}</p>}
    </form>
  );
}

// ── Row actions ───────────────────────────────────────────────────────────────

function RowActions({
  row,
  sendInvoice,
  markInvoicePartiallyPaid,
  markInvoicePaid,
}: {
  row: InvoiceListRow;
  sendInvoice:              Props["sendInvoice"];
  markInvoicePartiallyPaid: Props["markInvoicePartiallyPaid"];
  markInvoicePaid:          Props["markInvoicePaid"];
}) {
  const linkCls =
    "px-2 py-0.5 rounded-md text-[10px] font-semibold bg-canvas text-dim border border-rule hover:bg-wash hover:text-ink transition-colors";
  const btnCls = (color: string) =>
    `px-2 py-0.5 rounded-md text-[10px] font-semibold ${color} text-white hover:opacity-90 transition-opacity`;
  const inputCls =
    "w-full text-xs border border-rule rounded px-1.5 py-0.5 bg-background text-ink focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="flex flex-wrap gap-1.5 items-start justify-end">
      <Link href={`/admin/projects/${row.project_id}#section-billing`} className={linkCls}>
        Open
      </Link>

      {row.status === "draft" ? (
        <a
          href={`/api/invoices/${row.id}/preview`}
          target="_blank"
          rel="noreferrer"
          className={linkCls}
        >
          Preview
        </a>
      ) : (
        <a
          href={`/api/invoices/${row.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className={linkCls}
        >
          PDF
        </a>
      )}

      {row.status === "draft" && (() => {
        // Row-level Send: same FinalizeButton (confirm + warning block).
        const warnings = getDraftWarnings(row);
        const blocked  = hasBlockingWarning(warnings);
        return (
          <FinalizeButton
            invoiceId={row.id}
            invoiceNumber={row.invoice_number}
            total={row.total_amount}
            action={sendInvoice}
            disabled={blocked}
            disabledReason={
              blocked ? "Resolve blocking warnings (expand row for details)." : undefined
            }
            size="small"
          />
        );
      })()}

      {row.status === "sent" && (
        <details className="rounded-md border border-rule bg-canvas px-1.5 py-0.5 text-[11px]">
          <summary className="cursor-pointer font-semibold text-ink">Partial</summary>
          <div className="mt-1.5 min-w-[140px]">
            <ActionForm
              action={markInvoicePartiallyPaid}
              invoiceId={row.id}
              buttonLabel="Record"
              pendingLabel="…"
              buttonClassName={btnCls("bg-amber-600")}
            >
              <input
                name="paid_amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="Amount paid"
                className={inputCls}
              />
            </ActionForm>
          </div>
        </details>
      )}

      {(row.status === "sent" || row.status === "partially_paid") && (
        <ActionForm
          action={markInvoicePaid}
          invoiceId={row.id}
          buttonLabel="Mark Paid"
          pendingLabel="…"
          buttonClassName={btnCls("bg-emerald-600")}
        />
      )}
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export function InvoiceListSection({
  rows,
  sendInvoice,
  markInvoicePartiallyPaid,
  markInvoicePaid,
  updateDraftInvoice,
  addInvoiceLineItem,
  updateInvoiceLineItem,
  deleteInvoiceLineItem,
}: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Filtering (in-memory; ~200 rows max) ────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === "unpaid"  && !isUnpaid(r.status)) return false;
      if (statusFilter !== "all" && statusFilter !== "unpaid" && r.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        r.invoice_number,
        r.project_job_number,
        r.project_job_name,
        r.company_name,
        r.recipient_email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search, statusFilter]);

  // ── Selection helpers ───────────────────────────────────────────────────────
  // Only rows with a persisted PDF (i.e. not drafts) are selectable for bulk
  // download. The UI hides the checkbox for drafts entirely.
  const selectableIds = useMemo(
    () => filtered.filter((r) => r.pdf_storage_path != null).map((r) => r.id),
    [filtered]
  );
  const allVisibleSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const someVisibleSelected =
    !allVisibleSelected && selectableIds.some((id) => selected.has(id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllVisible() {
    if (allVisibleSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of selectableIds) next.delete(id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of selectableIds) next.add(id);
        return next;
      });
    }
  }
  function clearSelection() {
    setSelected(new Set());
  }

  // ── Counts for filter chips ─────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: rows.length,
      unpaid: 0,
      draft: 0,
      sent: 0,
      paid: 0,
      void: 0,
    };
    for (const r of rows) {
      if (isUnpaid(r.status)) c.unpaid++;
      if (r.status === "draft")          c.draft++;
      else if (r.status === "sent")      c.sent++;
      else if (r.status === "paid")      c.paid++;
      else if (r.status === "void")      c.void++;
    }
    return c;
  }, [rows]);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-ink">
          Invoices
          <span className="ml-2 text-xs font-normal text-muted">
            {rows.length} total
          </span>
        </h2>
      </div>

      {/* Filter bar — sticky so it stays in view while scrolling long lists */}
      <div className="sticky top-0 z-10 bg-background -mx-1 px-1 py-2 border-b border-surface">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice #, project, company, email…"
            className="flex-1 min-w-[220px] text-sm border border-rule rounded-md px-3 py-1.5 bg-background text-ink focus:outline-none focus:ring-1 focus:ring-primary"
          />

          <FilterChip
            active={statusFilter === "all"}
            label={`All (${counts.all})`}
            onClick={() => setStatusFilter("all")}
          />
          <FilterChip
            active={statusFilter === "unpaid"}
            label={`Unpaid (${counts.unpaid})`}
            tone="amber"
            onClick={() => setStatusFilter("unpaid")}
          />
          <FilterChip
            active={statusFilter === "draft"}
            label={`Draft (${counts.draft})`}
            tone="blue"
            onClick={() => setStatusFilter("draft")}
          />
          <FilterChip
            active={statusFilter === "sent"}
            label={`Sent (${counts.sent})`}
            onClick={() => setStatusFilter("sent")}
          />
          <FilterChip
            active={statusFilter === "paid"}
            label={`Paid (${counts.paid})`}
            tone="green"
            onClick={() => setStatusFilter("paid")}
          />
          <FilterChip
            active={statusFilter === "void"}
            label={`Voided (${counts.void})`}
            tone="red"
            onClick={() => setStatusFilter("void")}
          />
        </div>

        {/* Selection summary + bulk download */}
        {selected.size > 0 && (
          <div className="mt-2 flex items-center justify-between gap-3 bg-blue-50 border border-blue-200 rounded-md px-3 py-2 flex-wrap">
            <p className="text-xs text-blue-900 font-medium">
              {selected.size} invoice{selected.size === 1 ? "" : "s"} selected
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearSelection}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-canvas text-dim border border-rule hover:bg-wash hover:text-ink transition-colors"
              >
                Clear
              </button>
              <form
                action="/api/invoices/bulk-download"
                method="POST"
                className="inline-flex"
              >
                {Array.from(selected).map((id) => (
                  <input key={id} type="hidden" name="invoice_ids" value={id} />
                ))}
                <button
                  type="submit"
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-700 text-white hover:bg-blue-800 transition-colors"
                >
                  Download ZIP
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-canvas border border-rule rounded-lg px-5 py-8 text-center">
          <p className="text-sm text-muted">
            {rows.length === 0
              ? "No invoices yet — create one from the queue above when a project is ready."
              : "No invoices match your filters. Clear the search or status chip to see everything."}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-xl overflow-hidden border border-rule">
          {/* Header */}
          <div className="grid grid-cols-[24px_32px_minmax(140px,1fr)_minmax(180px,1.2fr)_minmax(160px,1fr)_90px_100px_90px_90px_minmax(220px,1.4fr)] gap-3 px-4 py-2 bg-canvas text-[10px] font-semibold text-muted uppercase tracking-wider items-center">
            <span aria-hidden />
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                ref={(el) => { if (el) el.indeterminate = someVisibleSelected; }}
                onChange={toggleAllVisible}
                aria-label="Select all visible invoices"
                className="cursor-pointer"
              />
            </div>
            <span>Invoice #</span>
            <span>Project</span>
            <span>Company</span>
            <span>Status</span>
            <span className="text-right">Amount</span>
            <span>Sent</span>
            <span>Paid</span>
            <span className="text-right">Actions</span>
          </div>

          {/* Rows + expansion panels */}
          <div>
            {filtered.map((row) => {
              const isSelectable = row.pdf_storage_path != null;
              const isChecked    = selected.has(row.id);
              const isExpanded   = expanded.has(row.id);

              // Highlight unpaid (amber-ish) and draft (blue-ish) rows.
              const rowTint =
                row.status === "draft"
                  ? "bg-blue-50/40"
                  : isUnpaid(row.status)
                  ? "bg-amber-50/30"
                  : "";

              return (
                <div key={row.id} className="border-b border-surface last:border-b-0">
                  <div
                    className={`grid grid-cols-[24px_32px_minmax(140px,1fr)_minmax(180px,1.2fr)_minmax(160px,1fr)_90px_100px_90px_90px_minmax(220px,1.4fr)] gap-3 px-4 py-2.5 items-center hover:bg-surface/40 transition-colors ${rowTint}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpanded(row.id)}
                      className="flex items-center justify-center w-5 h-5 rounded text-muted hover:text-ink hover:bg-canvas transition-colors"
                      aria-label={isExpanded ? "Collapse row" : "Expand row"}
                      aria-expanded={isExpanded}
                    >
                      <svg
                        width="10" height="10" viewBox="0 0 10 10"
                        className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        aria-hidden
                      >
                        <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>

                    <div className="flex items-center">
                      {isSelectable ? (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleOne(row.id)}
                          aria-label={`Select invoice ${row.invoice_number}`}
                          className="cursor-pointer"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="block w-3 h-3 rounded-sm border border-rule bg-canvas opacity-40"
                          title="Drafts cannot be bulk-downloaded"
                        />
                      )}
                    </div>

                    <span className="text-xs font-mono font-semibold text-ink truncate">
                      {row.invoice_number}
                      {row.parent_invoice_id && (
                        <span className="ml-1 text-[10px] font-normal text-muted">↳</span>
                      )}
                    </span>

                    <div className="min-w-0">
                      <Link
                        href={`/admin/projects/${row.project_id}#section-billing`}
                        className="text-xs font-medium text-ink hover:text-primary truncate block transition-colors"
                      >
                        {row.project_job_name || "—"}
                      </Link>
                      <p className="text-[10px] text-muted font-mono truncate">
                        {row.project_job_number}
                      </p>
                    </div>

                    <p className="text-xs text-dim truncate">{row.company_name ?? "—"}</p>

                    <div className="flex items-center gap-1">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_COLOR[row.status]}`}
                      >
                        {STATUS_LABEL[row.status]}
                      </span>
                      {row.status === "draft" && (
                        <span
                          className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold bg-blue-50 text-blue-700"
                          title="Draft is editable"
                        >
                          ✎
                        </span>
                      )}
                      {(row.status === "sent" ||
                        row.status === "partially_paid" ||
                        row.status === "paid") && (
                        <span
                          className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700"
                          title="Frozen PDF — invoice cannot be edited"
                        >
                          🔒
                        </span>
                      )}
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-ink font-medium">{fmtMoney(row.total_amount)}</p>
                      {row.status === "partially_paid" && row.paid_amount != null && (
                        <p className="text-[10px] text-amber-800 font-medium">
                          {fmtMoney(row.total_amount - row.paid_amount)} due
                        </p>
                      )}
                    </div>

                    <p className="text-[11px] text-muted">{fmtDate(row.sent_at)}</p>
                    <p className="text-[11px] text-muted">
                      {row.paid_at ? <span className="text-emerald-700">{fmtDate(row.paid_at)}</span> : "—"}
                    </p>

                    <RowActions
                      row={row}
                      sendInvoice={sendInvoice}
                      markInvoicePartiallyPaid={markInvoicePartiallyPaid}
                      markInvoicePaid={markInvoicePaid}
                    />
                  </div>

                  {/* Expansion panel */}
                  {isExpanded && (
                    <ExpansionPanel
                      row={row}
                      updateDraftInvoice={updateDraftInvoice}
                      addInvoiceLineItem={addInvoiceLineItem}
                      updateInvoiceLineItem={updateInvoiceLineItem}
                      deleteInvoiceLineItem={deleteInvoiceLineItem}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Expansion panel (Phase E2 inline editing / frozen view) ──────────────────

function ExpansionPanel({
  row,
  updateDraftInvoice,
  addInvoiceLineItem,
  updateInvoiceLineItem,
  deleteInvoiceLineItem,
}: {
  row: InvoiceListRow;
  updateDraftInvoice:    (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  addInvoiceLineItem:    (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  updateInvoiceLineItem: (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  deleteInvoiceLineItem: (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
}) {
  const isDraft = row.status === "draft";
  const warnings = isDraft ? getDraftWarnings(row) : [];

  return (
    <div className="px-6 py-4 bg-surface/40 border-t border-surface">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
        {/* Left: warnings + line items + (for drafts) the metadata editor */}
        <div className="space-y-3">
          {isDraft && warnings.length > 0 && <DraftWarnings warnings={warnings} />}

          {isDraft && (
            <div className="bg-canvas border border-rule rounded-md p-3">
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
                Draft Details (editable)
              </p>
              <DraftInlineEditor
                invoiceId={row.id}
                invoiceDate={row.invoice_date}
                dueDate={row.due_date}
                recipientName={row.recipient_name}
                recipientEmail={row.recipient_email}
                discountAmount={row.discount_amount}
                invoiceNotes={row.invoice_notes}
                updateDraftInvoice={updateDraftInvoice}
              />
            </div>
          )}

          {row.status !== "void" && (
            <div>
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">
                Line Items {isDraft ? "(editable)" : "(frozen)"}
              </p>
              <LineItemsEditor
                invoiceId={row.id}
                lineItems={row.line_items}
                subtotal={row.subtotal}
                discountAmount={row.discount_amount}
                totalAmount={row.total_amount}
                readOnly={!isDraft}
                actions={
                  isDraft
                    ? {
                        addInvoiceLineItem,
                        updateInvoiceLineItem,
                        deleteInvoiceLineItem,
                      }
                    : undefined
                }
              />
            </div>
          )}

          {row.status === "void" && (
            <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-800">
              Voided{row.voided_at ? ` ${fmtDate(row.voided_at)}` : ""}
              {row.voided_reason ? ` — ${row.voided_reason}` : ""}
            </div>
          )}
        </div>

        {/* Right: contact + snapshot summary + audit trail */}
        <div className="space-y-3 text-xs">
          <DetailField label="Recipient">
            {row.recipient_name || row.recipient_email ? (
              <>
                {row.recipient_name && <p className="text-ink">{row.recipient_name}</p>}
                {row.recipient_email && (
                  <p className="text-dim font-mono break-all">{row.recipient_email}</p>
                )}
              </>
            ) : (
              <span className="text-faint">—</span>
            )}
          </DetailField>

          {row.status === "partially_paid" && row.paid_amount != null && (
            <DetailField label="Outstanding" tone="amber">
              <p className="text-base font-bold text-amber-900">
                {fmtMoney(row.total_amount - row.paid_amount)}
              </p>
              <p className="text-[10px] text-amber-800">
                Paid {fmtMoney(row.paid_amount)} of {fmtMoney(row.total_amount)}
              </p>
            </DetailField>
          )}

          {row.send_notes && (
            <DetailField label="Send Notes">
              <p className="text-dim whitespace-pre-wrap">{row.send_notes}</p>
            </DetailField>
          )}

          {row.invoice_notes && (
            <DetailField label="Internal Notes">
              <p className="text-dim whitespace-pre-wrap">{row.invoice_notes}</p>
            </DetailField>
          )}

          {/* Phase E3: snapshot + audit */}
          <SnapshotSummary snapshot={row.pricing_snapshot} />
          <AuditPanel invoice={row} />
        </div>
      </div>
    </div>
  );
}

function DetailField({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "amber";
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        tone === "amber"
          ? "bg-amber-50 border border-amber-200 rounded-md px-3 py-2"
          : ""
      }
    >
      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-0.5">
        {label}
      </p>
      {children}
    </div>
  );
}

// ── Filter chip ───────────────────────────────────────────────────────────────

function FilterChip({
  active,
  label,
  tone,
  onClick,
}: {
  active: boolean;
  label: string;
  tone?: "amber" | "blue" | "green" | "red";
  onClick: () => void;
}) {
  const toneCls = active
    ? tone === "amber" ? "bg-amber-600 text-white"
    : tone === "blue"  ? "bg-blue-600 text-white"
    : tone === "green" ? "bg-emerald-600 text-white"
    : tone === "red"   ? "bg-red-600 text-white"
    : "bg-primary text-white"
    : "bg-canvas text-dim border border-rule hover:bg-wash hover:text-ink";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${toneCls}`}
    >
      {label}
    </button>
  );
}
