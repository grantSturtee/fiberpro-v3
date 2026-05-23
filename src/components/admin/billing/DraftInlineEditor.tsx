"use client";

/**
 * DraftInlineEditor (Phase E2)
 *
 * Compact inline form for editing a draft invoice's non-line-item fields:
 *   - invoice_date
 *   - due_date
 *   - recipient_name
 *   - recipient_email
 *   - discount_amount
 *   - invoice_notes
 *
 * Used in BOTH the BillingPanel invoice card and the InvoiceListSection's
 * expanded row panel. Each instance gets its own useActionState so save
 * feedback is local. After successful save, the parent action calls
 * revalidatePath and the form re-mounts with the new server state.
 *
 * The submit button only emits fields the admin actually changed (saved
 * fields default-pulled from props on mount). Server action treats absent
 * fields as "unchanged"; present fields are written.
 */

import { useActionState } from "react";
import type { InvoiceActionState } from "@/app/(admin)/admin/invoices/actions";

type Props = {
  invoiceId: string;
  invoiceDate: string;
  dueDate: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  discountAmount: number;
  invoiceNotes: string | null;
  updateDraftInvoice: (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
};

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  // Accept either YYYY-MM-DD or full ISO; both compatible with <input type="date">.
  return iso.length >= 10 ? iso.slice(0, 10) : "";
}

export function DraftInlineEditor({
  invoiceId,
  invoiceDate,
  dueDate,
  recipientName,
  recipientEmail,
  discountAmount,
  invoiceNotes,
  updateDraftInvoice,
}: Props) {
  const [state, formAction, pending] = useActionState(updateDraftInvoice, { error: null });

  const inputCls =
    "w-full text-sm border border-rule rounded-md px-2 py-1.5 bg-background text-ink focus:outline-none focus:ring-1 focus:ring-primary";
  const labelCls =
    "text-[11px] font-semibold text-muted uppercase tracking-wider mb-0.5";

  return (
    <form action={formAction} className="space-y-2.5">
      <input type="hidden" name="invoice_id" value={invoiceId} />

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <p className={labelCls}>Invoice Date</p>
          <input
            type="date"
            name="invoice_date"
            defaultValue={toDateInput(invoiceDate)}
            className={inputCls}
          />
        </div>
        <div>
          <p className={labelCls}>Due Date</p>
          <input
            type="date"
            name="due_date"
            defaultValue={toDateInput(dueDate)}
            className={inputCls}
          />
        </div>
        <div>
          <p className={labelCls}>Recipient Name</p>
          <input
            type="text"
            name="recipient_name"
            defaultValue={recipientName ?? ""}
            placeholder="e.g. Accounts Payable"
            className={inputCls}
          />
        </div>
        <div>
          <p className={labelCls}>Recipient Email</p>
          <input
            type="email"
            name="recipient_email"
            defaultValue={recipientEmail ?? ""}
            placeholder="e.g. ap@client.com"
            className={inputCls}
          />
        </div>
        <div>
          <p className={labelCls}>Discount ($)</p>
          <input
            type="number"
            name="discount_amount"
            step="0.01"
            min="0"
            defaultValue={discountAmount > 0 ? discountAmount : ""}
            placeholder="0.00"
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <p className={labelCls}>Internal Notes</p>
        <textarea
          name="invoice_notes"
          defaultValue={invoiceNotes ?? ""}
          rows={2}
          className={`${inputCls} resize-none`}
          placeholder="Internal-only; not visible to client."
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px]">
          {state.error   && <span className="text-red-600">{state.error}</span>}
          {state.success && <span className="text-green-700">{state.success}</span>}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {pending ? "Saving…" : "Save Details"}
        </button>
      </div>
    </form>
  );
}
