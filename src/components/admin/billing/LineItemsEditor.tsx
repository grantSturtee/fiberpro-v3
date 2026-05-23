"use client";

/**
 * LineItemsEditor (Phase E2)
 *
 * Inline line-item table for an invoice. Two modes:
 *   - readOnly=true  → frozen list display (sent/paid/partially_paid/void)
 *   - readOnly=false → editable rows + an Add row at the bottom (draft only)
 *
 * Each editable row is its own form (save) plus a tiny sibling delete form,
 * each with its own useActionState. The Add row is a third form. Subtotal,
 * discount, and total render below the table.
 *
 * After any mutation, the action calls revalidatePath; the parent re-renders
 * with the fresh `lineItems` array and `subtotal`/`total`. Form state is
 * intentionally local so feedback for one row doesn't clobber another.
 */

import { useActionState } from "react";
import type { InvoiceLineItem } from "@/types/invoice";
import type { InvoiceActionState } from "@/app/(admin)/admin/invoices/actions";

type EditorActions = {
  addInvoiceLineItem:    (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  updateInvoiceLineItem: (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  deleteInvoiceLineItem: (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
};

type Props = {
  invoiceId: string;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  readOnly: boolean;
  actions?: EditorActions;       // required when readOnly === false
};

function fmtMoney(n: number): string {
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

const inputCls =
  "w-full text-xs border border-rule rounded px-1.5 py-1 bg-background text-ink focus:outline-none focus:ring-1 focus:ring-primary";
const labelCls =
  "text-[10px] font-semibold text-muted uppercase tracking-wider";

// ── Header row ────────────────────────────────────────────────────────────────

function HeaderRow({ editable }: { editable: boolean }) {
  return (
    <div
      className={`grid ${editable
        ? "grid-cols-[1fr_60px_90px_90px_auto_auto]"
        : "grid-cols-[1fr_60px_90px_90px]"} gap-2 px-2 py-1.5 bg-canvas`}
    >
      <span className={labelCls}>Description</span>
      <span className={`${labelCls} text-right`}>Qty</span>
      <span className={`${labelCls} text-right`}>Unit Price</span>
      <span className={`${labelCls} text-right`}>Total</span>
      {editable && <span className={labelCls}>Save</span>}
      {editable && <span className={labelCls}>{" "}</span>}
    </div>
  );
}

// ── One editable row ──────────────────────────────────────────────────────────

function EditableRow({
  item,
  updateInvoiceLineItem,
  deleteInvoiceLineItem,
}: {
  item: InvoiceLineItem;
  updateInvoiceLineItem: EditorActions["updateInvoiceLineItem"];
  deleteInvoiceLineItem: EditorActions["deleteInvoiceLineItem"];
}) {
  const [updState, updFormAction, updPending] = useActionState(updateInvoiceLineItem, { error: null });
  const [delState, delFormAction, delPending] = useActionState(deleteInvoiceLineItem, { error: null });

  return (
    <div className="grid grid-cols-[1fr_60px_90px_90px_auto_auto] gap-2 px-2 py-1.5 items-start border-t border-surface">
      <form action={updFormAction} className="contents">
        <input type="hidden" name="item_id" value={item.id} />
        <input
          type="text"
          name="description"
          defaultValue={item.description}
          required
          className={inputCls}
          aria-label="Description"
        />
        <input
          type="number"
          name="quantity"
          step="0.01"
          min="0"
          defaultValue={item.quantity}
          required
          className={`${inputCls} text-right`}
          aria-label="Quantity"
        />
        <input
          type="number"
          name="unit_price"
          step="0.01"
          defaultValue={item.unit_price}
          required
          className={`${inputCls} text-right`}
          aria-label="Unit price"
        />
        <p className="text-xs text-ink text-right pt-1 font-medium">
          {fmtMoney(item.line_total)}
        </p>
        <button
          type="submit"
          disabled={updPending}
          className="px-2 py-1 rounded text-[10px] font-semibold bg-canvas text-dim border border-rule hover:bg-wash hover:text-ink disabled:opacity-50"
        >
          {updPending ? "…" : "Save"}
        </button>
      </form>
      <form action={delFormAction}>
        <input type="hidden" name="item_id" value={item.id} />
        <button
          type="submit"
          disabled={delPending}
          title="Delete line item"
          aria-label="Delete line item"
          className="px-2 py-1 rounded text-[10px] font-semibold bg-canvas text-red-700 border border-rule hover:bg-red-50 disabled:opacity-50"
        >
          {delPending ? "…" : "×"}
        </button>
      </form>

      {(updState.error || delState.error) && (
        <p className="col-span-6 text-[10px] text-red-600 px-1">
          {updState.error ?? delState.error}
        </p>
      )}
    </div>
  );
}

// ── Add row (always at bottom in editable mode) ───────────────────────────────

function AddRow({
  invoiceId,
  addInvoiceLineItem,
  nextSortOrder,
}: {
  invoiceId: string;
  addInvoiceLineItem: EditorActions["addInvoiceLineItem"];
  nextSortOrder: number;
}) {
  const [state, formAction, pending] = useActionState(addInvoiceLineItem, { error: null });

  // Key on the success message so the form remounts (clears its inputs) after
  // each successful add.
  const formKey = state.success ?? "new";

  return (
    <div className="grid grid-cols-[1fr_60px_90px_90px_auto_auto] gap-2 px-2 py-1.5 items-start border-t border-rule bg-canvas/50">
      <form key={formKey} action={formAction} className="contents">
        <input type="hidden" name="invoice_id" value={invoiceId} />
        <input type="hidden" name="sort_order" value={String(nextSortOrder)} />
        <input
          type="text"
          name="description"
          required
          placeholder="New line item…"
          className={inputCls}
          aria-label="New item description"
        />
        <input
          type="number"
          name="quantity"
          step="0.01"
          min="0"
          defaultValue="1"
          required
          className={`${inputCls} text-right`}
          aria-label="New item quantity"
        />
        <input
          type="number"
          name="unit_price"
          step="0.01"
          required
          placeholder="0.00"
          className={`${inputCls} text-right`}
          aria-label="New item unit price"
        />
        <p className="text-[10px] text-muted text-right pt-1.5">(auto)</p>
        <button
          type="submit"
          disabled={pending}
          className="px-2 py-1 rounded text-[10px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add"}
        </button>
        <span aria-hidden />
      </form>

      {state.error && (
        <p className="col-span-6 text-[10px] text-red-600 px-1">{state.error}</p>
      )}
    </div>
  );
}

// ── Read-only row ─────────────────────────────────────────────────────────────

function ReadOnlyRow({ item }: { item: InvoiceLineItem }) {
  return (
    <div className="grid grid-cols-[1fr_60px_90px_90px] gap-2 px-2 py-1.5 items-center border-t border-surface">
      <span className="text-xs text-ink truncate">{item.description}</span>
      <span className="text-xs text-dim text-right">
        {Number.isInteger(item.quantity) ? item.quantity : item.quantity.toFixed(2)}
      </span>
      <span className="text-xs text-dim text-right">{fmtMoney(item.unit_price)}</span>
      <span className="text-xs text-ink text-right font-medium">{fmtMoney(item.line_total)}</span>
    </div>
  );
}

// ── Totals footer ─────────────────────────────────────────────────────────────

function TotalsFooter({
  subtotal,
  discount,
  total,
}: {
  subtotal: number;
  discount: number;
  total: number;
}) {
  return (
    <div className="px-2 py-2 border-t border-rule bg-canvas space-y-0.5">
      <div className="flex justify-between text-xs text-dim">
        <span>Subtotal</span>
        <span>{fmtMoney(subtotal)}</span>
      </div>
      {discount > 0 && (
        <div className="flex justify-between text-xs text-red-700">
          <span>Discount</span>
          <span>−{fmtMoney(discount)}</span>
        </div>
      )}
      <div className="flex justify-between text-sm font-semibold text-ink pt-1 border-t border-surface">
        <span>Total</span>
        <span>{fmtMoney(total)}</span>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function LineItemsEditor({
  invoiceId,
  lineItems,
  subtotal,
  discountAmount,
  totalAmount,
  readOnly,
  actions,
}: Props) {
  const editable = !readOnly && actions != null;
  const nextSortOrder =
    lineItems.length === 0
      ? 0
      : Math.max(...lineItems.map((i) => i.sort_order)) + 1;

  return (
    <div className="border border-rule rounded-md overflow-hidden bg-background">
      <HeaderRow editable={editable} />

      {lineItems.length === 0 && (
        <p className="text-xs text-muted px-2 py-3">No line items yet.</p>
      )}

      {lineItems.map((item) =>
        editable && actions ? (
          <EditableRow
            key={item.id}
            item={item}
            updateInvoiceLineItem={actions.updateInvoiceLineItem}
            deleteInvoiceLineItem={actions.deleteInvoiceLineItem}
          />
        ) : (
          <ReadOnlyRow key={item.id} item={item} />
        )
      )}

      {editable && actions && (
        <AddRow
          invoiceId={invoiceId}
          addInvoiceLineItem={actions.addInvoiceLineItem}
          nextSortOrder={nextSortOrder}
        />
      )}

      <TotalsFooter
        subtotal={subtotal}
        discount={discountAmount}
        total={totalAmount}
      />
    </div>
  );
}
